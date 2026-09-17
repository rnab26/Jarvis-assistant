package com.raphael.jarvis;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * N'existe que dans le pont natif de BulleEcouteActivity — jamais dans celui
 * de MainActivity ni de AssistOverlayActivity. Même rôle que AssistOverlay
 * pour la fenêtre de l'appui long : c'est ce qui permet au web de savoir
 * qu'il tourne dans la fenêtre invisible de la bulle plutôt que dans l'app
 * normale ou dans la fenêtre d'assistance, sans faire transiter un état par
 * une URL ou un extra d'intent.
 */
@CapacitorPlugin(name = "BulleEcoute")
public class BulleEcoutePlugin extends Plugin {

    @PluginMethod
    public void estBulle(PluginCall call) {
        call.resolve(new JSObject().put("bulle", true));
    }

    /** Referme la fenêtre : appelé une fois l'échange terminé (MicButton
     * revenu au repos), pour qu'elle disparaisse comme prévu — même
     * mécanisme que AssistOverlay.fermer(). */
    @PluginMethod
    public void fermer(PluginCall call) {
        if (getActivity() != null) getActivity().finish();
        call.resolve();
    }
}
