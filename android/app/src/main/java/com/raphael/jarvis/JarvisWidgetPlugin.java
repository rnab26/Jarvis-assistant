package com.raphael.jarvis;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pont JS -> natif pour forcer un rafraîchissement immédiat du widget
 * d'écran d'accueil dès que l'app a écrit un nouveau résumé (au lieu
 * d'attendre le cycle de rafraîchissement automatique Android, ~30 min).
 */
@CapacitorPlugin(name = "JarvisWidget")
public class JarvisWidgetPlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        ComponentName component = new ComponentName(getContext(), JarvisWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        JarvisWidgetProvider.updateAllWidgets(getContext(), manager, ids);
        call.resolve();
    }
}
