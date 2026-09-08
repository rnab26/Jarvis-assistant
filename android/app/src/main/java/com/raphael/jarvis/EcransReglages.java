package com.raphael.jarvis;

import android.content.Context;
import android.content.Intent;

/**
 * Ouvrir un écran des réglages d'Android, sans jamais le demander d'abord.
 *
 * D'OÙ ÇA VIENT. Raphaël, 8 sept. 2026, capture à l'appui : la ligne « Ne pas
 * l'endormir en arrière-plan » de Paramètres › Autorisations du téléphone, son
 * bouton « Ouvrir les réglages d'Android » entouré au feutre rouge, et un mot
 * — « pas fonctionnelle ».
 *
 * LE DÉFAUT, ET IL ÉTAIT PARTOUT. Les trois plugins qui ouvrent un écran de
 * réglages faisaient tous le même pré-contrôle :
 *
 *     if (intent.resolveActivity(pm) == null) { on renonce }
 *
 * `resolveActivity` est soumis au FILTRAGE DE VISIBILITÉ DES PAQUETS
 * d'Android 11 (l'app vise targetSdk 36). Une application ne voit plus, par
 * défaut, que les paquets qu'elle a déclarés dans `<queries>` — et notre
 * manifeste n'y déclare aucune action de réglages : il n'y a que MAIN/LAUNCHER,
 * DIAL, CALL, SENDTO, SEND, VIEW et la musique. La méthode peut donc rendre
 * `null` pour un écran qui EXISTE, et on renonçait sans même essayer. Pire :
 * le repli, la fiche de l'application, repassait par le même pré-contrôle et
 * échouait de la même façon — d'où un bouton parfaitement muet.
 *
 * LA RÈGLE D'ANDROID DEPUIS L'API 30 est d'essayer et d'attraper, pas de
 * demander : `resolveActivity` et `queryIntentActivities` sont filtrés,
 * `startActivity` ne l'est pas. C'est ce que fait cette classe.
 *
 * ET ELLE N'EST PAS QU'UN CONTOURNEMENT DU FILTRAGE : plusieurs écrans de
 * réglages existent mais sont protégés par une permission de signature, et
 * certaines surcouches constructeur en retirent d'autres. `startActivity`
 * lève alors, et il faut passer au suivant — un pré-contrôle qui répond
 * « oui » ne prouve de toute façon pas qu'on a le droit d'ouvrir.
 */
final class EcransReglages {

    private EcransReglages() {}

    /**
     * Essaie les intents dans l'ordre et rend le RANG de celui qui s'est
     * ouvert, ou -1 si aucun n'a marché.
     *
     * Le rang plutôt qu'un booléen : l'appelant dit à Raphaël sur quel écran
     * il vient d'arriver, et ce n'est pas cosmétique — la marche à suivre
     * n'est pas la même selon qu'il tombe sur la fenêtre « Autoriser » ou sur
     * une liste de toutes les applications où il doit encore trouver Jarvis.
     */
    static int ouvrirLePremierQuiRepond(Context contexte, Intent... intents) {
        for (int rang = 0; rang < intents.length; rang++) {
            Intent intent = intents[rang];
            if (intent == null) continue;
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                contexte.startActivity(intent);
                return rang;
            } catch (Exception refus) {
                // ActivityNotFoundException (l'écran n'existe pas sur cette
                // surcouche) ou SecurityException (il existe mais nous est
                // interdit) : dans les deux cas on passe au suivant.
            }
        }
        return -1;
    }
}
