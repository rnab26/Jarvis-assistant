package com.raphael.jarvis;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ouvre les écrans de réglages d'Android qui concernent Jarvis.
 *
 * Pourquoi c'est nécessaire : Android ne montre la demande d'autorisation des
 * notifications qu'une fois. Refusée, elle ne se redemande plus jamais, et
 * l'interrupteur reste bloqué sans aucun moyen de le débloquer depuis
 * l'application. Le seul chemin est l'écran système des notifications de
 * l'app — et jusqu'ici il fallait aller le chercher soi-même dans les
 * réglages du téléphone, ce que Raphaël ne veut justement pas avoir à faire.
 *
 * Aucune permission n'est demandée au manifeste : on ne fait qu'ouvrir un
 * écran du système.
 */
@CapacitorPlugin(name = "ReglagesSysteme")
public class ReglagesSystemePlugin extends Plugin {

    /** L'écran des notifications de Jarvis. Avant Android 8 cet écran
     * n'existe pas : on retombe sur la fiche de l'application, qui contient
     * la même chose au milieu d'autres réglages. */
    @PluginMethod
    public void ouvrirNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(getContext().getPackageManager()) != null) {
                getContext().startActivity(intent);
                call.resolve();
                return;
            }
        }
        ouvrirFicheApplication(call);
    }

    /** La fiche de l'application dans les réglages Android : permissions,
     * stockage, notifications. Le recours quand un écran plus précis
     * n'existe pas sur cette version d'Android. */
    @PluginMethod
    public void ouvrirFicheApplication(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Aucun écran de réglages n'a pu être ouvert.");
            return;
        }
        getContext().startActivity(intent);
        call.resolve();
    }
}
