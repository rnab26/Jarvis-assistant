package com.raphael.jarvis;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Ce qui fait DÉFILER les tâches du widget d'écran d'accueil (chantier
 * 562f1475, 27 sept. 2026).
 *
 * Sa demande : « Peux tu faire en sorte quon puisse défiler les taches dans les
 * widgets creer de jarvis ». Ce n'était pas un réglage à monter : la liste était
 * un seul TextView tronqué à quatre lignes, et Android n'offre qu'UNE façon de
 * faire défiler quelque chose dans un widget — une vue de collection (ListView,
 * GridView, StackView) branchée sur un RemoteViewsService. D'où ce fichier.
 *
 * Il ne décide RIEN : `src/lib/widgetTaches.ts` choisit les lignes, leur ordre
 * et leur étiquette d'échéance, et les écrit en JSON dans le stockage natif.
 * Ici on ne fait que les relire et les poser. Une seconde règle de tri ou de
 * plafond écrite ici finirait par contredire l'onglet Tâches.
 */
public class JarvisWidgetTachesService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    /** Une ligne, telle que le JS l'a écrite. */
    private static final class Ligne {
        final String titre;
        final String echeance;
        final boolean urgent;

        Ligne(String titre, String echeance, boolean urgent) {
            this.titre = titre;
            this.echeance = echeance;
            this.urgent = urgent;
        }
    }

    private static final class Factory implements RemoteViewsFactory {

        /** @capacitor/preferences écrit dans ce fichier SharedPreferences. */
        private static final String PREFS_GROUP = "CapacitorStorage";
        /** Écrite par `updateWidgetSnapshot` (src/lib/widgetSnapshot.ts). */
        private static final String KEY_LIGNES = "jarvis_task_rows";

        /** En retard ou due aujourd'hui : même rouge que le compteur d'urgentes
         *  de l'en-tête, et que l'étiquette d'échéance de l'onglet Tâches. */
        private static final int ROUGE_URGENT = 0xFFFF7B72;
        private static final int GRIS_ECHEANCE = 0xFF8E8E93;

        private final Context context;
        private List<Ligne> lignes = new ArrayList<>();

        Factory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {
            relire();
        }

        /**
         * Appelé par Android après notifyAppWidgetViewDataChanged().
         *
         * C'est ICI que la liste se rafraîchit, pas dans le provider : une
         * fabrique vit plus longtemps qu'une mise à jour de widget, et sans
         * cette relecture elle servirait indéfiniment les tâches de la première
         * fois — une tâche cochée resterait affichée, ce que rien à l'écran ne
         * laisserait deviner.
         */
        @Override
        public void onDataSetChanged() {
            relire();
        }

        private void relire() {
            List<Ligne> lues = new ArrayList<>();
            SharedPreferences prefs = context.getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE);
            String brut = prefs.getString(KEY_LIGNES, "");
            if (brut != null && !brut.isEmpty()) {
                try {
                    JSONArray tableau = new JSONArray(brut);
                    for (int i = 0; i < tableau.length(); i++) {
                        JSONObject o = tableau.getJSONObject(i);
                        String titre = o.optString("titre", "");
                        if (titre.isEmpty()) continue;
                        lues.add(new Ligne(titre, o.optString("echeance", ""), o.optBoolean("urgent", false)));
                    }
                } catch (Throwable e) {
                    // JSON illisible (écriture interrompue, format d'une autre
                    // version) : on garde une liste VIDE, et setEmptyView dit
                    // « Aucune tâche ». Une exception ici ferait afficher au
                    // widget l'erreur d'Android à la place de la liste.
                    lues = new ArrayList<>();
                }
            }
            lignes = lues;
        }

        @Override
        public void onDestroy() {
            lignes = new ArrayList<>();
        }

        @Override
        public int getCount() {
            return lignes.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews vue = new RemoteViews(context.getPackageName(), R.layout.jarvis_widget_ligne);
            // getViewAt peut être appelé sur un index qui vient de disparaître
            // (la liste a changé entre deux dessins) : Android ne l'interdit
            // pas, et une IndexOutOfBounds ici vide le widget entier.
            if (position < 0 || position >= lignes.size()) return vue;

            Ligne ligne = lignes.get(position);
            vue.setTextViewText(R.id.widget_row_title, ligne.titre);
            vue.setTextViewText(R.id.widget_row_due, ligne.echeance);
            vue.setTextColor(R.id.widget_row_due, ligne.urgent ? ROUGE_URGENT : GRIS_ECHEANCE);

            // L'appui sur une ligne : le PendingIntent est posé une seule fois
            // sur la liste (setPendingIntentTemplate, dans le provider), et
            // chaque ligne n'y ajoute que de quoi la distinguer. Un
            // PendingIntent par ligne serait refusé — RemoteViews ne l'accepte
            // pas dans une vue de collection, et l'appui ne ferait rien.
            Intent remplissage = new Intent();
            remplissage.putExtra("tache_position", position);
            vue.setOnClickFillInIntent(R.id.widget_row_root, remplissage);

            return vue;
        }

        @Override
        public RemoteViews getLoadingView() {
            // null = la vue de chargement par défaut d'Android. La liste se lit
            // dans SharedPreferences, donc instantanément : une vue dédiée ne
            // serait jamais visible.
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            // Les positions bougent dès qu'une tâche est cochée ou datée :
            // annoncer des ids stables ferait réutiliser la mauvaise ligne.
            return false;
        }
    }
}
