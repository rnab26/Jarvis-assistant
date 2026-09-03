package com.raphael.jarvis;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import androidx.core.content.ContextCompat;
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

        File targetDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        File targetFile = new File(targetDir, FILE_NAME);
        if (targetFile.exists()) targetFile.delete();

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
            .setTitle("Mise à jour Jarvis")
            .setDescription("Téléchargement de la dernière version")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, FILE_NAME)
            .setMimeType("application/vnd.android.package-archive")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true);

        DownloadManager downloadManager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        long downloadId = downloadManager.enqueue(request);

        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (completedId != downloadId) return;
                context.unregisterReceiver(this);

                DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                android.database.Cursor cursor = dm.query(query);
                boolean success = false;
                if (cursor != null && cursor.moveToFirst()) {
                    int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                    success = statusIndex >= 0 && cursor.getInt(statusIndex) == DownloadManager.STATUS_SUCCESSFUL;
                }
                if (cursor != null) cursor.close();

                if (!success) {
                    call.reject("Le téléchargement a échoué.");
                    return;
                }

                Uri contentUri = FileProvider.getUriForFile(
                    context, context.getPackageName() + ".fileprovider", targetFile
                );
                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                context.startActivity(installIntent);
                call.resolve();
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        ContextCompat.registerReceiver(getContext(), receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }
}
