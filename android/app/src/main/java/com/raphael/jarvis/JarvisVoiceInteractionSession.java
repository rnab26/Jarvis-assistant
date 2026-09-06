package com.raphael.jarvis;

import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;

/**
 * Ce qui se passe quand l'appui long réveille Jarvis.
 *
 * ON N'AFFICHE RIEN ICI, ET C'EST VOULU. La fenêtre en surcouche existe déjà
 * — AssistOverlayActivity, une deuxième BridgeActivity Capacitor avec son
 * thème translucide ancré en bas, qui réutilise le vrai moteur d'écoute de
 * l'app. Redessiner une interface dans la session en ferait une SECONDE, avec
 * son propre code d'écoute et sa propre gestion d'authentification : deux
 * écrans qui finiraient par ne plus se comporter pareil.
 *
 * On ouvre donc la fenêtre existante, et on se retire aussitôt. `hide()` est
 * indispensable : sans lui la session reste vivante au-dessus de la fenêtre,
 * invisible, et le prochain appui long ne rouvre rien.
 */
public class JarvisVoiceInteractionSession extends VoiceInteractionSession {

    public JarvisVoiceInteractionSession(android.content.Context context) {
        super(context);
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        ouvrirLaFenetre();
    }

    private void ouvrirLaFenetre() {
        Intent fenetre = new Intent(getContext(), AssistOverlayActivity.class);
        fenetre.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(fenetre);
        } catch (Exception ignore) {
            // La fenêtre n'a pas pu s'ouvrir : on se retire quand même, plutôt
            // que de laisser une session vide bloquer les appuis suivants.
        }
        hide();
    }
}
