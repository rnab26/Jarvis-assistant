package com.raphael.jarvis;

import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ouvre les écrans de réglages d'Android qui concernent Jarvis, et dit ce
 * qu'Android pense de lui.
 *
 * Pourquoi c'est nécessaire : Android ne montre la demande d'autorisation des
 * notifications qu'une fois. Refusée, elle ne se redemande plus jamais, et
 * l'interrupteur reste bloqué sans aucun moyen de le débloquer depuis
 * l'application. Le seul chemin est l'écran système des notifications de
 * l'app — et jusqu'ici il fallait aller le chercher soi-même dans les
 * réglages du téléphone, ce que Raphaël ne veut justement pas avoir à faire.
 *
 * Aucune permission n'est demandée au manifeste : on ne fait qu'ouvrir un
 * écran du système et lire un état public.
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

    /**
     * Où en est Jarvis vis-à-vis du rôle « assistant numérique » d'Android —
     * celui que Samsung déclenche par l'appui long sur la touche latérale.
     *
     * Deux informations distinctes, et il faut les deux pour savoir quoi
     * faire :
     *
     * - `candidat` : est-ce que l'APK INSTALLÉE déclare l'activité
     *   d'assistance ? On interroge le système sur notre propre paquet plutôt
     *   que de supposer d'après le code : depuis la mise à jour rapide, une
     *   interface récente tourne souvent dans une coquille Android plus
     *   ancienne, et c'est la coquille qui porte le manifeste. Faux = Jarvis
     *   ne peut PAS apparaître dans la liste d'Android, et aucun réglage n'y
     *   changera rien — il faut installer une APK récente.
     * - `role` : "actif" si Jarvis tient le rôle, "inactif" sinon,
     *   "inconnu" avant Android 10 (RoleManager n'existe pas) ou si le
     *   système refuse de répondre.
     *
     * Le critère de `candidat` est celui d'AOSP, relevé dans le code de
     * PermissionController (AssistantRoleBehavior.getQualifyingPackagesInternal,
     * branche 5 sept. 2026) : une activité EXPORTÉE qui répond à
     * ACTION_ASSIST avec MATCH_DEFAULT_ONLY suffit à qualifier un paquet.
     * D'où exactement la même requête ici — pas une approximation.
     */
    @PluginMethod
    public void etatAssistant(PluginCall call) {
        Context ctx = getContext();
        JSObject resultat = new JSObject();

        Intent sonde = new Intent(Intent.ACTION_ASSIST);
        sonde.setPackage(ctx.getPackageName());
        boolean candidat = !ctx.getPackageManager()
                .queryIntentActivities(sonde, PackageManager.MATCH_DEFAULT_ONLY)
                .isEmpty();
        resultat.put("candidat", candidat);

        String role = "inconnu";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                RoleManager gestionnaire = (RoleManager) ctx.getSystemService(Context.ROLE_SERVICE);
                if (gestionnaire != null && gestionnaire.isRoleAvailable(RoleManager.ROLE_ASSISTANT)) {
                    role = gestionnaire.isRoleHeld(RoleManager.ROLE_ASSISTANT) ? "actif" : "inactif";
                }
            } catch (Exception ignore) {
                // Une surcouche constructeur qui répond de travers ne doit pas
                // faire échouer l'écran : "inconnu" affiche le chemin manuel,
                // qui marche de toute façon.
            }
        }
        resultat.put("role", role);
        call.resolve(resultat);
    }

    /**
     * L'écran où l'on choisit l'assistant numérique du téléphone.
     *
     * On NE PEUT PAS ouvrir directement la bonne page : l'action qui va
     * pile-poil dessus (android.intent.action.MANAGE_DEFAULT_APP avec
     * EXTRA_ROLE_NAME) est protégée par la permission signature
     * MANAGE_ROLE_HOLDERS — vérifié dans le manifeste de PermissionController,
     * activité DefaultAppActivity. Et le rôle assistant est déclaré
     * `requestable="false"` dans roles.xml, donc la fenêtre en un geste de
     * RoleManager.createRequestRoleIntent est également fermée. Il reste les
     * deux écrans publics ci-dessous, essayés dans l'ordre du plus précis au
     * plus large ; l'appelant apprend lequel s'est ouvert pour dire ce qu'il
     * reste à toucher.
     */
    @PluginMethod
    public void ouvrirReglagesAssistant(PluginCall call) {
        // ACTION_MANAGE_DEFAULT_APPS_SETTINGS existe depuis Android 7, et
        // minSdk vaut 24 : les deux écrans sont donc toujours atteignables
        // sur les appareils que cette app accepte.
        if (essayer(Settings.ACTION_VOICE_INPUT_SETTINGS, call, "assistant")) return;
        if (essayer(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, call, "applications")) return;
        ouvrirFicheApplication(call);
    }

    /** Ouvre un écran de réglages s'il existe. Vrai s'il s'est ouvert. */
    private boolean essayer(String action, PluginCall call, String ecran) {
        Intent intent = new Intent(action);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) return false;
        try {
            getContext().startActivity(intent);
        } catch (Exception refus) {
            // resolveActivity dit qu'un écran répond, pas qu'on a le droit de
            // l'ouvrir : plusieurs écrans de réglages sont protégés par une
            // permission de signature. On passe au suivant plutôt que de
            // laisser l'app tomber.
            return false;
        }
        JSObject resultat = new JSObject();
        resultat.put("ecran", ecran);
        call.resolve(resultat);
        return true;
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
        JSObject resultat = new JSObject();
        resultat.put("ecran", "fiche");
        call.resolve(resultat);
    }
}
