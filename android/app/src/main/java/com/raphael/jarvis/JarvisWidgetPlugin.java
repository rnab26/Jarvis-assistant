package com.raphael.jarvis;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pont JS -> natif pour forcer un rafraîchissement immédiat du widget
 * d'écran d'accueil dès que l'app a écrit un nouveau résumé (au lieu
 * d'attendre le cycle de rafraîchissement automatique Android, ~30 min).
 *
 * Sert aussi le sens inverse (natif -> JS) : un appui sur le widget doit
 * lancer l'écoute directement, pas seulement ouvrir l'app. MainActivity pose
 * demarrerEcoute (même mécanisme que ShareReceiverPlugin.pendingText — un
 * champ statique, l'app peut être relancée sur l'intent avant que le WebView
 * ait fini de charger) ; le JS le lit à l'ouverture via getPendingListen() et
 * le remet à zéro pour ne pas relancer l'écoute au prochain démarrage.
 */
@CapacitorPlugin(name = "JarvisWidget")
public class JarvisWidgetPlugin extends Plugin {

    static boolean demarrerEcoute = false;

    @PluginMethod
    public void refresh(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        ComponentName component = new ComponentName(getContext(), JarvisWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        JarvisWidgetProvider.updateAllWidgets(getContext(), manager, ids);
        call.resolve();
    }

    @PluginMethod
    public void getPendingListen(PluginCall call) {
        JSObject result = new JSObject();
        result.put("demarrer", demarrerEcoute);
        demarrerEcoute = false;
        call.resolve(result);
    }
}
