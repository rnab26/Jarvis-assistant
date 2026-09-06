package com.raphael.jarvis;

import android.content.Intent;
import android.speech.RecognitionService;

/**
 * Un moteur de reconnaissance qui ne reconnaît rien, et c'est exprès.
 *
 * POURQUOI IL EXISTE. Android REFUSE un VoiceInteractionService dont le XML ne
 * déclare pas de `recognitionService` : « No recognitionService specified »,
 * relevé dans la source d'AOSP le 6 sept. 2026 (VoiceInteractionServiceInfo).
 * Le service entier est alors ignoré, et Jarvis n'apparaît pas dans la liste
 * des assistants — sans le moindre message à l'écran. C'est une case à cocher
 * du système, pas une fonctionnalité.
 *
 * POURQUOI IL NE FAIT RIEN. Jarvis n'écoute pas par ce chemin : il passe par
 * le plugin de reconnaissance, qui vise explicitement le moteur de Google
 * (patch-package, patches/@capacitor-community+speech-recognition). Écrire ici
 * un vrai moteur ferait un deuxième chemin d'écoute, à tenir à jour en
 * parallèle du premier — exactement ce que ce projet évite partout ailleurs.
 *
 * IL ÉCHOUE FRANCHEMENT plutôt que d'attendre : si un jour quelque chose
 * l'appelle vraiment, on veut une erreur immédiate et lisible dans les
 * journaux, pas un micro qui semble ouvert et ne rend jamais rien.
 */
public class JarvisRecognitionService extends RecognitionService {

    @Override
    protected void onStartListening(Intent recognizerIntent, Callback listener) {
        echouer(listener);
    }

    @Override
    protected void onCancel(Callback listener) {
    }

    @Override
    protected void onStopListening(Callback listener) {
        echouer(listener);
    }

    private void echouer(Callback listener) {
        try {
            listener.error(android.speech.SpeechRecognizer.ERROR_CLIENT);
        } catch (Exception ignore) {
            // Le client est déjà parti : rien à signaler à personne.
        }
    }
}
