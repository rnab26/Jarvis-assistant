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
     * La rendre la plus invisible possible : transparente, sans titre, sans
     * assombrissement (contrairement à AssistOverlayActivity, qui EN a un
     * exprès — ici on ne veut RIEN voir), et réduite à quelques pixels dans
     * un coin plutôt qu'un tiers d'écran. Un WebView de cette taille exécute
     * son JavaScript normalement ; rien dans MicButton n'a besoin d'être
     * mesuré à l'écran pour fonctionner, l'écoute est entièrement pilotée
     * par le drapeau démarrerEcoute et par onIdle.
     */
    private void reduireLaFenetre() {
        Window fenetre = getWindow();
        if (fenetre == null) return;

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int taille = Math.round(2 * metrics.density);

        WindowManager.LayoutParams params = fenetre.getAttributes();
        params.gravity = Gravity.TOP | Gravity.START;
        params.width = taille;
        params.height = taille;
        params.x = 0;
        params.y = 0;
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
