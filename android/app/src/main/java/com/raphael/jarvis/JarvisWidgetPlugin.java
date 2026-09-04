package com.raphael.jarvis;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

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
        rafraichirTout();
        call.resolve();
    }

    /**
     * Recopie le cœur choisi par Raphaël dans un fichier lisible par les
     * widgets.
     *
     * Son image vit côté web en data URL, dans localStorage : un widget tourne
     * hors du WebView et ne peut pas la lire. On la décode donc ici une fois,
     * à chaque changement, plutôt qu'à chaque rafraîchissement de widget.
     *
     * `dataUrl` nul ou vide = il est revenu au réacteur par défaut : on
     * supprime le fichier, et les layouts reprennent l'image livrée dans
     * l'APK.
     */
    @PluginMethod
    public void setCoreImage(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        File cible = CoeurJarvis.fichier(getContext());
        try {
            if (dataUrl == null || dataUrl.isEmpty()) {
                cible.delete();
            } else {
                int virgule = dataUrl.indexOf(',');
                String base64 = virgule >= 0 ? dataUrl.substring(virgule + 1) : dataUrl;
                byte[] octets = Base64.decode(base64, Base64.DEFAULT);
                try (FileOutputStream out = new FileOutputStream(cible)) {
                    out.write(octets);
                }
            }
        } catch (Throwable e) {
            // Échec d'écriture : les widgets gardent le réacteur par défaut.
            // Ce n'est pas une raison de faire échouer l'appel côté app.
            call.resolve();
            return;
        }
        rafraichirTout();
        call.resolve();
    }

    /** Les deux widgets, pas seulement celui des tâches. */
    private void rafraichirTout() {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());

        ComponentName taches = new ComponentName(getContext(), JarvisWidgetProvider.class);
        JarvisWidgetProvider.updateAllWidgets(getContext(), manager, manager.getAppWidgetIds(taches));

        ComponentName coeur = new ComponentName(getContext(), JarvisCoreWidgetProvider.class);
        JarvisCoreWidgetProvider.updateAllWidgets(getContext(), manager, manager.getAppWidgetIds(coeur));
    }

    @PluginMethod
    public void getPendingListen(PluginCall call) {
        JSObject result = new JSObject();
        result.put("demarrer", demarrerEcoute);
        demarrerEcoute = false;
        call.resolve(result);
    }
}
