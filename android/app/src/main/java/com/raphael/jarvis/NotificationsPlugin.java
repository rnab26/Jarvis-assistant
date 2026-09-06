package com.raphael.jarvis;

import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

/**
 * Le pont vers JarvisNotificationListenerService.
 *
 * Comme AccessibilitePlugin : il ne décide rien, il rend l'état RÉEL du
 * service (lu du système, jamais d'un réglage) et un instantané des
 * notifications actuellement affichées. Le tri de ce qui compte dans un
 * instantané vit côté TypeScript (src/lib/notificationsLues.ts).
 */
@CapacitorPlugin(name = "Notifications")
public class NotificationsPlugin extends Plugin {

    /** L'état réel : autorisé dans les réglages d'Android, et relié. */
    @PluginMethod
    public void etat(PluginCall call) {
        JSObject reponse = new JSObject();
        reponse.put("declare", JarvisNotificationListenerService.estDeclare(getContext()));
        reponse.put("actif", JarvisNotificationListenerService.actif() != null);
        call.resolve(reponse);
    }

    /**
     * Ouvre l'écran d'Android où Raphaël accorde l'accès aux notifications.
     *
     * Aucun bouton de l'application ne peut l'accorder à sa place : c'est un
     * accès spécial, comme l'accessibilité ou l'affichage par-dessus les
     * autres applications.
     */
    @PluginMethod
    public void ouvrirReglages(PluginCall call) {
        try {
            Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Je n'arrive pas à ouvrir les réglages d'accès aux notifications.");
        }
    }

    /**
     * Un instantané des notifications affichées, UNIQUEMENT sur cet appel
     * explicite — jamais en tâche de fond (voir le commentaire du service).
     */
    @PluginMethod
    public void lire(PluginCall call) {
        JarvisNotificationListenerService service = JarvisNotificationListenerService.actif();
        if (service == null) {
            JSObject reponse = new JSObject();
            reponse.put("disponible", false);
            reponse.put("raison", "service_inactif");
            call.resolve(reponse);
            return;
        }
        String paquet = call.getString("paquet", null);
        List<JarvisNotificationListenerService.NotificationLue> notifications = service.lireActives(paquet);

        JSArray liste = new JSArray();
        for (JarvisNotificationListenerService.NotificationLue n : notifications) {
            JSObject o = new JSObject();
            o.put("paquet", n.paquet);
            o.put("application", n.application);
            o.put("titre", n.titre);
            o.put("texte", n.texte);
            o.put("quand", n.quand);
            liste.put(o);
        }
        JSObject reponse = new JSObject();
        reponse.put("disponible", true);
        reponse.put("notifications", liste);
        call.resolve(reponse);
    }
}
