package com.raphael.jarvis;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import androidx.annotation.Nullable;
import java.util.Locale;

/**
 * Parler à voix haute quand l'app est fermée (chantier 23ee3735).
 *
 * SA RÉPONSE, 5 sept. 2026 : « Oui, avec un interrupteur pour la couper. »
 * Il accepte la notification permanente en barre d'état, à la condition de
 * pouvoir l'éteindre depuis Paramètres sans réinstaller.
 *
 * POURQUOI UN SERVICE DE PREMIER PLAN, même motif que BulleService : sans
 * lui, Android tue le processus en arrière-plan et la synthèse vocale
 * s'arrête avec lui, en silence. Ce service ne fait rien d'autre que garder
 * un moteur TextToSpeech prêt — c'est JarvisNotificationListenerService qui
 * décide QUOI dire et QUAND (voir sa note), lui se contente d'exister assez
 * longtemps pour parler.
 */
public class AnnonceService extends Service {

    private static final String CANAL = "jarvis_annonce_app_fermee";
    private static final int ID_NOTIF = 4301;

    /** Le service réellement actif — lu par le plugin pour dire l'état RÉEL,
     * jamais déduit du réglage (Android peut l'avoir arrêté tout seul). */
    private static volatile AnnonceService instance;

    private TextToSpeech tts;
    private volatile boolean pret = false;

    static AnnonceService actif() {
        return instance;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        demarrerAuPremierPlan();
        tts = new TextToSpeech(getApplicationContext(), status -> {
            if (status == TextToSpeech.SUCCESS && tts != null) {
                tts.setLanguage(Locale.FRENCH);
                pret = true;
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // START_STICKY : si Android le tue par manque de mémoire (pas un
        // arrêt demandé), il redémarre tout seul — mais sans reposer la
        // notification permanente une seconde fois pour rien, onCreate() ne
        // s'exécute qu'une fois par instance de service.
        return START_STICKY;
    }

    /** Dit la phrase, si le moteur est prêt. Silencieux sinon : une phrase
     * ratée pendant les deux premières secondes du service ne doit pas faire
     * planter l'appelant (JarvisNotificationListenerService). */
    void dire(String texte) {
        if (!pret || tts == null || texte == null || texte.isEmpty()) return;
        tts.speak(texte, TextToSpeech.QUEUE_ADD, null, "jarvis_annonce");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (instance == this) instance = null;
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
    }

    private void demarrerAuPremierPlan() {
        NotificationManager gestionnaire =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && gestionnaire != null) {
            NotificationChannel canal = new NotificationChannel(
                CANAL, "Jarvis parle même app fermée", NotificationManager.IMPORTANCE_MIN);
            canal.setDescription("Reste actif pour que Jarvis puisse dire tes rappels à voix haute.");
            canal.setShowBadge(false);
            gestionnaire.createNotificationChannel(canal);
        }

        Intent ouvrir = new Intent(this, MainActivity.class);
        PendingIntent action = PendingIntent.getActivity(
            this, 0, ouvrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CANAL)
            : new Notification.Builder(this);
        Notification notif = b
            .setContentTitle("Jarvis peut te parler même app fermée")
            .setContentText("Coupe-le dans Paramètres > Notifications si tu n'en as plus besoin.")
            .setSmallIcon(R.drawable.ic_stat_jarvis)
            .setContentIntent(action)
            .setOngoing(true)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(ID_NOTIF, notif,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(ID_NOTIF, notif);
        }
    }
}
