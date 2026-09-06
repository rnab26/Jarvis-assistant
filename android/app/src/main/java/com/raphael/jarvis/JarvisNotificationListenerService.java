package com.raphael.jarvis;

import android.app.Notification;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.ArrayList;
import java.util.List;

/**
 * Le service qui permet à Jarvis de lire les notifications des AUTRES
 * applications — le répertoire, un mail arrivé, un message affiché à l'écran.
 *
 * D'OÙ ÇA VIENT ET CE QUE RAPHAËL A ACCEPTÉ (chantier b1b6172d, réponse du
 * 5 sept. 2026, notes du chantier) : « Oui, mais il ne s'en sert que si je le
 * demande. » Il a lu et accepté que l'autorisation Android est TOTALE et
 * PERMANENTE (WhatsApp, banque, messages) — c'est le CODE qui se retient.
 *
 * TROIS RÈGLES NON NÉGOCIABLES, ÉCRITES DANS LA RÉPONSE ELLE-MÊME :
 * 1. Aucune lecture de fond. Ce service n'écoute RIEN en arrière-plan :
 *    onNotificationPosted() et onNotificationRemoved() ne font STRICTEMENT
 *    rien (pas de trace, pas de traitement, pas de mémorisation). La seule
 *    lecture possible est un appel EXPLICITE à lireActives(), déclenché par
 *    une phrase de Raphaël — jamais par une notification qui arrive.
 * 2. Rien n'est stocké en base : lireActives() rend un instantané du moment,
 *    jamais écrit nulle part par ce service. Ce qui EST tracé (quelle app,
 *    quand, à la suite de quelle phrase) vit côté TypeScript
 *    (src/lib/notificationsLues.ts, table journal_ecoute) — jamais le
 *    CONTENU des notifications elles-mêmes.
 * 3. Ce service ne DÉCIDE rien de plus qu'un instantané filtrable par
 *    application : le tri (« qu'est-ce qui compte dans ce bloc ? ») vit côté
 *    TypeScript, comme pour le service d'accessibilité.
 *
 * Même motif que JarvisAccessibiliteService : un accès spécial qu'Android
 * n'accorde que dans un écran de réglages, jamais depuis un bouton de l'app.
 */
public class JarvisNotificationListenerService extends NotificationListenerService {

    private static JarvisNotificationListenerService instance;

    /** Le service réellement relié, ou null — l'état RÉEL, jamais un réglage :
     * Android peut couper ce service sans que l'application en sache rien. */
    public static JarvisNotificationListenerService actif() {
        return instance;
    }

    /** Vrai si Jarvis est dans la liste des « accès aux notifications »
     * d'Android, même si le service n'est pas encore relié. */
    public static boolean estDeclare(Context contexte) {
        String actifs = Settings.Secure.getString(
            contexte.getContentResolver(),
            "enabled_notification_listeners"
        );
        if (actifs == null) return false;
        String nous = contexte.getPackageName() + "/" + JarvisNotificationListenerService.class.getName();
        for (String morceau : actifs.split(":")) {
            if (morceau.equalsIgnoreCase(nous)) return true;
        }
        return false;
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
    }

    @Override
    public void onListenerDisconnected() {
        instance = null;
        super.onListenerDisconnected();
    }

    // AUCUN TRAITEMENT ICI, ET C'EST LA RÈGLE : ce service ne surveille rien
    // en arrière-plan. Une notification qui arrive ne déclenche NI trace, NI
    // lecture, NI stockage. Les deux méthodes existent parce qu'Android les
    // exige (contrat de NotificationListenerService), pas parce qu'elles
    // servent à quelque chose ici.
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {}

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {}

    public static class NotificationLue {
        public final String paquet;
        public final String application;
        public final String titre;
        public final String texte;
        public final long quand;

        NotificationLue(String paquet, String application, String titre, String texte, long quand) {
            this.paquet = paquet;
            this.application = application;
            this.titre = titre;
            this.texte = texte;
            this.quand = quand;
        }
    }

    /**
     * Un instantané des notifications actuellement affichées — rien de plus.
     * Appelée UNIQUEMENT à la demande explicite de Raphaël (via
     * NotificationsPlugin.lire), jamais en tâche de fond.
     *
     * @param paquet Filtre sur une application précise ("com.whatsapp"), ou
     *               null pour tout ce qui est affiché.
     */
    public List<NotificationLue> lireActives(String paquet) {
        List<NotificationLue> resultat = new ArrayList<>();
        StatusBarNotification[] actives;
        try {
            actives = getActiveNotifications();
        } catch (Exception e) {
            return resultat;
        }
        if (actives == null) return resultat;

        PackageManager pm = getPackageManager();
        for (StatusBarNotification sbn : actives) {
            if (sbn == null) continue;
            String pkg = sbn.getPackageName();
            // Jamais nos propres notifications : ce n'est pas ça qu'on lui
            // demande de lire, et ça gonflerait chaque résultat pour rien.
            if (getPackageName().equals(pkg)) continue;
            if (paquet != null && !paquet.isEmpty() && !paquet.equals(pkg)) continue;

            Notification n = sbn.getNotification();
            if (n == null || n.extras == null) continue;
            CharSequence titre = n.extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence texte = n.extras.getCharSequence(Notification.EXTRA_TEXT);
            // Ni titre ni texte : une notification silencieuse (icône seule,
            // notification de service) qui ne dirait rien d'utile lu à voix
            // haute.
            if (titre == null && texte == null) continue;

            String nomApplication = pkg;
            try {
                ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
                nomApplication = pm.getApplicationLabel(info).toString();
            } catch (PackageManager.NameNotFoundException ignored) {
                // Le nom du paquet suffit si l'app a disparu depuis.
            }

            resultat.add(new NotificationLue(
                pkg,
                nomApplication,
                titre == null ? "" : titre.toString(),
                texte == null ? "" : texte.toString(),
                sbn.getPostTime()
            ));
        }
        return resultat;
    }
}
