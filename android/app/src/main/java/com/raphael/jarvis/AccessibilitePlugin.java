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

    /**
     * Combien de temps on laisse au service pour se rebrancher avant de
     * declarer forfait.
     *
     * MESURE QUI A FAIT ECRIRE CECI (chantier 21cf48d2, 10 sept. 2026) :
     * `journal_ecoute` montre trois `ecran_action` reussis les 6 et 7 sept.
     * (clic sur « Envoyer » dans WhatsApp), puis TROIS « service_inactif »
     * d'affilee -- dont un le 8 sept. a 21h50, quarante minutes APRES qu'il
     * ait reinstalle l'APK. Le diagnostic ecrit jusque-la etait la batterie.
     * Il etait faux, ou du moins incomplet : `estDeclare()` existait deja,
     * documente pour « distinguer pas autorise de autorise mais pas encore
     * demarre », et AUCUN des quatre chemins qui rendent « service_inactif »
     * ne l'appelait. L'application disait donc « va l'activer dans les
     * reglages » a quelqu'un qui l'avait deja active.
     *
     * Deux secondes : le rebranchement d'un service d'accessibilite par
     * Android prend une fraction de seconde. Plus long ferait attendre pour
     * rien quelqu'un qui n'a vraiment rien active -- mais ce cas-la ne passe
     * jamais par cette attente, il est ecarte avant par `estDeclare()`.
     */
    private static final long DELAI_CONNEXION_MS = 2000;

    private interface AvecService {
        void faire(JarvisAccessibiliteService service);
    }

    /**
     * Donne le service au travail demande, en l'ATTENDANT s'il n'est pas
     * encore relie -- et en distinguant les deux echecs, qui n'appellent pas
     * la meme reponse :
     *
     *   service_inactif  Raphael ne l'a pas autorise (ou Android l'a coupe).
     *                    Il faut aller dans les reglages : c'est vrai.
     *   service_endormi  Il l'a autorise, mais le service ne s'est pas
     *                    rebranche a temps. L'envoyer dans les reglages n'y
     *                    changerait rien -- c'est une panne, pas un oubli.
     *
     * Les confondre, c'est ce que l'application faisait depuis le debut.
     */
    private void avecService(
        PluginCall call,
        java.util.function.Function<String, JSObject> echec,
        AvecService travail
    ) {
        JarvisAccessibiliteService dejaLa = JarvisAccessibiliteService.actif();
        if (dejaLa != null) {
            surLeFilPrincipal(() -> travail.faire(dejaLa));
            return;
        }
        if (!JarvisAccessibiliteService.estDeclare(getContext())) {
            call.resolve(echec.apply("service_inactif"));
            return;
        }
        // Sur un fil A NOUS : attendreActif() bloque, et bloquer le fil
        // principal fige l'interface de Jarvis pendant deux secondes.
        new Thread(() -> {
            JarvisAccessibiliteService service =
                JarvisAccessibiliteService.attendreActif(DELAI_CONNEXION_MS);
            if (service == null) {
                call.resolve(echec.apply("service_endormi"));
                return;
            }
            surLeFilPrincipal(() -> travail.faire(service));
        }, "jarvis-attente-accessibilite").start();
    }

    /** L'echec d'une lecture : `disponible` faux, plus la raison. */
    private static JSObject echecLecture(String raison) {
        return new JSObject().put("disponible", false).put("raison", raison);
    }

    /** L'echec d'un geste : `ok` faux, plus la raison. */
    private static JSObject echecGeste(String raison) {
        return new JSObject().put("ok", false).put("raison", raison);
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
        avecService(call, AccessibilitePlugin::echecLecture, (service) -> {
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
        int index = call.getInt("index", -1);
        String libelle = call.getString("libelle", "");
        // Un clic rend son verdict dans `resultat`, pas dans `ok` : les deux
        // echecs du service y prennent donc la place d'un verdict.
        avecService(call, (raison) -> new JSObject().put("resultat", raison), (service) -> {
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
        boolean bas = Boolean.TRUE.equals(call.getBoolean("bas", true));
        avecService(call, AccessibilitePlugin::echecGeste, (service) ->
            call.resolve(new JSObject().put("ok", service.defiler(bas)))
        );
    }

    @PluginMethod
    public void retour(PluginCall call) {
        avecService(call, AccessibilitePlugin::echecGeste, (service) ->
            call.resolve(new JSObject().put("ok", service.retour()))
        );
    }

    @PluginMethod
    public void accueil(PluginCall call) {
        avecService(call, AccessibilitePlugin::echecGeste, (service) ->
            call.resolve(new JSObject().put("ok", service.accueil()))
        );
    }
}
