package com.raphael.jarvis;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Widget « Jarvis — le cœur » : le réacteur seul, on appuie, il écoute.
 *
 * Pourquoi un SECOND widget et pas une option du premier : Android choisit la
 * taille minimale, l'aperçu et la description dans le XML du fournisseur, pas
 * à l'exécution. Un widget unique à deux modes garderait donc le plancher du
 * mode « tâches » (trois cases sur deux), alors que le cœur seul tient dans
 * une case. Deux fournisseurs = deux entrées dans le sélecteur de widgets,
 * chacune à sa vraie taille. Raphaël pose celui qu'il veut, ou les deux.
 *
 * Le code de l'appui est le même que celui du widget tâches — même extra
 * « demarrer_ecoute », donc l'app ouvre ET lance l'écoute, sans qu'il ait à
 * retoucher le micro derrière.
 */
public class JarvisCoreWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateAllWidgets(context, appWidgetManager, appWidgetIds);
    }

    static void updateAllWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.jarvis_widget_core);
            CoeurJarvis.poser(context, views, R.id.widget_core_image);
            views.setOnClickPendingIntent(R.id.widget_core_root, ouvrirEtEcouter(context));
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    /** Ouvre l'app en lui disant de se mettre à écouter tout de suite. */
    static PendingIntent ouvrirEtEcouter(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("demarrer_ecoute", true);
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
