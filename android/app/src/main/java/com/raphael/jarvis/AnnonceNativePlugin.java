package com.raphael.jarvis;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le pont du service qui parle même app fermée (chantier 23ee3735).
 *
 * `ecrirePrefs` pousse ce dont JarvisNotificationListenerService a besoin
 * pour décider — voix coupée, heures de silence — dans une SharedPreferences
 * lisible nativement (le TypeScript, lui, vit dans window.localStorage,
 * illisible depuis Java sans ce pont).
 */
@CapacitorPlugin(name = "AnnonceNative")
public class AnnonceNativePlugin extends Plugin {

    static final String PREFS = "jarvis_annonce_prefs";
    static final String CLE_DIRE_A_VOIX_HAUTE = "direAVoixHaute";
    static final String CLE_VOIX_COUPEE = "voixCoupee";
    static final String CLE_SILENCE_NUIT = "silenceNuit";
    static final String CLE_SILENCE_DEBUT = "silenceDebut";
    static final String CLE_SILENCE_FIN = "silenceFin";

    @PluginMethod
    public void etat(PluginCall call) {
        JSObject res = new JSObject();
        res.put("active", AnnonceService.actif() != null);
        call.resolve(res);
    }

    @PluginMethod
    public void demarrer(PluginCall call) {
        Intent service = new Intent(getContext(), AnnonceService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(service);
        } else {
            getContext().startService(service);
        }
        call.resolve();
    }

    @PluginMethod
    public void arreter(PluginCall call) {
        getContext().stopService(new Intent(getContext(), AnnonceService.class));
        call.resolve();
    }

    @PluginMethod
    public void ecrirePrefs(PluginCall call) {
        SharedPreferences.Editor editeur =
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editeur.putBoolean(CLE_DIRE_A_VOIX_HAUTE, call.getBoolean("direAVoixHaute", false));
        editeur.putBoolean(CLE_VOIX_COUPEE, call.getBoolean("voixCoupee", false));
        editeur.putBoolean(CLE_SILENCE_NUIT, call.getBoolean("silenceNuit", false));
        editeur.putString(CLE_SILENCE_DEBUT, call.getString("silenceDebut", "22:30"));
        editeur.putString(CLE_SILENCE_FIN, call.getString("silenceFin", "07:30"));
        editeur.apply();
        call.resolve();
    }
}
