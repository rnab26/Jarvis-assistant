package com.raphael.jarvis;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pont natif -> JS pour le texte reçu via le menu "Partager" d'Android
 * (ex: partager un lien ou un extrait depuis le navigateur ou WhatsApp
 * vers Jarvis). MainActivity stocke le texte reçu dans un champ statique
 * (l'app peut être relancée sur un intent avant même que le WebView ait
 * fini de charger) ; le JS le récupère à l'ouverture via getPendingShare()
 * et le vide aussitôt pour ne pas le retraiter au prochain lancement.
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    static String pendingText = null;

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", pendingText);
        pendingText = null;
        call.resolve(result);
    }
}
