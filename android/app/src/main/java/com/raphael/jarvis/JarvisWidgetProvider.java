package com.raphael.jarvis;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Widget d'écran d'accueil "instantané" : lit un résumé écrit par l'app
 * (via @capacitor/preferences, fichier SharedPreferences "CapacitorStorage")
 * plutôt que d'interroger Supabase lui-même. Mis à jour à chaque changement
 * de tâches ou de config widget (via JarvisWidgetPlugin.refresh()) et
 * périodiquement par Android (toutes les ~30 min, minimum imposé par le
 * système).
 */
public class JarvisWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_GROUP = "CapacitorStorage";
    private static final String KEY_COUNT = "jarvis_task_count";
    private static final String KEY_URGENT_COUNT = "jarvis_urgent_count";
    private static final String KEY_TASK_TITLES = "jarvis_task_titles";
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
        String titles = prefs.getString(KEY_TASK_TITLES, "");
        String categoryLabel = prefs.getString(KEY_CATEGORY_LABEL, "Toutes catégories");

        String taskList = titles.isEmpty() ? "Aucune tâche" : "• " + titles.replace("\n", "\n• ");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.jarvis_widget);
            views.setTextViewText(R.id.widget_count, count + " tâche(s) à faire");
            views.setTextViewText(R.id.widget_task_list, taskList);
            views.setTextViewText(R.id.widget_category_label, categoryLabel);
            if (urgentCount > 0) {
                views.setTextViewText(R.id.widget_urgent, urgentCount + " urgente(s)");
            } else {
                views.setTextViewText(R.id.widget_urgent, "");
            }

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            // Un appui doit ouvrir l'app ET lancer l'écoute directement — pas
            // juste ouvrir, en laissant Raphaël retoucher le micro derrière.
            intent.putExtra("demarrer_ecoute", true);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
