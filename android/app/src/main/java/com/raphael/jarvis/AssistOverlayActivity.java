package com.raphael.jarvis;

import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

/**
 * La fenêtre ouverte par l'appui long sur le bouton d'alimentation (rôle
 * assistant d'Android) — une surcouche sur un tiers d'écran en bas, fondu
 * sur ce qui est affiché derrière, PAS l'app entière qui s'ouvre (c'est
 * l'effet déjà obtenu par le widget d'écran d'accueil, chantier séparé).
 *
 * C'est une deuxième BridgeActivity, avec son propre pont Capacitor et donc
 * ses propres plugins enregistrés — pas un mode particulier de MainActivity.
 * Elle charge le même bundle web (même origine https://localhost, même
 * stockage local, donc même session Supabase déjà connectée) mais le web
 * détecte qu'il tourne ici via AssistOverlayPlugin.estOverlay() plutôt que
 * par une URL ou un extra d'intent, et se rend directement sur la route
 * /assistant, sans tableau de bord ni barre latérale.
 */
public class AssistOverlayActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AssistOverlayPlugin.class);
        registerPlugin(JarvisWidgetPlugin.class);
        registerPlugin(ActionsTelephonePlugin.class);
        super.onCreate(savedInstanceState);

        // Elle doit écouter tout de suite, sans qu'on retouche le micro —
        // même mécanisme que le widget d'écran d'accueil (JarvisWidgetPlugin
        // .demarrerEcoute, lu une fois au montage par MicButton).
        JarvisWidgetPlugin.demarrerEcoute = true;

        positionnerFenetre();
    }

    /**
     * Ancre la fenêtre en bas de l'écran, sur environ un tiers de sa
     * hauteur, avec un fond assombri derrière — un thème seul ne peut pas
     * dire "un tiers d'écran en bas", ça se pose sur la fenêtre en code.
     *
     * NON VÉRIFIÉ SUR UN VRAI TÉLÉPHONE : les proportions exactes (hauteur,
     * assombrissement) sont un premier réglage, à ajuster une fois vu chez
     * Raphaël plutôt que deviné une deuxième fois ici.
     */
    private void positionnerFenetre() {
        Window fenetre = getWindow();
        if (fenetre == null) return;

        fenetre.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        fenetre.setDimAmount(0.5f);

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        WindowManager.LayoutParams params = fenetre.getAttributes();
        params.gravity = Gravity.BOTTOM;
        params.width = WindowManager.LayoutParams.MATCH_PARENT;
        params.height = (int) (metrics.heightPixels * 0.4f);
        fenetre.setAttributes(params);
    }
}
