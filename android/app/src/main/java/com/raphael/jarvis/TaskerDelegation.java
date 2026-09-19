package com.raphael.jarvis;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PatternMatcher;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * Delegue un clic a l'ecran a Tasker + son greffon AutoInput, plutot qu'au
 * service d'accessibilite maison (chantier d9ffb735, 18 sept. 2026).
 *
 * D'OU CA VIENT. Decision de Raphael, confirmee apres recherche (rapport de
 * recherche 77051ba6) : sur les formulaires dynamiques et les IDs generes a
 * l'execution -- exactement le cas ou JarvisAccessibiliteService.cliquer()
 * refuse en ECRAN_CHANGE parce que le libelle attendu n'est plus au meme rang
 * entre la lecture et le clic -- AutoInput relocalise l'element AU MOMENT DU
 * CLIC, par son texte, sans dependre d'un rang fige a l'avance. Tasker +
 * AutoInput sont deja installes et payes (confirme dans dev_log le 18 sept.
 * 2026), service d'accessibilite de Tasker active, optimisation batterie
 * desactivee pour Tasker.
 *
 * CE QUE CA NE TOUCHE PAS. Ni le "reviens en arriere"
 * (JarvisAccessibiliteService.retour(), inchange) -- le rapport de recherche
 * cite une source (forum officiel Tasker) documentant qu'AutoInput CASSE les
 * boutons Retour/Accueil/Recents sur Samsung One UI 7 -- ni la lecture
 * d'ecran, ni le defilement : seul le CLIC est delegue.
 *
 * LA SYNTAXE DE L'INTENT N'EST PAS DEVINEE : verifiee dans le code source
 * officiel (tasker.joaoapps.com/code/TaskerIntent.java) et
 * tasker.joaoapps.com/invoketasks.html. Le paquet utilise dans le NOM DES
 * INTENTS ("net.dinglisch.android.tasker") reste celui d'avant un
 * renommage passe -- different du paquet reellement INSTALLE depuis le Play
 * Store ("net.dinglisch.android.taskerm"). Les deux valeurs sont exactes,
 * verifiees separement, et ne doivent pas etre confondues.
 *
 * REPLI OBLIGATOIRE. Cette classe ne clique jamais "a moitie" : son verdict
 * est fait/pas fait, jamais une exception qui remonterait sans reponse.
 * `tenter()` rend toujours `false` au premier probleme -- absent, pas
 * configure, delai depasse, echec rapporte par la tache Tasker -- et c'est a
 * l'appelant (AccessibilitePlugin.cliquer) de se replier alors sur
 * JarvisAccessibiliteService, exactement comme si la delegation n'avait
 * jamais ete tentee. Rien ne doit jamais casser faute de Tasker.
 */
public final class TaskerDelegation {

    private TaskerDelegation() {}

    /** Le paquet reellement installe (Play Store), verifie separement du nom
     * utilise par les intents ci-dessous. */
    public static final String PAQUET_TASKER = "net.dinglisch.android.taskerm";
    public static final String PAQUET_AUTOINPUT = "com.joaomgcd.autoinput";

    /** Le nom de la tache que RAPHAEL doit creer lui-meme dans l'app Tasker,
     * avec une action du greffon AutoInput ("AutoInput Action", champ "Text"
     * pose sur "%cible", champ "Action" pose sur "Click" -- documente dans
     * Parametres, DelegationTasker.tsx). Ce code n'a rien a recopier de cette
     * tache : il envoie un ordre par intent, Tasker fait le geste avec son
     * propre moteur. Correspondance LITTERALE (PATTERN_LITERAL plus bas) :
     * un nom different, meme proche, ne repond jamais.
     */
    public static final String NOM_TACHE = "JarvisClic";

    /** La variable Tasker locale qui recoit le texte a cliquer, dans la
     * tache "JarvisClic". */
    public static final String NOM_VARIABLE_CIBLE = "%cible";

    // Constantes verifiees dans TaskerIntent.java (source officielle), pas
    // devinees. TASKER_PACKAGE y vaut "net.dinglisch.android.tasker" --
    // c'est le namespace des INTENTS, pas le paquet installe.
    private static final String ACTION_TASK = "net.dinglisch.android.tasker.ACTION_TASK";
    private static final String ACTION_TASK_COMPLETE = "net.dinglisch.android.tasker.ACTION_TASK_COMPLETE";
    private static final String EXTRA_TASK_NAME = "task_name";
    private static final String EXTRA_VAR_NAMES = "varNames";
    private static final String EXTRA_VAR_VALUES = "varValues";
    private static final String EXTRA_SUCCESS = "success";
    private static final String EXTRA_VERSION = "version_number";
    private static final String VERSION_INTENT = "1.1";
    private static final String SCHEME_ID = "id";
    private static final String SCHEME_TASK_COMPLETE = "task";

    /**
     * Le temps qu'on laisse a Tasker + AutoInput pour repondre avant de se
     * replier sur le service natif.
     *
     * NON MESURE : aucun appareil Android ici pour chronometrer un vrai
     * aller-retour. Premiere estimation genereuse (une action AutoInput peut
     * relire tout l'arbre d'accessibilite), a resserrer si une session
     * future mesure autre chose dans journal_ecoute -- ne pas presenter ce
     * chiffre comme verifie.
     */
    private static final long DELAI_REPONSE_MS = 8000;

    public static boolean installe(Context contexte, String paquet) {
        try {
            contexte.getPackageManager().getPackageInfo(paquet, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Les deux applications sont necessaires : l'une sans l'autre ne clique
     * pas (Tasker seul n'a pas la vue de l'ecran, AutoInput seul n'est pas
     * declenchable par intent). */
    public static boolean disponible(Context contexte) {
        return installe(contexte, PAQUET_TASKER) && installe(contexte, PAQUET_AUTOINPUT);
    }

    /**
     * Tente le clic via Tasker+AutoInput ; rend le resultat au `callback`,
     * appele EXACTEMENT UNE FOIS, sur un fil quelconque (jamais garanti
     * principal) : `true` seulement si la tache Tasker "JarvisClic" a
     * rapporte un succes avant le delai, `false` dans tous les autres cas --
     * Tasker ou AutoInput absent, tache absente ou "Allow External Access"
     * desactive (aucune reponse ne revient, donc le delai s'ecoule), delai
     * depasse, ou echec explicitement rapporte par la tache. Ne LEVE jamais :
     * c'est le contrat qui permet a l'appelant de toujours pouvoir se replier.
     */
    public static void tenter(Context contexteBrut, String cible, Consumer<Boolean> callback) {
        Context contexte = contexteBrut.getApplicationContext();
        if (!disponible(contexte)) {
            callback.accept(false);
            return;
        }

        Handler principal = new Handler(Looper.getMainLooper());
        AtomicBoolean repondu = new AtomicBoolean(false);
        BroadcastReceiver[] recepteurRef = new BroadcastReceiver[1];

        Runnable desinscrire = () -> {
            BroadcastReceiver r = recepteurRef[0];
            if (r != null) {
                recepteurRef[0] = null;
                try {
                    contexte.unregisterReceiver(r);
                } catch (Exception ignore) {
                    // Deja desinscrit, ou jamais enregistre : sans consequence.
                }
            }
        };

        Runnable delaiEcoule = () -> {
            if (repondu.compareAndSet(false, true)) {
                desinscrire.run();
                callback.accept(false);
            }
        };

        BroadcastReceiver recepteur = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (repondu.compareAndSet(false, true)) {
                    principal.removeCallbacks(delaiEcoule);
                    desinscrire.run();
                    callback.accept(intent.getBooleanExtra(EXTRA_SUCCESS, false));
                }
            }
        };
        recepteurRef[0] = recepteur;

        IntentFilter filtre = new IntentFilter(ACTION_TASK_COMPLETE);
        filtre.addDataScheme(SCHEME_TASK_COMPLETE);
        filtre.addDataPath(NOM_TACHE, PatternMatcher.PATTERN_LITERAL);

        try {
            // Depuis Android 14 (API 34), un recepteur dynamique qui doit
            // recevoir la diffusion d'une AUTRE application (Tasker) doit
            // declarer explicitement RECEIVER_EXPORTED, sinon Android le
            // refuse en silence.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                contexte.registerReceiver(recepteur, filtre, Context.RECEIVER_EXPORTED);
            } else {
                contexte.registerReceiver(recepteur, filtre);
            }
        } catch (Exception e) {
            repondu.set(true);
            callback.accept(false);
            return;
        }

        Intent declenchement = new Intent(ACTION_TASK);
        // Donnee unique par appel : evite qu'un vieux filtre en attente
        // ailleurs sur l'appareil ne matche par accident.
        declenchement.setData(Uri.parse(SCHEME_ID + ":" + UUID.randomUUID()));
        declenchement.putExtra(EXTRA_VERSION, VERSION_INTENT);
        declenchement.putExtra(EXTRA_TASK_NAME, NOM_TACHE);
        declenchement.putExtra(EXTRA_VAR_NAMES, new String[] { NOM_VARIABLE_CIBLE });
        declenchement.putExtra(EXTRA_VAR_VALUES, new String[] { cible });
        contexte.sendBroadcast(declenchement);

        principal.postDelayed(delaiEcoule, DELAI_REPONSE_MS);
    }
}
