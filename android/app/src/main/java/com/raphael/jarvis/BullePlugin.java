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
        // NI PRE-CONTROLE, NI resolveActivity : voir EcransReglages. Le
        // meme pre-controle rendait muet le bouton de la carte
        // "Autorisations du telephone" chez Raphael (8 sept. 2026) -- il est
        // filtre par la visibilite des paquets depuis Android 11 et peut
        // rendre null pour un ecran qui existe. Ici, le repli est la fiche de
        // l'application : "Afficher par-dessus les autres applications" y
        // figure sur la plupart des surcouches.
        Intent direct = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName()));
        Intent liste = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
        Intent fiche = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getContext().getPackageName()));
        if (EcransReglages.ouvrirLePremierQuiRepond(getContext(), direct, liste, fiche) < 0) {
            call.reject("Aucun écran de réglages n'a pu être ouvert.");
            return;
        }
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

    /**
     * Remettre la bulle à sa place d'origine.
     *
     * LE FILET, écrit après le 7 sept. 2026 : « ma bulle jarvis est bloqué
     * complètement en haut a droite j'arrive plus a la récupérer ». Le bornage
     * du service empêche que ça se reproduise, mais il fallait aussi un moyen
     * de la rappeler quand elle est déjà perdue — sinon le seul recours est de
     * désinstaller l'application.
     *
     * On oublie la position AVANT de relancer : le service la relit à son
     * démarrage, donc l'ordre compte.
     */
    @PluginMethod
    public void replacer(PluginCall call) {
        BulleService.oublierPosition(getContext());
        Intent stop = new Intent(getContext(), BulleService.class);
        getContext().stopService(stop);
        if (BulleService.peutAfficher(getContext())) {
            Intent demarrer = new Intent(getContext(), BulleService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(demarrer);
            } else {
                getContext().startService(demarrer);
            }
        }
        call.resolve();
    }
}
