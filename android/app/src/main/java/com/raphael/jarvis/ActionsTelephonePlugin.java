package com.raphael.jarvis;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.media.AudioManager;
import android.database.Cursor;
import android.provider.AlarmClock;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.view.KeyEvent;
import androidx.core.content.ContextCompat;
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
@CapacitorPlugin(
    name = "ActionsTelephone",
    permissions = {
        @com.getcapacitor.annotation.Permission(alias = "telephone", strings = { Manifest.permission.CALL_PHONE }),
        // Le répertoire du téléphone, et non un carnet d'adresses que Jarvis
        // tiendrait de son côté. Raphaël, 5 sept. 2026 : « pour l'accès à mes
        // contacts, l'onglet contacts ne me sert à rien. Moi c'était juste
        // pour dire "rappelle ma femme à 23h22" et il me répond qu'il n'a pas
        // son numéro. » Sans cette permission, il ne voyait qu'un carnet vide.
        @com.getcapacitor.annotation.Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS })
    }
)
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
     * Le répertoire du téléphone, en lecture seule.
     *
     * Rien n'est copié ni conservé : la liste est lue à la demande et rendue
     * telle quelle au JS, qui s'en sert pour retrouver un numéro et l'oublie.
     * Recopier le répertoire dans la base de Jarvis en ferait une deuxième
     * source de vérité qui divergerait dès le premier contact modifié dans le
     * téléphone — c'est exactement ce que l'onglet Contacts faisait, et
     * pourquoi il ne servait à rien.
     *
     * Un contact peut avoir plusieurs numéros : chacun est une entrée, avec
     * son étiquette (mobile, domicile), pour que « appelle sa femme » ne
     * tombe pas au hasard sur un fax.
     */
    @PluginMethod
    public void lireContacts(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("contacts", call, "apresPermissionContacts");
            return;
        }
        rendreContacts(call);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void apresPermissionContacts(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) {
            // Refus explicite : on le DIT, au lieu de rendre une liste vide qui
            // se lirait comme « tu n'as aucun contact ».
            call.reject("REFUS_CONTACTS");
            return;
        }
        rendreContacts(call);
    }

    private void rendreContacts(PluginCall call) {
        JSArray contacts = new JSArray();
        String[] colonnes = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.TYPE,
            ContactsContract.CommonDataKinds.Phone.LABEL
        };
        try (Cursor c = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                colonnes,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
            if (c != null) {
                int iNom = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int iNum = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                int iType = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.TYPE);
                int iLabel = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.LABEL);
                while (c.moveToNext()) {
                    String nom = iNom >= 0 ? c.getString(iNom) : null;
                    String numero = iNum >= 0 ? c.getString(iNum) : null;
                    if (nom == null || numero == null) continue;
                    JSObject o = new JSObject();
                    o.put("nom", nom);
                    o.put("numero", numero);
                    CharSequence etiquette = ContactsContract.CommonDataKinds.Phone.getTypeLabel(
                        getContext().getResources(),
                        iType >= 0 ? c.getInt(iType) : 0,
                        iLabel >= 0 ? c.getString(iLabel) : null);
                    o.put("etiquette", etiquette == null ? "" : etiquette.toString());
                    contacts.put(o);
                }
            }
        } catch (Exception e) {
            call.reject("Impossible de lire le répertoire : " + e.getMessage());
            return;
        }
        JSObject res = new JSObject();
        res.put("contacts", contacts);
        call.resolve(res);
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

    /**
     * Envoie du texte vers une application quelconque (relais d'une question
     * vers une IA installée — ChatGPT, Perplexity, Claude...), via le même
     * mécanisme de partage qu'un utilisateur ferait à la main. Le paquet est
     * obligatoire : contrairement à la musique ou l'itinéraire, il n'existe
     * pas d'intent générique "pose une question à une IA" que le système
     * saurait résoudre tout seul.
     */
    @PluginMethod
    public void envoyerTexte(PluginCall call) {
        String paquet = call.getString("paquet");
        String texte = call.getString("texte", "");
        if (paquet == null || paquet.isEmpty()) {
            call.reject("Je ne sais pas à quelle application l'envoyer.");
            return;
        }
        Intent partage = new Intent(Intent.ACTION_SEND);
        partage.setType("text/plain");
        partage.putExtra(Intent.EXTRA_TEXT, texte);
        partage.setPackage(paquet);
        if (lancer(partage, call, "Cette application n'a pas répondu.")) call.resolve();
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
     * Appelle. Directement si Raphaël a donné la permission d'appeler, sinon
     * en composant le numéro pour qu'il n'ait plus qu'à appuyer.
     *
     * Il a tranché explicitement : passer un appel ne pose pas de problème,
     * et un assistant qui demande une confirmation pour tout ne sert à rien
     * de plus que ceux déjà intégrés au téléphone. On respecte son choix, et
     * on garde le repli sur la composition tant que la permission n'est pas
     * accordée — plutôt que d'échouer.
     */
    @PluginMethod
    public void composer(PluginCall call) {
        String numero = call.getString("numero");
        if (numero == null || numero.isEmpty()) {
            call.reject("Je n'ai pas de numéro pour cette personne.");
            return;
        }
        String propre = numero.replaceAll("[^0-9+#*]", "");
        boolean peutAppeler = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE)
            == PackageManager.PERMISSION_GRANTED;

        Intent appel = new Intent(peutAppeler ? Intent.ACTION_CALL : Intent.ACTION_DIAL,
            Uri.parse("tel:" + propre));
        if (lancer(appel, call, "Aucune application de téléphone n'a répondu.")) {
            JSObject res = new JSObject();
            res.put("direct", peutAppeler);
            call.resolve(res);
        }
    }

    /** Demande la permission d'appeler, une seule fois. */
    @PluginMethod
    public void demanderPermissionAppel(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE)
            == PackageManager.PERMISSION_GRANTED) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }
        requestPermissionForAlias("telephone", call, "retourPermissionAppel");
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void retourPermissionAppel(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted",
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE)
                == PackageManager.PERMISSION_GRANTED);
        call.resolve(res);
    }

    /**
     * Pilote ce qui joue en ce moment : lecture, pause, morceau suivant ou
     * précédent. Passe par les touches multimédia du système, celles des
     * écouteurs — donc sans aucune permission, sans service d'accessibilité,
     * et quelle que soit l'application qui joue.
     */
    @PluginMethod
    public void commanderMedia(PluginCall call) {
        String commande = call.getString("commande", "play_pause");
        int touche;
        switch (commande) {
            case "suivant": touche = KeyEvent.KEYCODE_MEDIA_NEXT; break;
            case "precedent": touche = KeyEvent.KEYCODE_MEDIA_PREVIOUS; break;
            case "stop": touche = KeyEvent.KEYCODE_MEDIA_STOP; break;
            case "lecture": touche = KeyEvent.KEYCODE_MEDIA_PLAY; break;
            case "pause": touche = KeyEvent.KEYCODE_MEDIA_PAUSE; break;
            default: touche = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE; break;
        }
        AudioManager audio = (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
        if (audio == null) {
            call.reject("Le contrôle du son n'est pas disponible.");
            return;
        }
        // Il faut les deux événements : une app qui ne voit que l'appui sans
        // le relâchement ignore la commande.
        audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, touche));
        audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, touche));
        call.resolve();
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
     * applications de cartes. Sans paquet visé, ET avec Waze ET Google Maps
     * installés, Android ouvre son sélecteur ("Terminer l'action avec…") —
     * même défaut que la musique, même correctif : si Raphaël a déjà dit
     * quelle application il utilise, on la vise directement.
     */
    @PluginMethod
    public void itineraire(PluginCall call) {
        String destination = call.getString("destination");
        if (destination == null || destination.isEmpty()) {
            call.reject("Il me manque la destination.");
            return;
        }
        String paquet = call.getString("paquet");
        Uri lieu = Uri.parse("geo:0,0?q=" + Uri.encode(destination));
        Intent itineraire = new Intent(Intent.ACTION_VIEW, lieu);
        if (paquet != null && !paquet.isEmpty()) itineraire.setPackage(paquet);
        if (lancer(itineraire, call, "Aucune application de cartes n'a répondu.")) {
            call.resolve();
        }
    }
}
