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
 * plutôt que d'interroger Supabase lui-même. Mis à jour à chaque ouverture
 * de l'app (via JarvisWidgetPlugin.refresh()) et périodiquement par Android
 * (toutes les ~30 min, minimum imposé par le système).
 */
public class JarvisWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_GROUP = "CapacitorStorage";
    private static final String KEY_COUNT = "jarvis_task_count";
    private static final String KEY_TITLE = "jarvis_task_title";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateAllWidgets(context, appWidgetManager, appWidgetIds);
    }

    static void updateAllWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE);
        String count = prefs.getString(KEY_COUNT, "0");
        String title = prefs.getString(KEY_TITLE, "Aucune tâche");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.jarvis_widget);
            views.setTextViewText(R.id.widget_count, count + " tâche(s) à faire");
            views.setTextViewText(R.id.widget_title, title);

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
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
