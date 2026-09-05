package com.raphael.jarvis;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le pont de la bulle flottante : son état réel, et de quoi l'allumer.
 *
 * L'état est LU au système (Settings.canDrawOverlays) et au service
 * (BulleService.active), jamais déduit du réglage : l'autorisation
 * « afficher par-dessus les autres applications » se retire depuis Android
 * sans que l'app en sache rien, et un interrupteur allumé au-dessus d'une
 * bulle absente serait un mensonge de plus.
 */
@CapacitorPlugin(name = "Bulle")
public class BullePlugin extends Plugin {

    @PluginMethod
    public void etat(PluginCall call) {
        JSObject res = new JSObject();
        res.put("autorisee", BulleService.peutAfficher(getContext()));
        res.put("active", BulleService.active);
        call.resolve(res);
    }

    /**
     * L'écran d'Android où se donne l'autorisation.
     *
     * Elle ne s'obtient PAS par une fenêtre de demande : c'est un accès
     * spécial, qui passe forcément par un écran de réglages. Proposer un
     * bouton « Autoriser » ici donnerait un bouton mort.
     */
    @PluginMethod
    public void demanderAutorisation(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Aucun écran de réglages n'a pu être ouvert.");
            return;
        }
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void demarrer(PluginCall call) {
        if (!BulleService.peutAfficher(getContext())) {
            // On le DIT plutôt que de démarrer un service qui s'arrêterait
            // aussitôt : sinon l'interrupteur retomberait tout seul sans que
            // rien n'explique pourquoi.
            call.reject("AUTORISATION_MANQUANTE");
            return;
        }
        Intent service = new Intent(getContext(), BulleService.class);
        // startForegroundService n'existe qu'à partir d'Android 8 ; en dessous
        // (minSdk 24), startService suffit et le service se met lui-même au
        // premier plan.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(service);
        } else {
            getContext().startService(service);
        }
        call.resolve();
    }

    @PluginMethod
    public void arreter(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BulleService.class));
        call.resolve();
    }
}
