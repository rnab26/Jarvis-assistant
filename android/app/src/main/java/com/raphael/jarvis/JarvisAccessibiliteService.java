package com.raphael.jarvis;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.util.ArrayList;
import java.util.List;

/**
 * Le service qui permet a Jarvis d'appuyer sur l'ecran a la place de Raphael.
 *
 * D'OU CA VIENT. Raphael, 6 sept. 2026 : « quand il sort de Jarvis et va sur
 * une autre application, la deuxieme requete pour finaliser l'interaction, il
 * a du mal, il n'aboutit pas. [...] il faut aussi que ca puisse faire une
 * activation de clics tout simplement sur le telephone a la demande orale, et
 * ca ce n'est pas la pour n'importe quoi, pas que pour WhatsApp. »
 *
 * C'est donc une CAPACITE GENERALE, et une seule brique : lire ce qui est
 * affiche, retrouver l'element designe, cliquer, defiler, revenir en arriere.
 * WhatsApp et YouTube n'en sont que les premiers usages. Un mecanisme fait sur
 * mesure pour un bouton d'une application donnee serait a refaire a chaque
 * fois -- et casserait le jour ou cette application deplace son bouton.
 *
 * CE SERVICE NE DECIDE RIEN. Il rend la liste des elements et execute un clic
 * sur un rang precis. Quel element correspond a « la deuxieme video » est une
 * decision, elle vit dans src/lib/ecranTelephone.ts, ou elle se verifie sans
 * telephone. Meme partage que le reste du projet : le pont d'un cote, les
 * decisions de l'autre.
 *
 * LA REGLE DE SURETE EST APPLIQUEE ICI AUSSI, pas seulement cote TypeScript :
 * cliquer() reLIT l'arbre et refuse si le libelle attendu n'est plus a ce
 * rang. Entre la lecture et le clic, un ecran peut avoir change (une video
 * qui finit de charger, une notification). Cliquer au hasard dans une
 * application ouverte est une action qu'on ne rattrape pas.
 *
 * Il ne s'active PAS tout seul : c'est un acces special d'Android que seul
 * Raphael peut accorder, une fois, dans ses reglages.
 */
public class JarvisAccessibiliteService extends AccessibilityService {

    /** Au-dela, on ne lit plus : un arbre de plusieurs milliers de noeuds
     * n'apporte rien de designable a la voix et coute cher a parcourir. */
    private static final int MAX_NOEUDS = 400;

    private static JarvisAccessibiliteService instance;

    /** Le service reellement en vie, ou null. C'est l'etat REEL -- jamais un
     * reglage : Android peut couper un service d'accessibilite sans que
     * l'application en sache rien. */
    public static JarvisAccessibiliteService actif() {
        return instance;
    }

    /** Vrai si notre service est declare dans les reglages d'Android, meme
     * s'il n'est pas encore relie. Sert a distinguer « pas autorise » de
     * « autorise mais pas encore demarre ». */
    public static boolean estDeclare(Context contexte) {
        String actives = Settings.Secure.getString(
            contexte.getContentResolver(),
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        if (actives == null) return false;
        String nous = contexte.getPackageName() + "/" + JarvisAccessibiliteService.class.getName();
        String nousCourt = contexte.getPackageName() + "/." + JarvisAccessibiliteService.class.getSimpleName();
        for (String morceau : actives.split(":")) {
            if (morceau.equalsIgnoreCase(nous) || morceau.equalsIgnoreCase(nousCourt)) return true;
        }
        return false;
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    /** Rien a faire des evenements : Jarvis ne surveille pas l'ecran, il le
     * lit au moment ou une commande le demande. Surveiller en continu
     * reviendrait a enregistrer ce qu'il fait toute la journee. */
    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    /** Un noeud lu, avec son rang dans le parcours. */
    public static class Noeud {
        public int index;
        public String libelle;
        public boolean cliquable;
        public boolean defilable;
        /** Vrai si ce noeud est DANS une liste qui defile (RecyclerView,
         * ScrollView). C'est ce qui separe le contenu de la barre d'outils :
         * « la deuxieme video » ne veut pas dire « le deuxieme bouton de
         * l'ecran », qui serait la loupe de recherche. */
        public boolean dansListe;
        public String classe;
        public AccessibilityNodeInfo noeud;
    }

    /** Ce qu'une lecture d'ecran rend. */
    public static class Lecture {
        public String paquet = "";
        public String application = null;
        public List<Noeud> elements = new ArrayList<>();
    }

    private static String texteDe(AccessibilityNodeInfo n) {
        CharSequence t = n.getText();
        if (!TextUtils.isEmpty(t)) return t.toString().trim();
        CharSequence d = n.getContentDescription();
        if (!TextUtils.isEmpty(d)) return d.toString().trim();
        return "";
    }

    /** Un noeud sans clic propre reste designable si un de ses parents en a
     * un : dans une liste, c'est presque toujours la carte entiere qui recoit
     * le clic, et le titre qui porte le mot. */
    private static boolean cliquableAvecParents(AccessibilityNodeInfo n) {
        AccessibilityNodeInfo courant = n;
        for (int i = 0; i < 6 && courant != null; i++) {
            if (courant.isClickable()) return true;
            courant = courant.getParent();
        }
        return false;
    }

    private static AccessibilityNodeInfo cibleDuClic(AccessibilityNodeInfo n) {
        AccessibilityNodeInfo courant = n;
        for (int i = 0; i < 6 && courant != null; i++) {
            if (courant.isClickable()) return courant;
            courant = courant.getParent();
        }
        return null;
    }

    private void parcourir(AccessibilityNodeInfo n, Lecture lecture, boolean dansListe) {
        if (n == null || lecture.elements.size() >= MAX_NOEUDS) return;
        if (n.isVisibleToUser()) {
            String libelle = texteDe(n);
            if (!libelle.isEmpty() || n.isScrollable()) {
                Noeud noeud = new Noeud();
                noeud.index = lecture.elements.size();
                noeud.libelle = libelle;
                noeud.cliquable = cliquableAvecParents(n);
                noeud.defilable = n.isScrollable();
                noeud.dansListe = dansListe;
                CharSequence c = n.getClassName();
                noeud.classe = c == null ? null : c.toString();
                noeud.noeud = n;
                lecture.elements.add(noeud);
            }
        }
        boolean sousListe = dansListe || n.isScrollable();
        for (int i = 0; i < n.getChildCount(); i++) {
            parcourir(n.getChild(i), lecture, sousListe);
        }
    }

    /**
     * Ce qui est affiche en ce moment, dans l'ordre du parcours.
     *
     * Rend null quand Android ne donne pas de racine : cela arrive sur un
     * ecran systeme ou pendant une transition. « Je ne vois rien » et « je
     * n'ai pas pu regarder » ne se disent pas pareil, donc on ne rend pas une
     * liste vide a la place.
     */
    public Lecture lire() {
        AccessibilityNodeInfo racine = racineUtile();
        if (racine == null) return null;
        Lecture lecture = new Lecture();
        CharSequence p = racine.getPackageName();
        lecture.paquet = p == null ? "" : p.toString();
        lecture.application = nomApplication(lecture.paquet);
        parcourir(racine, lecture, false);
        return lecture;
    }

    /**
     * L'ecran QU'IL REGARDE, et pas le notre.
     *
     * PIEGE QUI REND TOUT LE RESTE INUTILE SI ON L'OUBLIE. Quand il parle a
     * Jarvis par l'appui long ou par la bulle, c'est AssistOverlayActivity qui
     * passe au premier plan : une vraie activite, avec un fond transparent.
     * getRootInActiveWindow() rend donc NOTRE fenetre, et Jarvis lirait sa
     * propre pastille au lieu des resultats YouTube -- « je ne trouve pas ça a
     * l'ecran », a chaque fois, sans que rien n'indique pourquoi. Or c'est
     * exactement la situation de tous ses cas d'usage : la commande arrive
     * TOUJOURS pendant qu'une autre application est dessous.
     *
     * On parcourt donc toutes les fenetres, on ecarte les notres, et on garde
     * celle du dessus. Repli sur la fenetre active quand il n'y a rien
     * d'autre : c'est le cas du bouton d'essai de Parametres, ou Jarvis est
     * seul a l'ecran.
     */
    private AccessibilityNodeInfo racineUtile() {
        String nous = getPackageName();
        AccessibilityNodeInfo meilleure = null;
        int meilleurCalque = Integer.MIN_VALUE;
        try {
            for (AccessibilityWindowInfo fenetre : getWindows()) {
                if (fenetre == null) continue;
                if (fenetre.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                AccessibilityNodeInfo r = fenetre.getRoot();
                if (r == null) continue;
                CharSequence p = r.getPackageName();
                if (p != null && nous.contentEquals(p)) continue;
                if (fenetre.getLayer() > meilleurCalque) {
                    meilleurCalque = fenetre.getLayer();
                    meilleure = r;
                }
            }
        } catch (Exception e) {
            // Certaines surcouches constructeur repondent de travers ici : on
            // retombe sur la fenetre active plutot que d'echouer.
        }
        if (meilleure != null) return meilleure;
        return getRootInActiveWindow();
    }

    private String nomApplication(String paquet) {
        if (paquet == null || paquet.isEmpty()) return null;
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(paquet, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** Ce qu'un clic a donne. Trois issues distinctes, jamais confondues :
     * fait, ecran change, refus du systeme. */
    public enum ResultatClic { FAIT, ECRAN_CHANGE, REFUS, PAS_DE_VUE }

    /**
     * Appuie sur l'element de rang `index`, mais seulement s'il porte encore
     * le libelle attendu.
     *
     * C'est la regle de surete qui ne se negocie pas : si l'ecran a change
     * entre-temps, on ne touche a RIEN et on le dit. Mieux vaut un envoi qui
     * n'est pas parti qu'un message parti a la mauvaise personne.
     */
    public ResultatClic cliquer(int index, String libelleAttendu) {
        Lecture lecture = lire();
        if (lecture == null) return ResultatClic.PAS_DE_VUE;
        if (index < 0 || index >= lecture.elements.size()) return ResultatClic.ECRAN_CHANGE;
        Noeud noeud = lecture.elements.get(index);
        String attendu = libelleAttendu == null ? "" : libelleAttendu.trim();
        if (!noeud.libelle.trim().equalsIgnoreCase(attendu)) return ResultatClic.ECRAN_CHANGE;

        AccessibilityNodeInfo cible = cibleDuClic(noeud.noeud);
        if (cible == null) return ResultatClic.REFUS;
        boolean ok = cible.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        return ok ? ResultatClic.FAIT : ResultatClic.REFUS;
    }

    /** Fait defiler le premier element defilable de l'ecran. Rend faux quand
     * il n'y en a pas -- « cet ecran ne defile pas » est une reponse, pas un
     * echec a taire. */
    public boolean defiler(boolean versLeBas) {
        Lecture lecture = lire();
        if (lecture == null) return false;
        int action = versLeBas
            ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
        for (Noeud n : lecture.elements) {
            if (n.defilable && n.noeud.performAction(action)) return true;
        }
        return false;
    }

    public boolean retour() {
        return performGlobalAction(GLOBAL_ACTION_BACK);
    }

    public boolean accueil() {
        return performGlobalAction(GLOBAL_ACTION_HOME);
    }
}
