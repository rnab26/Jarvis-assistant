package com.raphael.jarvis;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.service.notification.StatusBarNotification;
import java.util.Calendar;

/**
 * Décide si l'une de NOS PROPRES notifications doit être dite à voix haute
 * quand l'app est fermée (chantier 23ee3735), et le fait.
 *
 * Appelée UNIQUEMENT par JarvisNotificationListenerService.onNotificationPosted
 * pour une notification de notre propre paquet — jamais pour une autre
 * application, voir la note de ce fichier-là.
 *
 * PORT VOLONTAIREMENT DUPLIQUÉ de raisonDuSilence/phraseAnnonce
 * (src/lib/notifications/annonceVocale.ts), décision prise avec Raphaël
 * (dev_log, chantier 23ee3735, 7 sept. 2026 au soir) : le TypeScript ne peut
 * s'exécuter que pendant que l'app JS tourne, ce qui est précisément le cas
 * que ce chantier comble. scripts/verifier-annonce-native.ts fait tourner
 * les deux règles sur les mêmes cas et refuse qu'elles divergent — c'est la
 * garantie ici, pas l'unicité du code.
 *
 * `ilSenSertMaintenant` (l'exception qui lève le silence de nuit quand il
 * vient de parler à Jarvis) n'a PAS d'équivalent ici, volontairement : si
 * l'app est fermée, il ne peut pas être en train de s'en servir à l'écran —
 * la moitié de la condition tombe d'elle-même, et l'autre moitié (a-t-il
 * parlé à Jarvis dans le quart d'heure) vit dans l'état JS de journalEcoute,
 * inaccessible ici sans le pont qu'on vient d'éviter.
 */
final class AnnonceApresNotification {

    private AnnonceApresNotification() {}

    /** Ne jamais redire la même notification deux fois de suite (Android
     * republie parfois la même en la mettant à jour). */
    private static volatile String derniereCle = null;

    static void considerer(Context context, StatusBarNotification sbn) {
        // Le service n'est même pas actif : personne n'a demandé cette
        // fonctionnalité, ou Android l'a arrêté. On se tait — la règle
        // générale (rien en arrière-plan) tient toujours par défaut.
        AnnonceService service = AnnonceService.actif();
        if (service == null) return;

        // L'app est à l'écran : le chemin JS (localNotificationReceived,
        // useNotifications.ts) parle déjà. Parler ici aussi ferait entendre
        // la même phrase deux fois.
        if (MainActivity.auPremierPlan) return;

        String cle = sbn.getKey();
        if (cle != null && cle.equals(derniereCle)) return;

        Notification n = sbn.getNotification();
        if (n == null || n.extras == null) return;
        CharSequence titreBrut = n.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence texteBrut = n.extras.getCharSequence(Notification.EXTRA_TEXT);
        String titre = titreBrut == null ? "" : titreBrut.toString().trim();
        String texte = texteBrut == null ? "" : texteBrut.toString().trim();
        if (titre.isEmpty() && texte.isEmpty()) return;

        SharedPreferences prefs =
            context.getSharedPreferences(AnnonceNativePlugin.PREFS, Context.MODE_PRIVATE);
        boolean direAVoixHaute = prefs.getBoolean(AnnonceNativePlugin.CLE_DIRE_A_VOIX_HAUTE, false);
        boolean voixCoupee = prefs.getBoolean(AnnonceNativePlugin.CLE_VOIX_COUPEE, false);
        boolean silenceNuit = prefs.getBoolean(AnnonceNativePlugin.CLE_SILENCE_NUIT, false);
        String silenceDebut = prefs.getString(AnnonceNativePlugin.CLE_SILENCE_DEBUT, "22:30");
        String silenceFin = prefs.getString(AnnonceNativePlugin.CLE_SILENCE_FIN, "07:30");

        if (!direAVoixHaute) return;
        if (voixCoupee) return;
        if (PlageSilencieuse.dansLaPlageSilencieuse(
                Calendar.getInstance(), silenceNuit, silenceDebut, silenceFin)) {
            return;
        }

        // Même fusion que phraseAnnonce : le corps répète souvent le titre,
        // le dire deux fois de suite s'entend.
        String phrase;
        if (texte.isEmpty() || texte.equals(titre)) {
            phrase = titre;
        } else if (titre.isEmpty() || texte.startsWith(titre)) {
            phrase = texte;
        } else {
            phrase = titre + ". " + texte;
        }
        if (phrase.isEmpty()) return;

        derniereCle = cle;
        service.dire(phrase);
    }
}
