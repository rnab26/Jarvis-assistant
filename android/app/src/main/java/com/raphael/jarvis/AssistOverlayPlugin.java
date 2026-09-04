package com.raphael.jarvis;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * N'existe que dans le pont natif de AssistOverlayActivity — jamais dans
 * celui de MainActivity. C'est ce qui permet au web de savoir dans laquelle
 * des deux fenêtres il tourne : estOverlay() résout vrai ici, échoue (plugin
 * absent) côté MainActivity, sans avoir à faire transiter un état par une
 * URL ou un extra d'intent.
 */
@CapacitorPlugin(name = "AssistOverlay")
public class AssistOverlayPlugin extends Plugin {

    @PluginMethod
    public void estOverlay(PluginCall call) {
        call.resolve(new JSObject().put("overlay", true));
    }

    /** Referme la fenêtre : appelé une fois l'échange terminé (la personne
     * n'a plus rien à dire), pour qu'elle disparaisse comme prévu. */
    @PluginMethod
    public void fermer(PluginCall call) {
        if (getActivity() != null) getActivity().finish();
        call.resolve();
    }
}
