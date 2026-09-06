package com.raphael.jarvis;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le pont vers JarvisAccessibiliteService.
 *
 * Il ne decide rien : il rend l'etat REEL du service (lu du systeme, jamais
 * d'un reglage -- Android peut couper un service d'accessibilite sans que
 * l'application en sache rien), la liste de ce qui est affiche, et il
 * execute un clic sur un rang precis. Quel element repond a « la deuxieme
 * video » se decide dans src/lib/ecranTelephone.ts, ou ca se verifie sans
 * telephone.
 *
 * TOUT PASSE PAR LE FIL PRINCIPAL. Capacitor appelle les methodes d'un plugin
 * depuis son propre fil ; l'arbre d'accessibilite se lit et se clique depuis
 * le fil principal. Une lecture faite ailleurs rend des noeuds vides par
 * moments -- et « rien a l'ecran » se lirait exactement comme « je n'ai rien
 * trouve », ce qui est le defaut qu'on passe le projet a corriger.
 */
@CapacitorPlugin(name = "Accessibilite")
public class AccessibilitePlugin extends Plugin {

    private final Handler principal = new Handler(Looper.getMainLooper());

    private void surLeFilPrincipal(Runnable travail) {
        principal.post(travail);
    }

    /** L'etat reel : autorise dans les reglages d'Android, et relie. */
    @PluginMethod
    public void etat(PluginCall call) {
        JSObject reponse = new JSObject();
        reponse.put("declare", JarvisAccessibiliteService.estDeclare(getContext()));
        reponse.put("actif", JarvisAccessibiliteService.actif() != null);
        call.resolve(reponse);
    }

    /**
     * Ouvre l'ecran d'Android ou Raphael accorde l'acces.
     *
     * Aucun bouton de l'application ne peut l'accorder a sa place : c'est un
     * acces special, comme « afficher par-dessus les autres applications ».
     * Meme motif que AutorisationsPlugin.ouvrirEcran -- on emmene au bon
     * endroit, on ne pretend pas faire le geste.
     */
    @PluginMethod
    public void ouvrirReglages(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Je n'arrive pas a ouvrir les reglages d'accessibilite d'Android.");
        }
    }

    @PluginMethod
    public void lireEcran(PluginCall call) {
        JarvisAccessibiliteService service = JarvisAccessibiliteService.actif();
        if (service == null) {
            JSObject reponse = new JSObject();
            reponse.put("disponible", false);
            reponse.put("raison", "service_inactif");
            call.resolve(reponse);
            return;
        }
        surLeFilPrincipal(() -> {
            JarvisAccessibiliteService.Lecture lecture = service.lire();
            JSObject reponse = new JSObject();
            if (lecture == null) {
                reponse.put("disponible", false);
                reponse.put("raison", "pas_de_vue");
                call.resolve(reponse);
                return;
            }
            JSArray elements = new JSArray();
            for (JarvisAccessibiliteService.Noeud n : lecture.elements) {
                JSObject e = new JSObject();
                e.put("index", n.index);
                e.put("libelle", n.libelle);
                e.put("cliquable", n.cliquable);
                e.put("defilable", n.defilable);
                e.put("dansListe", n.dansListe);
                if (n.classe != null) e.put("classe", n.classe);
                elements.put(e);
            }
            reponse.put("disponible", true);
            reponse.put("paquet", lecture.paquet);
            if (lecture.application != null) reponse.put("application", lecture.application);
            reponse.put("elements", elements);
            call.resolve(reponse);
        });
    }

    @PluginMethod
    public void cliquer(PluginCall call) {
        JarvisAccessibiliteService service = JarvisAccessibiliteService.actif();
        if (service == null) {
            call.resolve(new JSObject().put("resultat", "service_inactif"));
            return;
        }
        int index = call.getInt("index", -1);
        String libelle = call.getString("libelle", "");
        surLeFilPrincipal(() -> {
            JarvisAccessibiliteService.ResultatClic r = service.cliquer(index, libelle);
            String mot;
            switch (r) {
                case FAIT: mot = "fait"; break;
                case ECRAN_CHANGE: mot = "ecran_change"; break;
                case PAS_DE_VUE: mot = "pas_de_vue"; break;
                default: mot = "refus";
            }
            call.resolve(new JSObject().put("resultat", mot));
        });
    }

    @PluginMethod
    public void defiler(PluginCall call) {
        JarvisAccessibiliteService service = JarvisAccessibiliteService.actif();
        if (service == null) {
            call.resolve(new JSObject().put("ok", false).put("raison", "service_inactif"));
            return;
        }
        boolean bas = Boolean.TRUE.equals(call.getBoolean("bas", true));
        surLeFilPrincipal(() ->
            call.resolve(new JSObject().put("ok", service.defiler(bas)))
        );
    }

    @PluginMethod
    public void retour(PluginCall call) {
        JarvisAccessibiliteService service = JarvisAccessibiliteService.actif();
        if (service == null) {
            call.resolve(new JSObject().put("ok", false).put("raison", "service_inactif"));
            return;
        }
        surLeFilPrincipal(() -> call.resolve(new JSObject().put("ok", service.retour())));
    }

    @PluginMethod
    public void accueil(PluginCall call) {
        JarvisAccessibiliteService service = JarvisAccessibiliteService.actif();
        if (service == null) {
            call.resolve(new JSObject().put("ok", false).put("raison", "service_inactif"));
            return;
        }
        surLeFilPrincipal(() -> call.resolve(new JSObject().put("ok", service.accueil())));
    }
}
