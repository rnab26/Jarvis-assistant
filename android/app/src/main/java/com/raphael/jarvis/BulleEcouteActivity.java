package com.raphael.jarvis;

import android.app.ActivityOptions;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

/**
 * Ce qu'un appui sur la bulle ouvre depuis le 15 sept. 2026 : le micro de
 * Jarvis, SANS FENÊTRE.
 *
 * SA DÉCISION, mot pour mot : « Moi l'utilisateur j'appuie pour activer
 * jarvis ». Pas la fenêtre d'assistance (AssistOverlayActivity, un tiers
 * d'écran assombri) : ça, c'est l'appui long sur la touche latérale, un
 * chemin différent qui reste inchangé. Ici, un appui active ou désactive le
 * micro, et c'est la bulle elle-même (son icône, dans BulleService) qui
 * montre qu'elle écoute — jamais un écran qui s'ouvre.
 *
 * POURQUOI UNE ACTIVITY QUAND MÊME, alors que la demande est « sans
 * fenêtre » : le micro tourne dans le WebView (JS, useSpeechRecognition),
 * pas dans le service natif de la bulle. Il faut donc un pont Capacitor
 * quelque part pour l'atteindre. Piste (a) retenue dans la note du chantier
 * plutôt que (b) (un SpeechRecognizer natif dans le service, qui obligerait
 * à rapatrier toutes les actions vocales hors du JS) : une fenêtre la plus
 * INVISIBLE possible — transparente, sans détail, réduite à quelques pixels
 * dans un coin — plutôt qu'un tiers d'écran assombri. Ce n'est pas
 * rigoureusement « aucune fenêtre » (Android bascule quand même la tâche au
 * premier plan le temps de l'écoute), mais c'est le compromis le plus proche
 * atteignable sans réécrire toute la reconnaissance vocale en natif — NON
 * VÉRIFIÉ SUR UN VRAI TÉLÉPHONE, à ajuster une fois vu chez Raphaël plutôt
 * que deviné une deuxième fois ici.
 *
 * MÊME MÉCANISME QUE LE WIDGET ET L'APPUI LONG pour démarrer l'écoute sans
 * retoucher le micro : JarvisWidgetPlugin.demarrerEcoute, lu une fois par
 * MicButton à son montage. Et MÊME MÉCANISME QUE AssistOverlayPlugin.fermer()
 * pour se refermer d'elle-même une fois l'échange terminé (MicButton.onIdle).
 */
public class BulleEcouteActivity extends BridgeActivity {

    /** Vrai tant que cette fenêtre est ouverte — c'est ce que lit
     * BulleService pour savoir si un appui doit ARRÊTER plutôt que
     * démarrer, et pour donner à la bulle son icône « en écoute ». */
    private static volatile boolean active = false;

    /** La seule instance vivante, pour pouvoir la refermer directement
     * depuis BulleService quand l'appui suivant demande l'arrêt — même
     * genre de champ statique que EtatLivePlugin, les deux vivant dans le
     * même processus. */
    private static volatile BulleEcouteActivity instance;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BulleEcoutePlugin.class);
        registerPlugin(JarvisWidgetPlugin.class);
        registerPlugin(ActionsTelephonePlugin.class);
        // Manquait ici (trouvé le 17 sept. 2026, chantier efe7e44c) alors
        // qu'AssistOverlayActivity l'a depuis le chantier 2a5b7802 : sans
        // lui, EtatLive.etat() échoue silencieusement dans CETTE fenêtre
        // (comportement prévu par etatLiveNatif.ts en cas de plugin absent),
        // et la boucle de veille de la bulle ne saurait jamais qu'une
        // conversation Live tourne dans l'autre fenêtre — les activations
        // intempestives du micro que 2a5b7802 corrigeait ailleurs.
        registerPlugin(EtatLivePlugin.class);
        super.onCreate(savedInstanceState);

        active = true;
        instance = this;
        BulleService.setEnEcoute(true);

        // Écouter tout de suite, sans qu'on retouche le micro — même
        // mécanisme que le widget et l'appui long.
        JarvisWidgetPlugin.demarrerEcoute = true;
        JarvisWidgetPlugin.demarreeA = System.currentTimeMillis();

        reduireLaFenetre();
    }

    /**
     * La rendre la plus invisible possible : transparente (Theme.Jarvis
     * .Assist, sans assombrissement contrairement à AssistOverlayActivity,
     * qui EN a un exprès — ici on ne veut RIEN voir), et réduite dans un
     * coin plutôt qu'un tiers d'écran. Ce qui la rend invisible à l'œil est
     * la classe CSS `sr-only` posée par OverlayMicContent(cache=true) —
     * PAS la taille de la fenêtre Android elle-même : ce sont deux couches
     * différentes.
     *
     * TAILLE REVUE LE 17 SEPT. 2026 (chantier efe7e44c), après un rapport
     * de Raphaël (« ça saute directement » sur l'appui de la bulle, la
     * fenêtre d'assistance ET la bulle le même jour). La première version
     * (2 dip, soit 5-6 pixels réels) n'avait jamais été essayée sur un vrai
     * téléphone — le commentaire d'origine le disait déjà. Un WebView/
     * Chromium créé dans une surface de quelques pixels est un cas limite
     * documenté (rendu qui échoue ou qui plante selon le fabricant et la
     * version du système) : DEDUIT comme risque plausible, PAS confirmé
     * faute d'accès à un appareil ici — mais un risque qui n'a aucune
     * raison d'être pris, puisque l'invisibilité ne dépend déjà pas de la
     * taille (voir ci-dessus). 64dip est une taille de bouton ordinaire,
     * dans la marge de ce qu'Android affiche partout sans jamais poser
     * problème.
     */
    private void reduireLaFenetre() {
        Window fenetre = getWindow();
        if (fenetre == null) return;

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int taille = Math.round(64 * metrics.density);

        WindowManager.LayoutParams params = fenetre.getAttributes();
        params.gravity = Gravity.TOP | Gravity.START;
        params.width = taille;
        params.height = taille;
        params.x = 0;
        params.y = 0;
        // LA VRAIE RÉGRESSION DU PASSAGE À 64 DIP (17 sept. 2026, retour de
        // Raphaël : « fonctionne encore moins bien qu'avant »), trouvée en
        // relisant les drapeaux plutôt que la taille. Sans FLAG_NOT_TOUCH_MODAL
        // (posé automatiquement par FLAG_NOT_FOCUSABLE ci-dessous), une fenêtre
        // FOCUSABLE consomme TOUS les événements tactiles de l'écran ENTIER
        // tant qu'elle est ouverte, pas seulement ceux dans ses propres limites
        // (documenté par Android : WindowManager.LayoutParams.FLAG_NOT_TOUCH_
        // MODAL). À 2 dip, un WebView qui échouait probablement à se créer
        // laissait cette fenêtre à peine vivante ; à 64 dip elle s'ouvre pour
        // de vrai et reste au premier plan le temps de l'écoute — l'écran
        // entier devenait donc insensible au toucher pendant tout ce temps,
        // sans qu'aucun élément visible ne le laisse deviner. Cette fenêtre
        // n'a besoin d'AUCUNE interaction tactile : elle se referme par
        // BulleEcoutePlugin.fermer(), appelé depuis le JS, jamais par un appui
        // ici. FLAG_NOT_TOUCHABLE (aucun événement ne lui est même livré) et
        // FLAG_NOT_FOCUSABLE (elle ne vole ni le clavier ni le focus — même
        // raison que BulleService pour sa propre bulle) laissent donc tout
        // passer à l'application réellement affichée en dessous.
        params.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        fenetre.setAttributes(params);
    }

    @Override
    public void onDestroy() {
        active = false;
        if (instance == this) instance = null;
        BulleService.setEnEcoute(false);
        super.onDestroy();
    }

    static boolean estActive() {
        return active;
    }

    /** Appelé par BulleService quand l'appui suivant sur la bulle doit
     * ARRÊTER l'écoute plutôt qu'en ouvrir une nouvelle. */
    static void arreterSiActive() {
        BulleEcouteActivity courante = instance;
        if (courante != null) courante.finish();
    }

    /** Options de lancement sans transition — un fondu ou un glissement
     * d'activité serait exactement le genre de fenêtre visible qu'on évite
     * ici. Statique pour que BulleService (qui n'a pas de fenêtre à
     * elle-même) puisse les poser sur son Intent. */
    static Bundle optionsSansAnimation(android.content.Context ctx) {
        return ActivityOptions.makeCustomAnimation(ctx, 0, 0).toBundle();
    }
}
