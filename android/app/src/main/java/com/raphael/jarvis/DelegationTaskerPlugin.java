package com.raphael.jarvis;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * L'etat REEL de la delegation Tasker+AutoInput (chantier d9ffb735) : les
 * deux applications sont-elles installees. Jamais un reglage seul -- une
 * desinstallation depuis Android ne doit pas laisser Parametres afficher
 * "active" au-dessus d'un mecanisme mort, meme piege deja corrige pour la
 * bulle et le service d'accessibilite.
 *
 * Ne decide rien d'autre : le choix de DELEGUER un clic donne (reglage +
 * cet etat) se fait cote TypeScript (src/lib/delegationTasker.ts), qui le
 * transmet ensuite a AccessibilitePlugin.cliquer() -- c'est LUI qui execute
 * la tentative, via TaskerDelegation.
 */
@CapacitorPlugin(name = "DelegationTasker")
public class DelegationTaskerPlugin extends Plugin {

    @PluginMethod
    public void etat(PluginCall call) {
        JSObject reponse = new JSObject();
        reponse.put("taskerInstalle", TaskerDelegation.installe(getContext(), TaskerDelegation.PAQUET_TASKER));
        reponse.put("autoInputInstalle", TaskerDelegation.installe(getContext(), TaskerDelegation.PAQUET_AUTOINPUT));
        call.resolve(reponse);
    }
}
