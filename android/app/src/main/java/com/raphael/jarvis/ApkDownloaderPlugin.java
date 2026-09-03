package com.raphael.jarvis;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Télécharge et installe la dernière APK sans passer par un navigateur :
 * un lien externe cliqué depuis l'app est intercepté par Capacitor et
 * ouvert dans un nouveau contexte Chrome (Intent système), où le
 * téléchargement d'un gros fichier binaire ne se finalise pas de façon
 * fiable (bug observé sur device). DownloadManager est l'API Android
 * prévue pour ça : téléchargement en tâche de fond géré par l'OS,
 * notification de progression native, reprise automatique en cas de
 * coupure réseau.
 */
@CapacitorPlugin(name = "ApkDownloader")
public class ApkDownloaderPlugin extends Plugin {

    private static final String FILE_NAME = "jarvis-update.apk";
    /** Intervalle d'interrogation de DownloadManager. */
    private static final long POLL_MS = 500;
    /** Filet de sécurité : au-delà, on rend la main plutôt que de laisser
     * le bouton bloqué sur "Téléchargement..." indéfiniment. */
    private static final long TIMEOUT_MS = 10 * 60 * 1000;

    @PluginMethod
    public void hasInstallPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", canInstallPackages());
        call.resolve(result);
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** Ouvre l'écran système "Autoriser cette source" — Android ne permet
     * pas de demander cette permission spéciale autrement. */
    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL manquante.");
            return;
        }
        if (!canInstallPackages()) {
            call.reject("Permission d'installation manquante.");
            return;
        }

        Context context = getContext();
        File targetDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        File targetFile = new File(targetDir, FILE_NAME);
        // Sans ça, DownloadManager écrirait à côté (jarvis-update-1.apk) et
        // on installerait indéfiniment le PREMIER fichier téléchargé.
        if (targetFile.exists() && !targetFile.delete()) {
            call.reject("Impossible de supprimer le téléchargement précédent.");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
            .setTitle("Mise à jour Jarvis")
            .setDescription("Téléchargement de la dernière version")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, FILE_NAME)
            .setMimeType("application/vnd.android.package-archive")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true);
        // L'URL de la release est fixe et le fichier change à chaque build :
        // on interdit explicitement toute réponse mise en cache, sinon on
        // réinstalle l'ancienne APK en croyant se mettre à jour.
        request.addRequestHeader("Cache-Control", "no-cache");

        DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        long downloadId = downloadManager.enqueue(request);

        // Interrogation périodique plutôt qu'un BroadcastReceiver sur
        // ACTION_DOWNLOAD_COMPLETE : ce broadcast est émis par l'app
        // système DownloadManager (un autre UID), sa réception dépend donc
        // du flag exported du receiver et n'est pas garantie selon les
        // versions d'Android. Ici, l'issue du téléchargement ne peut pas
        // être manquée — c'est précisément ce silence-là qui donnait
        // "je télécharge et il ne se passe rien".
        Handler handler = new Handler(Looper.getMainLooper());
        final long debut = System.currentTimeMillis();
        handler.post(new Runnable() {
            @Override
            public void run() {
                int status = -1;
                int reason = 0;
                long recus = -1;
                long total = -1;
                Cursor cursor = downloadManager.query(new DownloadManager.Query().setFilterById(downloadId));
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                        int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                        int recusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                        int totalIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                        if (statusIndex >= 0) status = cursor.getInt(statusIndex);
                        if (reasonIndex >= 0) reason = cursor.getInt(reasonIndex);
                        if (recusIndex >= 0) recus = cursor.getLong(recusIndex);
                        if (totalIndex >= 0) total = cursor.getLong(totalIndex);
                    }
                    cursor.close();
                }

                // Émis à chaque tour tant que ça télécharge, pour la barre de
                // progression côté app. La taille totale n'est parfois pas
                // connue tout de suite (réponse chunkée) : on ne prétend pas
                // avoir un pourcentage avant de l'avoir vraiment.
                if (status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PENDING) {
                    JSObject progres = new JSObject();
                    progres.put("recus", recus);
                    progres.put("total", total);
                    notifyListeners("progression", progres);
                }

                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    lancerInstallation(call, targetFile);
                    return;
                }
                if (status == DownloadManager.STATUS_FAILED) {
                    call.reject("Le téléchargement a échoué (code " + reason + ").");
                    return;
                }
                // -1 = aucune ligne pour cet identifiant. Juste après
                // enqueue() la ligne existe déjà, mais on laisse une marge
                // plutôt que d'échouer sur une course de départ.
                if (status == -1 && System.currentTimeMillis() - debut > 5000) {
                    call.reject("Le téléchargement a disparu de la file d'attente d'Android.");
                    return;
                }
                if (System.currentTimeMillis() - debut > TIMEOUT_MS) {
                    downloadManager.remove(downloadId);
                    call.reject("Le téléchargement n'a pas abouti dans le temps imparti.");
                    return;
                }
                handler.postDelayed(this, POLL_MS);
            }
        });
    }

    private void lancerInstallation(PluginCall call, File apk) {
        Context context = getContext();
        // Un fichier vide ou tronqué déclencherait un "Échec de l'analyse
        // du package" sans explication : autant le dire ici.
        if (!apk.exists() || apk.length() == 0) {
            call.reject("Le fichier téléchargé est introuvable ou vide.");
            return;
        }
        try {
            Uri contentUri = FileProvider.getUriForFile(
                context, context.getPackageName() + ".fileprovider", apk
            );
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            context.startActivity(installIntent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Impossible d'ouvrir l'installateur Android : " + e.getMessage());
        }
    }
}
