package com.raphael.jarvis;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;

/**
 * Ce que Jarvis a le droit de faire sur le téléphone, en un seul endroit.
 *
 * Demande de Raphaël, 5 sept. 2026 : « quand on installe l'application, on
 * fait une sélection directement des autorisations via le téléphone
 * directement ». Jusqu'ici chaque autorisation était demandée à la première
 * utilisation de la fonction concernée — donc par surprise, au milieu d'une
 * phrase, et une seule fois : refusée, Android ne la redemande PLUS JAMAIS et
 * l'app n'a aucun moyen de le signaler. C'est le piège déjà rencontré avec
 * les notifications.
 *
 * Ce plugin ne fait que TROIS choses, et surtout pas plus : dire l'état réel
 * de chaque autorisation, en demander plusieurs d'un coup, et ouvrir le bon
 * écran d'Android quand la demande n'est plus possible. Le classement par
 * usage (« appeler et écrire à tes contacts » plutôt que READ_CONTACTS) vit
 * côté JS, dans src/lib/autorisationsTelephone.ts.
 */
@CapacitorPlugin(
    name = "Autorisations",
    permissions = {
        @Permission(alias = "micro", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }),
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "telephone", strings = { Manifest.permission.CALL_PHONE }),
        @Permission(alias = "position", strings = {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        }),
        @Permission(alias = "position_fond", strings = { "android.permission.ACCESS_BACKGROUND_LOCATION" })
    }
)
public class AutorisationsPlugin extends Plugin {

    /**
     * Les autorisations qu'on sait demander à l'exécution, dans l'ordre où
     * l'écran les présente. Les « accès spéciaux » (installer une mise à
     * jour) ne sont pas ici : ils ne passent pas par une fenêtre de demande
     * mais par un écran de réglages.
     */
    private static final String[] RUNTIME = {
        "micro", "notifications", "contacts", "telephone", "position", "position_fond"
    };

    /**
     * Mémoire des autorisations déjà demandées une fois.
     *
     * Sans elle, impossible de distinguer « jamais demandée » de
     * « définitivement refusée » : Android répond la même chose aux deux
     * (non accordée, et shouldShowRequestPermissionRationale à false). Or
     * l'une se demande d'un bouton et l'autre exige d'ouvrir les réglages
     * système — dire l'un pour l'autre, c'est un bouton qui ne fait rien.
     */
    private SharedPreferences memoire() {
        return getContext().getSharedPreferences("jarvis_autorisations", Context.MODE_PRIVATE);
    }

    private boolean dejaDemandee(String alias) {
        return memoire().getBoolean(alias, false);
    }

    private void noterDemandee(String alias) {
        memoire().edit().putBoolean(alias, true).apply();
    }

    private boolean accordee(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission)
            == PackageManager.PERMISSION_GRANTED;
    }

    /** L'état réel d'une autorisation, tel qu'Android le connaît. */
    private boolean estAccordee(String cle) {
        switch (cle) {
            case "micro":
                return accordee(Manifest.permission.RECORD_AUDIO);
            case "notifications":
                // Pas checkSelfPermission : avant Android 13 POST_NOTIFICATIONS
                // n'existe pas, et surtout Raphaël peut couper les
                // notifications de l'app depuis les réglages système sans que
                // la permission change. areNotificationsEnabled() dit ce qui
                // se passe VRAIMENT, sur toutes les versions.
                return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            case "contacts":
                return accordee(Manifest.permission.READ_CONTACTS);
            case "telephone":
                return accordee(Manifest.permission.CALL_PHONE);
            case "position":
                return accordee(Manifest.permission.ACCESS_FINE_LOCATION)
                    || accordee(Manifest.permission.ACCESS_COARSE_LOCATION);
            case "position_fond":
                // Avant Android 10 la position en arrière-plan est comprise
                // dans la position tout court : il n'y a rien de plus à
                // demander, et afficher une ligne « refusée » serait faux.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return estAccordee("position");
                return accordee("android.permission.ACCESS_BACKGROUND_LOCATION");
            case "installer_maj":
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
                return getContext().getPackageManager().canRequestPackageInstalls();
            default:
                return false;
        }
    }

    /** La permission Android qui porte l'autorisation, pour interroger le
     * système sur un éventuel refus définitif. */
    private String permissionDe(String cle) {
        switch (cle) {
            case "micro": return Manifest.permission.RECORD_AUDIO;
            case "notifications": return "android.permission.POST_NOTIFICATIONS";
            case "contacts": return Manifest.permission.READ_CONTACTS;
            case "telephone": return Manifest.permission.CALL_PHONE;
            case "position": return Manifest.permission.ACCESS_FINE_LOCATION;
            case "position_fond": return "android.permission.ACCESS_BACKGROUND_LOCATION";
            default: return null;
        }
    }

    /**
     * Refusée pour de bon : redemander n'affichera plus rien.
     *
     * Trois conditions, et il faut les trois : pas accordée, déjà demandée
     * une fois par nous, et Android qui ne veut plus qu'on explique pourquoi.
     */
    private boolean estBloquee(String cle) {
        if (estAccordee(cle)) return false;
        String permission = permissionDe(cle);
        if (permission == null) return false;
        if (!dejaDemandee(cle)) return false;
        if (getActivity() == null) return false;
        return !ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), permission);
    }

    private JSObject etatDe(String cle) {
        JSObject o = new JSObject();
        o.put("cle", cle);
        o.put("accordee", estAccordee(cle));
        o.put("bloquee", estBloquee(cle));
        o.put("connue", true);
        return o;
    }

    private JSObject toutLEtat() {
        JSArray liste = new JSArray();
        for (String cle : RUNTIME) liste.put(etatDe(cle));
        liste.put(etatDe("installer_maj"));
        JSObject res = new JSObject();
        res.put("autorisations", liste);
        return res;
    }

    /** L'état de chaque autorisation, sans rien demander à Raphaël. */
    @PluginMethod
    public void etat(PluginCall call) {
        call.resolve(toutLEtat());
    }

    /**
     * Demande plusieurs autorisations d'un coup — c'est tout l'objet de
     * l'écran de premier lancement : une série de fenêtres enchaînées, une
     * seule fois, au lieu d'une demande par surprise chaque fois qu'il
     * essaie une fonction.
     */
    @PluginMethod
    public void demander(PluginCall call) {
        JSArray demandees = call.getArray("cles");
        List<String> voulues;
        try {
            voulues = demandees == null ? new ArrayList<String>() : demandees.toList();
        } catch (Exception e) {
            call.reject("Je n'ai pas compris quelles autorisations demander.");
            return;
        }

        List<String> aDemander = new ArrayList<>();
        for (String cle : RUNTIME) {
            if ("position_fond".equals(cle)) continue;
            if (!voulues.contains(cle)) continue;
            if (estAccordee(cle)) continue;
            // Avant Android 13, POST_NOTIFICATIONS n'existe pas : la demander
            // renvoie un refus immédiat, qu'on prendrait pour un refus de
            // Raphaël et qui bloquerait la ligne pour de bon.
            if ("notifications".equals(cle) && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) continue;
            aDemander.add(cle);
        }

        // La position en arrière-plan ne se demande JAMAIS dans le même lot
        // que la position : à partir d'Android 11 le système rejette
        // silencieusement le groupe entier, et les deux reviennent refusées
        // sans qu'aucune fenêtre ne s'affiche. Elle part donc seule, et
        // seulement une fois la position déjà accordée.
        if (aDemander.isEmpty()
                && voulues.contains("position_fond")
                && estAccordee("position")
                && !estAccordee("position_fond")) {
            aDemander.add("position_fond");
        }

        if (aDemander.isEmpty()) {
            call.resolve(toutLEtat());
            return;
        }
        for (String cle : aDemander) noterDemandee(cle);
        requestPermissionForAliases(aDemander.toArray(new String[0]), call, "apresDemande");
    }

    @PermissionCallback
    private void apresDemande(PluginCall call) {
        call.resolve(toutLEtat());
    }

    /**
     * Ouvre l'écran d'Android qui correspond à une autorisation.
     *
     * Le seul recours quand la demande ne s'affiche plus (refus définitif) ou
     * quand il n'y a jamais eu de fenêtre de demande (accès spéciaux). Sans
     * ça, il faudrait dire à Raphaël d'aller la chercher lui-même dans les
     * réglages du téléphone — exactement ce qu'il ne veut plus faire.
     */
    @PluginMethod
    public void ouvrirEcran(PluginCall call) {
        String cle = call.getString("cle", "");
        Intent intent;
        switch (cle) {
            case "notifications":
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                } else {
                    intent = ficheApplication();
                }
                break;
            case "installer_maj":
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                } else {
                    intent = ficheApplication();
                }
                break;
            default:
                intent = ficheApplication();
                break;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            // L'écran visé n'existe pas sur cette surcouche : la fiche de
            // l'app contient la même chose, au milieu d'autres réglages.
            intent = ficheApplication();
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("Aucun écran de réglages n'a pu être ouvert.");
                return;
            }
        }
        getContext().startActivity(intent);
        call.resolve();
    }

    private Intent ficheApplication() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        return intent;
    }
}
