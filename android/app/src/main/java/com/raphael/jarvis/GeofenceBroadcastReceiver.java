package com.raphael.jarvis;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;
import java.util.List;

/**
 * Reçoit les transitions "entrée dans une zone" enregistrées par
 * GeofencePlugin et affiche une notification avec le rappel — l'app n'a
 * pas besoin d'être ouverte, c'est tout l'intérêt de l'API Geofencing.
 */
public class GeofenceBroadcastReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "jarvis_place_reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) return;
        if (event.getGeofenceTransition() != Geofence.GEOFENCE_TRANSITION_ENTER) return;

        List<Geofence> triggered = event.getTriggeringGeofences();
        if (triggered == null || triggered.isEmpty()) return;

        SharedPreferences prefs = context.getSharedPreferences(GeofencePlugin.PREFS, Context.MODE_PRIVATE);
        ensureChannel(context);

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        for (Geofence geofence : triggered) {
            String stored = prefs.getString(geofence.getRequestId(), null);
            if (stored == null) continue;
            String[] parts = stored.split("\\|", 2);
            String place = parts.length > 0 ? parts[0] : "";
            String reminder = parts.length > 1 ? parts[1] : "";

            Intent openApp = new Intent(context, MainActivity.class);
            openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent contentIntent = PendingIntent.getActivity(
                context, geofence.getRequestId().hashCode(), openApp, flags
            );

            NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Jarvis — " + place)
                .setContentText(reminder)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(reminder))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(contentIntent);

            manager.notify(geofence.getRequestId().hashCode(), notification.build());
        }
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Rappels de lieu", NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Rappels déclenchés en arrivant près d'un lieu enregistré.");
        manager.createNotificationChannel(channel);
    }
}
