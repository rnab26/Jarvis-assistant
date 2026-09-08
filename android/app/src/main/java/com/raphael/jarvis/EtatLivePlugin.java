package com.raphael.jarvis;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Un drapeau partagé : une conversation Live est-elle ouverte, PEU IMPORTE
 * LA FENÊTRE (chantier 2a5b7802, 7 sept. 2026).
 *
 * D'OÙ ÇA VIENT, MESURÉ dans journal_ecoute (pas supposé) : sur une
 * conversation Live de 544957 ms, 70 cycles de la veille CLASSIQUE (mot-clé
 * « Jarvis ») se sont déclenchés PENDANT, toutes les ~7-8 secondes, alors
 * que le commentaire de MicButton affirme « pendant la conversation, l'état
 * n'est jamais au repos, donc la veille attend ». C'est vrai DANS LA MÊME
 * fenêtre (statusRef y reste "listening"/"speaking" tout du long, vérifié en
 * lisant sessionLive.ts) — mais l'app a DEUX points de montage de MicButton
 * (ProtectedShell et AssistantOverlayPage), et la fenêtre d'assistance est
 * une VRAIE seconde BridgeActivity avec son propre WebView, donc son propre
 * tas JS : le `status` React de l'une n'existe pas dans l'autre. Une Live
 * ouverte dans l'une n'a aucun moyen de le dire à l'autre — d'où les
 * activations/désactivations intempestives qu'il entend (le service de
 * reconnaissance de la fenêtre restée oublieuse s'allume et s'éteint en
 * boucle, sans lien avec la conversation en cours ailleurs).
 *
 * Les deux Activity vivent dans le MÊME processus (aucun android:process
 * déclaré) : un simple champ statique suffit, pas besoin de SharedPreferences
 * ni de sondage réseau. `definir` est appelé par CHAQUE fenêtre qui ouvre ou
 * ferme une session Live (sessionLive.ts) ; `etat` est lu par la boucle de
 * veille de CHAQUE fenêtre avant toute tentative de rafale — la sienne
 * propre reste gardée par `statusRef` comme avant, ce drapeau ne fait
 * qu'ajouter la garde qui manquait pour l'AUTRE fenêtre.
 */
@CapacitorPlugin(name = "EtatLive")
public class EtatLivePlugin extends Plugin {

    /** Vrai tant qu'AU MOINS UNE fenêtre a une conversation Live ouverte. */
    private static volatile boolean actif = false;

    @PluginMethod
    public void definir(PluginCall call) {
        actif = call.getBoolean("actif", false);
        call.resolve();
    }

    @PluginMethod
    public void etat(PluginCall call) {
        JSObject res = new JSObject();
        res.put("actif", actif);
        call.resolve(res);
    }
}
