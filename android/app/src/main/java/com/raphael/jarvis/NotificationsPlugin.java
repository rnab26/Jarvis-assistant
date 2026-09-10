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

    /**
     * Combien de temps on laisse au service pour se rebrancher avant de
     * déclarer forfait — même délai, même raison que
     * AccessibilitePlugin.DELAI_CONNEXION_MS (chantier 2bdf61d2, 10 sept.
     * 2026, trouvé en corrigeant le même défaut sur le service d'écran).
     */
    private static final long DELAI_CONNEXION_MS = 2000;

    /**
     * Donne le service au travail demandé, en l'ATTENDANT s'il n'est pas
     * encore relié — et en distinguant les deux échecs, qui n'appellent pas
     * la même réponse :
     *
     *   service_inactif  Raphaël ne l'a pas autorisé (ou Android l'a coupé).
     *                     Il faut aller dans les réglages : c'est vrai.
     *   service_endormi  Il l'a autorisé, mais le service ne s'est pas
     *                     rebranché à temps. L'envoyer dans les réglages n'y
     *                     changerait rien — c'est une panne, pas un oubli.
     *
     * Les confondre, c'est exactement le défaut déjà corrigé sur
     * AccessibilitePlugin.avecService() : ne le réintroduis pas ici.
     */
    private void avecService(PluginCall call, java.util.function.Consumer<JarvisNotificationListenerService> travail) {
        JarvisNotificationListenerService dejaLa = JarvisNotificationListenerService.actif();
        if (dejaLa != null) {
            travail.accept(dejaLa);
            return;
        }
        if (!JarvisNotificationListenerService.estDeclare(getContext())) {
            JSObject reponse = new JSObject();
            reponse.put("disponible", false);
            reponse.put("raison", "service_inactif");
            call.resolve(reponse);
            return;
        }
        new Thread(() -> {
            JarvisNotificationListenerService service =
                JarvisNotificationListenerService.attendreActif(DELAI_CONNEXION_MS);
            if (service == null) {
                JSObject reponse = new JSObject();
                reponse.put("disponible", false);
                reponse.put("raison", "service_endormi");
                call.resolve(reponse);
                return;
            }
            travail.accept(service);
        }, "jarvis-attente-notifications").start();
    }

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
        String paquet = call.getString("paquet", null);
        avecService(call, (service) -> repondreAvecNotifications(call, service, paquet));
    }

    private void repondreAvecNotifications(
        PluginCall call,
        JarvisNotificationListenerService service,
        String paquet
    ) {
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
