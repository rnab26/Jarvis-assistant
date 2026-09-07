package com.raphael.jarvis;

import java.util.Calendar;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Port EXACT de `dansLaPlageSilencieuse` (src/lib/notifications/plan.ts),
 * pour la seule raison qui justifie de dupliquer une règle de décision dans
 * ce dépôt (chantier 23ee3735) : décider de parler à voix haute doit pouvoir
 * se faire depuis JarvisNotificationListenerService, qui tourne que la
 * WebView soit vivante ou non — le TypeScript, lui, ne peut être évalué que
 * pendant que l'app JS tourne.
 *
 * NE PAS LAISSER DIVERGER. Toute modification de dansLaPlageSilencieuse doit
 * être reportée ici dans le même travail, et vice versa —
 * scripts/verifier-annonce-native.ts fait tourner les deux sur les mêmes cas
 * et refuse qu'elles répondent différemment.
 */
final class PlageSilencieuse {

    private PlageSilencieuse() {}

    private static final Pattern HEURE = Pattern.compile("^(\\d{1,2}):(\\d{2})$");

    /** Minutes depuis minuit, ou null si la chaîne n'est pas au format HH:MM. */
    static Integer minutesDuJour(String heure) {
        if (heure == null) return null;
        Matcher m = HEURE.matcher(heure.trim());
        if (!m.matches()) return null;
        return Integer.parseInt(m.group(1)) * 60 + Integer.parseInt(m.group(2));
    }

    /**
     * Ce moment tombe-t-il dans la plage silencieuse ?
     *
     * La plage passe minuit dans le cas normal (22:30 -> 07:30) : la
     * comparaison naïve « debut <= t < fin » serait alors toujours fausse.
     * Même logique en deux branches que côté TypeScript.
     */
    static boolean dansLaPlageSilencieuse(
        Calendar moment,
        boolean silenceNuit,
        String silenceDebut,
        String silenceFin
    ) {
        if (!silenceNuit) return false;
        Integer debut = minutesDuJour(silenceDebut);
        Integer fin = minutesDuJour(silenceFin);
        if (debut == null || fin == null || debut.equals(fin)) return false;
        int t = moment.get(Calendar.HOUR_OF_DAY) * 60 + moment.get(Calendar.MINUTE);
        return debut < fin ? (t >= debut && t < fin) : (t >= debut || t < fin);
    }
}
