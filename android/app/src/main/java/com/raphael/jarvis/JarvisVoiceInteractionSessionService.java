package com.raphael.jarvis;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

/**
 * Fabrique la session que le système ouvre à l'appui long.
 *
 * Obligatoire : sans `sessionService` dans interaction_service.xml, Android
 * refuse tout le VoiceInteractionService avec « No sessionService specified »,
 * et Jarvis n'apparaît pas dans la liste des assistants — sans message.
 */
public class JarvisVoiceInteractionSessionService extends VoiceInteractionSessionService {

    @Override
    public VoiceInteractionSession onNewSession(Bundle args) {
        return new JarvisVoiceInteractionSession(this);
    }
}
