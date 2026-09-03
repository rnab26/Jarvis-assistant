package com.raphael.jarvis;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * Rappels de lieu par géolocalisation réelle (option désactivée par
 * défaut, activée dans Paramètres) : pont JS -> GeofencingClient, l'API
 * Android la plus économe en batterie pour ce besoin — le système réveille
 * l'app aux transitions ENTER/EXIT plutôt que de suivre la position en
 * continu.
 *
 * Portée volontairement réduite (V1) : pas de ré-enregistrement au
 * redémarrage du téléphone (les géofences Android ne survivent pas à un
 * reboot) — syncGeofences() est donc rappelée à chaque ouverture de l'app
 * côté JS, ce qui couvre l'essentiel de l'usage sans la complexité d'un
 * BroadcastReceiver BOOT_COMPLETED.
 */
@CapacitorPlugin(
    name = "Geofence",
    permissions = {
        @com.getcapacitor.annotation.Permission(
            alias = "location",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }
        )
    }
)
public class GeofencePlugin extends Plugin {

    static final String PREFS = "JarvisGeofenceReminders";
    private static final float DEFAULT_RADIUS_METERS = 150f;

    private GeofencingClient geofencingClient;

    @Override
    public void load() {
        geofencingClient = LocationServices.getGeofencingClient(getContext());
    }

    @PluginMethod
    public void requestLocationPermissions(PluginCall call) {
        requestPermissionForAlias("location", call, "onLocationPermissionResult");
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void onLocationPermissionResult(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = getPermissionState("location") == com.getcapacitor.PermissionState.GRANTED;
        result.put("granted", granted);
        // La permission "tout le temps" (background) ne peut pas être demandée
        // dans la même boîte de dialogue à partir d'Android 10+ — un second
        // écran système est nécessaire, ouvert séparément par openLocationSettings().
        result.put(
            "backgroundGranted",
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == PackageManager.PERMISSION_GRANTED
        );
        call.resolve(result);
    }

    @PluginMethod
    public void hasBackgroundPermission(PluginCall call) {
        boolean granted =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /** Ouvre l'écran système "Autoriser tout le temps" — Android ne permet
     * pas de la demander autrement qu'en renvoyant vers les réglages de
     * l'app à partir de la version 11. */
    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(android.net.Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * Remplace l'ensemble des géofences actives par la liste fournie
     * ([{id, place, reminder, lat, lng}]). Écrit aussi le texte de chaque
     * rappel dans SharedPreferences, pour que GeofenceBroadcastReceiver
     * puisse composer la notification sans dépendre du réseau.
     */
    @PluginMethod
    public void syncGeofences(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Permission de localisation non accordée.");
            return;
        }

        JSArray reminders = call.getArray("reminders");
        SharedPreferences.Editor prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        prefs.clear();

        List<Geofence> geofences = new ArrayList<>();
        try {
            for (int i = 0; i < reminders.length(); i++) {
                JSObject entry = JSObject.fromJSONObject(reminders.getJSONObject(i));
                String id = entry.getString("id");
                double lat = entry.getDouble("lat");
                double lng = entry.getDouble("lng");
                String reminderText = entry.getString("reminder");
                String place = entry.getString("place");

                geofences.add(
                    new Geofence.Builder()
                        .setRequestId(id)
                        .setCircularRegion(lat, lng, DEFAULT_RADIUS_METERS)
                        .setExpirationDuration(Geofence.NEVER_EXPIRE)
                        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                        // Évite les déclenchements en boucle si l'utilisateur
                        // reste dans la zone : ~5 min avant un nouveau ENTER.
                        .setLoiteringDelay(0)
                        .build()
                );
                prefs.putString(id, place + "|" + reminderText);
            }
        } catch (JSONException e) {
            call.reject("Format de rappels invalide.", e);
            return;
        }
        prefs.apply();

        PendingIntent pendingIntent = geofencePendingIntent();

        geofencingClient.removeGeofences(pendingIntent).addOnCompleteListener(removeTask -> {
            if (geofences.isEmpty()) {
                call.resolve();
                return;
            }
            GeofencingRequest request = new GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(geofences)
                .build();

            try {
                geofencingClient.addGeofences(request, pendingIntent)
                    .addOnSuccessListener(unused -> call.resolve())
                    .addOnFailureListener(e -> call.reject("Échec d'enregistrement des zones.", e));
            } catch (SecurityException e) {
                call.reject("Permission de localisation manquante.", e);
            }
        });
    }

    @PluginMethod
    public void removeAll(PluginCall call) {
        geofencingClient.removeGeofences(geofencePendingIntent()).addOnCompleteListener(task -> call.resolve());
    }

    private PendingIntent geofencePendingIntent() {
        Intent intent = new Intent(getContext(), GeofenceBroadcastReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(getContext(), 0, intent, flags);
    }
}
