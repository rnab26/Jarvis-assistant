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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

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
    /**
     * Au-delà de ce délai SANS LE MOINDRE OCTET, on cesse d'attendre
     * DownloadManager et on télécharge nous-mêmes.
     *
     * Raphael, 6 sept. 2026 : « Telechargement... », la barre vide, « 0.0 Mo
     * recus » indefiniment, et cote GitHub le compteur de telechargements de
     * l'APK a zero — sa requete n'atteignait jamais le serveur. Dix minutes a
     * regarder une barre vide ne sont pas un etat, c'est une panne muette :
     * vingt secondes suffisent largement pour que le premier octet arrive
     * d'une release GitHub, meme en 3G.
     */
    private static final long DELAI_SANS_OCTET_MS = 20 * 1000;

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

        // ENQUEUE PROTEGE. Sur Samsung et Xiaomi, l'application systeme
        // « Gestionnaire de telechargement » se desactive : getSystemService
        // rend alors null, ou enqueue() leve. Sans ce garde, la promesse ne
        // se resolvait ni ne se rejetait — l'ecran restait sur
        // « Telechargement... » pour toujours, et c'est exactement ce qu'il a
        // vu. On ne s'arrete pas la pour autant : on telecharge nous-memes.
        final DownloadManager downloadManager =
            (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        long id;
        try {
            if (downloadManager == null) throw new IllegalStateException("indisponible");
            id = downloadManager.enqueue(request);
        } catch (Throwable e) {
            telechargerNousMemes(call, url, targetFile, "gestionnaire_indisponible");
            return;
        }
        final long downloadId = id;

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
                // STATUS_PAUSED etait le grand absent, et c'est lui qui gele
                // l'ecran : en pause, aucun evenement n'etait emis, donc le
                // dernier « 0.0 Mo recus » restait affiche tel quel pendant
                // dix minutes. On l'emet, avec la RAISON, pour que la pause
                // se lise comme une pause et pas comme un plantage.
                if (status == DownloadManager.STATUS_RUNNING
                        || status == DownloadManager.STATUS_PENDING
                        || status == DownloadManager.STATUS_PAUSED) {
                    JSObject progres = new JSObject();
                    progres.put("recus", recus);
                    progres.put("total", total);
                    progres.put("enPause", status == DownloadManager.STATUS_PAUSED);
                    if (status == DownloadManager.STATUS_PAUSED) {
                        progres.put("pourquoi", raisonDePause(reason));
                    }
                    notifyListeners("progression", progres);
                }

                // RIEN N'EST ARRIVE. Vingt secondes sans un octet : ce n'est
                // pas un reseau lent, c'est un telechargement qui ne partira
                // pas. On abandonne DownloadManager et on le fait nous-memes
                // plutot que de le laisser devant une barre vide.
                if (recus <= 0 && System.currentTimeMillis() - debut > DELAI_SANS_OCTET_MS) {
                    try {
                        downloadManager.remove(downloadId);
                    } catch (Throwable ignore) {
                        // rien a faire : au pire la ligne reste dans la file
                    }
                    telechargerNousMemes(call, url, targetFile, "aucun_octet");
                    return;
                }

                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    lancerInstallation(call, targetFile);
                    return;
                }
                if (status == DownloadManager.STATUS_FAILED) {
                    telechargerNousMemes(call, url, targetFile, "echec_" + reason);
                    return;
                }
                // -1 = aucune ligne pour cet identifiant. Juste après
                // enqueue() la ligne existe déjà, mais on laisse une marge
                // plutôt que d'échouer sur une course de départ.
                if (status == -1 && System.currentTimeMillis() - debut > 5000) {
                    telechargerNousMemes(call, url, targetFile, "absent_de_la_file");
                    return;
                }
                if (System.currentTimeMillis() - debut > TIMEOUT_MS) {
                    try {
                        downloadManager.remove(downloadId);
                    } catch (Throwable ignore) {
                        // rien a faire
                    }
                    call.reject("Le téléchargement n'a pas abouti dans le temps imparti.");
                    return;
                }
                handler.postDelayed(this, POLL_MS);
            }
        });
    }

    /** Ce qu'une pause de DownloadManager veut dire, en francais. Un code
     * numerique ne lui apprend rien ; « ton telephone attend le Wi-Fi » lui
     * dit quoi faire. */
    private String raisonDePause(int reason) {
        switch (reason) {
            case DownloadManager.PAUSED_WAITING_FOR_NETWORK:
                return "en attente du reseau";
            case DownloadManager.PAUSED_QUEUED_FOR_WIFI:
                return "en attente du Wi-Fi";
            case DownloadManager.PAUSED_WAITING_TO_RETRY:
                return "nouvel essai en cours";
            default:
                return "en pause";
        }
    }

    /**
     * LE REPLI QUI NE DEPEND DE RIEN : on telecharge nous-memes.
     *
     * Pourquoi il existe. Le 6 sept. 2026, Raphael ne pouvait plus mettre a
     * jour du tout : « Telechargement... », la barre vide, « 0.0 Mo recus »
     * indefiniment. Tant que ca tenait, AUCUN correctif touchant le natif ne
     * pouvait lui parvenir — c'est le blocage qui bloque tous les autres.
     * DownloadManager est une application systeme separee, qui peut etre
     * desactivee, mise en pause par un reglage d'economie de donnees, ou
     * simplement ne jamais demarrer. Elle est pratique quand elle marche ;
     * elle ne peut pas etre le seul chemin.
     *
     * Ici il n'y a rien d'autre qu'une connexion HTTPS et un fichier : pas
     * d'application tierce, pas de service systeme, pas de notification. Les
     * redirections de GitHub (release -> objects.githubusercontent.com) sont
     * suivies par HttpURLConnection, et la progression est emise comme celle
     * de DownloadManager, pour que l'ecran ne change pas de langage en cours
     * de route.
     */
    private void telechargerNousMemes(PluginCall call, String url, File cible, String pourquoi) {
        JSObject avis = new JSObject();
        avis.put("pourquoi", pourquoi);
        notifyListeners("repli", avis);

        new Thread(() -> {
            HttpURLConnection connexion = null;
            try {
                File dossier = cible.getParentFile();
                if (dossier != null && !dossier.exists() && !dossier.mkdirs()) {
                    call.reject("Impossible de creer le dossier de telechargement.");
                    return;
                }
                connexion = (HttpURLConnection) new URL(url).openConnection();
                connexion.setInstanceFollowRedirects(true);
                connexion.setConnectTimeout(20000);
                connexion.setReadTimeout(30000);
                connexion.setRequestProperty("Cache-Control", "no-cache");
                connexion.connect();

                int code = connexion.getResponseCode();
                if (code < 200 || code >= 300) {
                    call.reject("GitHub a repondu " + code + " au telechargement direct.");
                    return;
                }
                long total = connexion.getContentLength();

                try (InputStream entree = connexion.getInputStream();
                     FileOutputStream sortie = new FileOutputStream(cible)) {
                    byte[] tampon = new byte[64 * 1024];
                    long recus = 0;
                    long derniereAnnonce = 0;
                    int lus;
                    while ((lus = entree.read(tampon)) != -1) {
                        sortie.write(tampon, 0, lus);
                        recus += lus;
                        // Une annonce tous les 200 Ko : assez pour que la
                        // barre avance visiblement, assez peu pour ne pas
                        // noyer le pont Capacitor a chaque bloc de 64 Ko.
                        if (recus - derniereAnnonce >= 200_000) {
                            derniereAnnonce = recus;
                            JSObject progres = new JSObject();
                            progres.put("recus", recus);
                            progres.put("total", total);
                            notifyListeners("progression", progres);
                        }
                    }
                    sortie.flush();
                }

                final File fichier = cible;
                new Handler(Looper.getMainLooper()).post(() -> lancerInstallation(call, fichier));
            } catch (Throwable e) {
                // On NOMME les deux echecs : celui de DownloadManager et le
                // notre. Sans le premier, on rediagnostiquerait a l'aveugle la
                // prochaine fois.
                String detail = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                call.reject("Le telechargement n'a pas abouti (" + pourquoi + ", puis " + detail + ").");
            } finally {
                if (connexion != null) connexion.disconnect();
            }
        }).start();
    }

    /**
     * Ouvre un lien dans le navigateur du telephone.
     *
     * Le dernier recours, celui qui ne depend ni de DownloadManager ni de
     * nous : il telecharge l'APK depuis son navigateur et l'ouvre a la main.
     * Un <a href download> ordinaire ne suffit pas dans l'app empaquetee —
     * Capacitor l'intercepte et le lien ne sort jamais de la WebView.
     */
    @PluginMethod
    public void ouvrirLienExterne(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL manquante.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Aucun navigateur n'a repondu.");
        }
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
