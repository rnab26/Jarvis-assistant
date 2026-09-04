package com.raphael.jarvis;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.widget.RemoteViews;

import java.io.File;

/**
 * Le cœur de Jarvis, tel qu'il s'affiche sur un widget.
 *
 * Raphaël peut importer sa propre image depuis Paramètres. Elle vit côté web
 * dans localStorage, sous forme de data URL : inaccessible depuis un widget,
 * qui tourne hors du WebView. Le JS la recopie donc en fichier via
 * JarvisWidgetPlugin.setCoreImage(), et c'est ce fichier qu'on lit ici.
 *
 * Sans fichier — parce qu'il n'a rien importé, ou parce que l'app n'a pas
 * encore tourné depuis la mise à jour — on retombe sur le réacteur livré dans
 * l'APK. Le widget montre donc TOUJOURS un cœur, jamais un carré vide.
 */
final class CoeurJarvis {

    /** Écrit par JarvisWidgetPlugin.setCoreImage(). */
    static final String FICHIER = "coeur_jarvis.png";

    private CoeurJarvis() {}

    static File fichier(Context context) {
        return new File(context.getFilesDir(), FICHIER);
    }

    /**
     * Pose l'image sur une vue de widget.
     *
     * Une RemoteViews traverse un canal dont la charge utile est plafonnée
     * (environ 1 Mo pour l'ensemble de la mise à jour) : une image trop grande
     * ferait échouer la mise à jour ENTIÈRE, widget vide à la clé. Le JS
     * réduit déjà l'image avant de l'écrire ; ici on se contente d'ignorer un
     * fichier illisible et de garder le réacteur par défaut.
     */
    static void poser(Context context, RemoteViews views, int viewId) {
        File f = fichier(context);
        if (!f.exists()) return;
        try {
            Bitmap bitmap = BitmapFactory.decodeFile(f.getAbsolutePath());
            if (bitmap != null) views.setImageViewBitmap(viewId, bitmap);
        } catch (Throwable ignored) {
            // Image corrompue ou mémoire insuffisante : le réacteur par défaut
            // du layout reste en place, ce qui est exactement le bon repli.
        }
    }
}
