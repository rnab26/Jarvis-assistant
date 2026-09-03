package com.raphael.jarvis;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.provider.AlarmClock;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

/**
 * Ce que Jarvis peut déclencher dans les autres applications du téléphone.
 *
 * Tout passe par des intents Android, jamais par un service d'accessibilité.
 * Le cadrage écrit dans le cockpit est explicite là-dessus : piloter une autre
 * app à la place de l'utilisateur demanderait un Accessibility Service, qui
 * voit tout l'écran de toutes les apps — un risque disproportionné quand une
 * phrase mal comprise suffit à déclencher une action irréversible dans une
 * banque ou une messagerie. Les intents donnent l'essentiel du bénéfice :
 * ouvrir la bonne app sur le bon écran, pré-remplir le message, et laisser le
 * dernier geste à Raphaël.
 *
 * D'où la règle, qui n'est pas une limite subie mais le comportement voulu :
 * RIEN NE PART SANS SON GESTE. Un message est écrit et affiché, il appuie sur
 * envoyer ; un appel est composé, il appuie sur appeler. Seuls l'alarme et le
 * minuteur se posent directement — ils ne sortent pas du téléphone et se
 * défont d'un geste.
 */
@CapacitorPlugin(name = "ActionsTelephone")
public class ActionsTelephonePlugin extends Plugin {

    /** Lance une activité extérieure, en signalant proprement l'absence d'app. */
    private boolean lancer(Intent intent, PluginCall call, String siAbsent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            return true;
        } catch (Exception e) {
            call.reject(siAbsent);
            return false;
        }
    }

    /**
     * Les applications lançables installées, pour que Jarvis puisse faire
     * correspondre « mets Spotify » à un vrai paquet. Déclaré dans le manifeste
     * par un bloc <queries> plutôt que par QUERY_ALL_PACKAGES : on ne demande
     * que la liste des apps ouvrables, pas la visibilité sur tout l'appareil.
     */
    @PluginMethod
    public void listerApplications(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent lancables = new Intent(Intent.ACTION_MAIN, null);
        lancables.addCategory(Intent.CATEGORY_LAUNCHER);

        JSArray apps = new JSArray();
        List<String> vus = new ArrayList<>();
        for (ResolveInfo info : pm.queryIntentActivities(lancables, 0)) {
            String paquet = info.activityInfo.packageName;
            if (vus.contains(paquet)) continue;
            vus.add(paquet);
            JSObject app = new JSObject();
            app.put("nom", String.valueOf(info.loadLabel(pm)));
            app.put("paquet", paquet);
            apps.put(app);
        }
        JSObject res = new JSObject();
        res.put("applications", apps);
        call.resolve(res);
    }

    /**
     * Ouvre une application, et lui demande de jouer quelque chose si une
     * recherche est fournie.
     *
     * L'intent « joue ça » (INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH) est celui que
     * les apps de musique déclarent pour l'assistant du téléphone : Spotify,
     * YouTube Music et consorts démarrent directement la lecture. Si aucune ne
     * le comprend, on se rabat sur l'ouverture simple plutôt que d'échouer.
     */
    @PluginMethod
    public void ouvrirApplication(PluginCall call) {
        String paquet = call.getString("paquet");
        String recherche = call.getString("recherche");
        PackageManager pm = getContext().getPackageManager();

        if (recherche != null && !recherche.isEmpty()) {
            Intent lecture = new Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH);
            lecture.putExtra(android.app.SearchManager.QUERY, recherche);
            if (paquet != null && !paquet.isEmpty()) lecture.setPackage(paquet);
            lecture.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(lecture);
                call.resolve();
                return;
            } catch (Exception ignore) {
                // Aucune app de musique n'a déclaré cet intent : on ouvre l'app.
            }
        }

        if (paquet == null || paquet.isEmpty()) {
            call.reject("Je n'ai pas trouvé quelle application ouvrir.");
            return;
        }
        Intent ouverture = pm.getLaunchIntentForPackage(paquet);
        if (ouverture == null) {
            call.reject("Cette application n'est pas installée sur le téléphone.");
            return;
        }
        if (lancer(ouverture, call, "Impossible d'ouvrir cette application.")) call.resolve();
    }

    /**
     * Prépare un message WhatsApp. Deux chemins selon ce qu'on sait :
     * avec un numéro, on ouvre directement la conversation ; sans numéro, on
     * passe le texte à WhatsApp qui demande à qui l'envoyer. Dans les deux cas
     * l'envoi reste un geste de Raphaël — WhatsApp n'expose aucune API
     * permettant d'envoyer depuis un compte personnel, et c'est tant mieux.
     */
    @PluginMethod
    public void preparerWhatsApp(PluginCall call) {
        String texte = call.getString("texte", "");
        String numero = call.getString("numero");

        if (numero != null && !numero.isEmpty()) {
            String propre = numero.replaceAll("[^0-9+]", "").replace("+", "");
            String url = "https://wa.me/" + propre;
            if (!texte.isEmpty()) url += "?text=" + Uri.encode(texte);
            Intent conversation = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            if (lancer(conversation, call, "WhatsApp ne s'est pas ouvert.")) call.resolve();
            return;
        }

        Intent partage = new Intent(Intent.ACTION_SEND);
        partage.setType("text/plain");
        partage.putExtra(Intent.EXTRA_TEXT, texte);
        partage.setPackage("com.whatsapp");
        if (lancer(partage, call, "WhatsApp n'est pas installé sur ce téléphone.")) call.resolve();
    }

    /** Prépare un SMS : l'app de messages s'ouvre, le texte est déjà écrit. */
    @PluginMethod
    public void preparerSms(PluginCall call) {
        String texte = call.getString("texte", "");
        String numero = call.getString("numero");
        String cible = numero == null ? "" : numero.replaceAll("[^0-9+]", "");

        Intent sms = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + cible));
        sms.putExtra("sms_body", texte);
        if (lancer(sms, call, "Aucune application de messages n'a répondu.")) call.resolve();
    }

    /**
     * Compose le numéro sans le lancer : ACTION_DIAL, jamais ACTION_CALL.
     * Raphaël voit qui il s'apprête à appeler et appuie lui-même — un appel
     * déclenché sur une phrase mal comprise ne se rattrape pas.
     */
    @PluginMethod
    public void composer(PluginCall call) {
        String numero = call.getString("numero");
        if (numero == null || numero.isEmpty()) {
            call.reject("Je n'ai pas de numéro pour cette personne.");
            return;
        }
        Intent appel = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + numero.replaceAll("[^0-9+#*]", "")));
        if (lancer(appel, call, "Aucune application de téléphone n'a répondu.")) call.resolve();
    }

    /** Pose une alarme. Elle ne sort pas du téléphone et se supprime d'un
     * geste : on la crée directement plutôt que d'ouvrir un écran de plus. */
    @PluginMethod
    public void mettreAlarme(PluginCall call) {
        Integer heure = call.getInt("heure");
        Integer minute = call.getInt("minute");
        if (heure == null || minute == null) {
            call.reject("Il me manque l'heure de l'alarme.");
            return;
        }
        Intent alarme = new Intent(AlarmClock.ACTION_SET_ALARM);
        alarme.putExtra(AlarmClock.EXTRA_HOUR, heure);
        alarme.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        alarme.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        String libelle = call.getString("libelle");
        if (libelle != null && !libelle.isEmpty()) alarme.putExtra(AlarmClock.EXTRA_MESSAGE, libelle);
        if (lancer(alarme, call, "Aucune application d'horloge n'a répondu.")) call.resolve();
    }

    /** Lance un minuteur, même logique que l'alarme. */
    @PluginMethod
    public void mettreMinuteur(PluginCall call) {
        Integer secondes = call.getInt("secondes");
        if (secondes == null || secondes <= 0) {
            call.reject("Il me manque la durée du minuteur.");
            return;
        }
        Intent minuteur = new Intent(AlarmClock.ACTION_SET_TIMER);
        minuteur.putExtra(AlarmClock.EXTRA_LENGTH, secondes);
        minuteur.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        String libelle = call.getString("libelle");
        if (libelle != null && !libelle.isEmpty()) minuteur.putExtra(AlarmClock.EXTRA_MESSAGE, libelle);
        if (lancer(minuteur, call, "Aucune application d'horloge n'a répondu.")) call.resolve();
    }

    /**
     * Ouvre un itinéraire. On passe par le schéma "geo:", commun à toutes les
     * applications de cartes, plutôt que par un lien Google : n'importe quelle
     * app installée peut répondre, et l'utilisateur garde son choix.
     */
    @PluginMethod
    public void itineraire(PluginCall call) {
        String destination = call.getString("destination");
        if (destination == null || destination.isEmpty()) {
            call.reject("Il me manque la destination.");
            return;
        }
        Uri lieu = Uri.parse("geo:0,0?q=" + Uri.encode(destination));
        if (lancer(new Intent(Intent.ACTION_VIEW, lieu), call, "Aucune application de cartes n'a répondu.")) {
            call.resolve();
        }
    }
}
