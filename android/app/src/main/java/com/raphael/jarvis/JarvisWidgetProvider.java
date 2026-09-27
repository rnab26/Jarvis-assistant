package com.raphael.jarvis;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Widget d'écran d'accueil "instantané" : lit un résumé écrit par l'app
 * (via @capacitor/preferences, fichier SharedPreferences "CapacitorStorage")
 * plutôt que d'interroger Supabase lui-même. Mis à jour à chaque changement
 * de tâches ou de config widget (via JarvisWidgetPlugin.refresh()) et
 * périodiquement par Android (toutes les ~30 min, minimum imposé par le
 * système).
 *
 * La LISTE, elle, n'est plus remplie ici : elle défile depuis le chantier
 * 562f1475 (27 sept. 2026), et c'est JarvisWidgetTachesService qui la
 * fabrique, ligne par ligne. Ce fichier ne fait plus que la brancher.
 */
public class JarvisWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_GROUP = "CapacitorStorage";
    private static final String KEY_COUNT = "jarvis_task_count";
    private static final String KEY_URGENT_COUNT = "jarvis_urgent_count";
    private static final String KEY_CATEGORY_LABEL = "jarvis_category_label";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateAllWidgets(context, appWidgetManager, appWidgetIds);
    }

    static void updateAllWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE);
        String count = prefs.getString(KEY_COUNT, "0");
        int urgentCount = 0;
        try {
            urgentCount = Integer.parseInt(prefs.getString(KEY_URGENT_COUNT, "0"));
        } catch (NumberFormatException ignored) {
        }
        String categoryLabel = prefs.getString(KEY_CATEGORY_LABEL, "Toutes catégories");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.jarvis_widget);
            CoeurJarvis.poser(context, views, R.id.widget_core);
            views.setTextViewText(R.id.widget_count, count + " à faire");
            views.setTextViewText(R.id.widget_category_label, categoryLabel);
            if (urgentCount > 0) {
                views.setTextViewText(R.id.widget_urgent, urgentCount + " urgent" + (urgentCount > 1 ? "es" : "e"));
            } else {
                views.setTextViewText(R.id.widget_urgent, "");
            }

            // La liste défilante. L'intent doit être UNIQUE PAR WIDGET : Android
            // distingue deux adaptateurs par les données de leur intent, extras
            // exclus. Sans ce setData, deux widgets posés côte à côte
            // partageraient une seule fabrique, et le second se figerait sur le
            // contenu du premier — en silence.
            Intent lignes = new Intent(context, JarvisWidgetTachesService.class);
            lignes.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            lignes.setData(Uri.parse(lignes.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.widget_task_list, lignes);

            // Aucune tâche : on le DIT. Sans setEmptyView, une liste vide est un
            // rectangle vide, qui se lit exactement comme un widget en panne.
            views.setEmptyView(R.id.widget_task_list, R.id.widget_task_empty);

            // Un appui sur le CŒUR ou sur l'en-tête ouvre l'app ET lance
            // l'écoute — pas juste ouvrir, en laissant Raphaël retoucher le
            // micro derrière (chantier 0ea8fd8d). L'intent est construit au même
            // endroit que celui du widget cœur, sinon les deux dérivent.
            //
            // CE N'EST PLUS LA RACINE, et ce n'est pas un oubli : une ListView
            // consomme les appuis qui la touchent, donc un clic posé sur la
            // racine ne serait jamais reçu au-dessus de la liste. Les deux
            // cibles restantes couvrent toute la surface hors liste.
            PendingIntent ecouter = JarvisCoreWidgetProvider.ouvrirEtEcouter(context);
            views.setOnClickPendingIntent(R.id.widget_core, ecouter);
            views.setOnClickPendingIntent(R.id.widget_header, ecouter);

            // Un appui sur une TÂCHE ouvre l'app sans rien dicter : il veut voir
            // sa liste, pas parler. C'est le geste attendu de n'importe quel
            // widget de tâches, et le cœur est juste à côté pour l'autre.
            views.setPendingIntentTemplate(R.id.widget_task_list, ouvrirLesTaches(context));

            appWidgetManager.updateAppWidget(appWidgetId, views);

            // À FAIRE APRÈS updateAppWidget, et jamais à omettre : c'est le seul
            // signal qui fait relire la fabrique. Sans lui, le widget garderait
            // les tâches de son premier dessin — une tâche cochée y resterait
            // affichée jusqu'au prochain redémarrage.
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_task_list);
        }
    }

    /**
     * Ouvre l'app sur ses tâches, sans lancer l'écoute.
     *
     * L'onglet Tâches est la route « / » : il n'y a donc rien à naviguer, il
     * suffit d'ouvrir. Un extra « demarrer_ecoute » serait exactement ce qu'on
     * ne veut pas ici — MainActivity le lit et ouvrirait le micro.
     *
     * FLAG_MUTABLE, contrairement à ouvrirEtEcouter : c'est un modèle
     * (setPendingIntentTemplate), et Android y complète l'intent avec ce que
     * chaque ligne ajoute. Immuable, le système refuse de le remplir.
     */
    private static PendingIntent ouvrirLesTaches(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            context,
            1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
    }
}
