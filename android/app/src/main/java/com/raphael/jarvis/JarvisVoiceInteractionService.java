package com.raphael.jarvis;

import android.service.voice.VoiceInteractionService;

/**
 * Ce qui rend Jarvis choisissable comme assistant du téléphone.
 *
 * POURQUOI CE FICHIER EXISTE, et il a coûté deux tentatives. Le 5 sept. 2026,
 * on avait déclaré une activité exportée répondant à ACTION_ASSIST : c'est
 * l'une des DEUX branches qu'AOSP accepte pour qualifier une application
 * (PermissionController, AssistantRoleBehavior). Le 6 sept. au matin, Raphaël
 * a suivi le chemin jusqu'au bout — Fonctions avancées › Touche latérale ›
 * Appuyer longuement › Application d'assistant numérique par défaut › Autres
 * applications — et Jarvis n'y était pas. La liste de Samsung ne montre que
 * l'autre branche : un vrai VoiceInteractionService.
 *
 * CE QUE LE SYSTÈME EXIGE, relevé dans la source d'AOSP le 6 sept. et pas de
 * mémoire (VoiceInteractionServiceInfo, frameworks/base, branche main) — il
 * refuse le service et n'explique rien à l'écran s'il manque quoi que ce soit :
 *
 *   1. le service DOIT être protégé par android.permission.BIND_VOICE_INTERACTION,
 *      exactement (`si.permission` est comparé à cette chaîne) ;
 *   2. une meta-data « android.voice_interaction » pointant sur un XML dont la
 *      racine est <voice-interaction-service> ;
 *   3. `sessionService` renseigné — sinon « No sessionService specified » ;
 *   4. `recognitionService` renseigné — sinon « No recognitionService specified ».
 *      C'est pour cette ligne-là, et pour elle seule, que
 *      JarvisRecognitionService existe : Jarvis n'utilise pas ce moteur ;
 *   5. `supportsAssist="true"`, sans quoi le rôle assistant l'ignore.
 *
 * Le service lui-même n'a rien à faire : tout se passe dans la session, que le
 * système crée quand l'appui long arrive.
 */
public class JarvisVoiceInteractionService extends VoiceInteractionService {
}
