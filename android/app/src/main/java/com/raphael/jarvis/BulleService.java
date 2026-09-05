package com.raphael.jarvis;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

/**
 * La bulle Jarvis, posée par-dessus les autres applications.
 *
 * DEMANDE DE RAPHAËL, 3 puis 5 sept. 2026 : « un Jarvis omniprésent dans le
 * téléphone, flottant sur l'écran principal », puis, quand je lui ai proposé
 * de CHOISIR entre l'appui long et la bulle : « oui et aussi l'option bulle
 * flottante, les deux doivent être disponibles tant que ce n'est pas
 * fonctionnel à 100 %, et simplement par possibilité de changer à tout
 * moment. » Les deux existent donc en même temps : si l'un ne marche pas un
 * jour, l'autre est déjà là, sans attendre un correctif ni une
 * réinstallation.
 *
 * POURQUOI UN SERVICE DE PREMIER PLAN. Une vue posée par WindowManager vit
 * dans le processus de l'app ; sans service de premier plan, Android tue ce
 * processus dès qu'il passe en arrière-plan, et la bulle disparaît au bout de
 * quelques minutes — silencieusement, ce qui est le pire des cas. La
 * notification qui l'accompagne est sur un canal muet et de basse importance :
 * elle est le prix à payer, pas une information.
 *
 * CE QU'ELLE NE FAIT PAS : elle ne lit rien de l'écran, elle n'écoute rien
 * tant qu'on ne l'a pas touchée. C'est un bouton qui flotte, pas une
 * surveillance.
 */
public class BulleService extends Service {

    private static final String CANAL = "jarvis_bulle";
    private static final int ID_NOTIF = 4201;
    private static final String PREFS = "jarvis_bulle";
    private static final String POS_X = "x";
    private static final String POS_Y = "y";

    /** Vrai tant que la bulle est à l'écran. Lu par BullePlugin pour dire
     * l'état réel plutôt que ce que le réglage prétend. */
    static boolean active = false;

    private WindowManager fenetres;
    private View bulle;
    private WindowManager.LayoutParams params;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        demarrerAuPremierPlan();

        // Sans l'autorisation, ajouter la vue lève une exception qui tue le
        // service : on s'arrête proprement, l'écran de réglages dira quoi faire.
        if (!peutAfficher(this)) {
            stopSelf();
            return;
        }

        fenetres = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        bulle = construireBulle();

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        int taille = dp(52);
        params = new WindowManager.LayoutParams(
            taille,
            taille,
            type,
            // NOT_FOCUSABLE : la bulle ne doit jamais voler le clavier de
            // l'application en dessous. Sans ce drapeau, taper un message
            // dans WhatsApp devient impossible tant qu'elle est affichée.
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;

        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        params.x = prefs.getInt(POS_X, dp(12));
        params.y = prefs.getInt(POS_Y, dp(240));

        try {
            fenetres.addView(bulle, params);
            active = true;
        } catch (Exception e) {
            stopSelf();
        }
    }

    /** L'autorisation « afficher par-dessus les autres applications ». */
    static boolean peutAfficher(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(ctx);
    }

    private int dp(int valeur) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, valeur, getResources().getDisplayMetrics()));
    }

    /**
     * Le cœur de Jarvis, en petit.
     *
     * Un appui l'ouvre, un glissement la déplace, un appui long la range.
     * La distinction entre les deux se fait sur la DISTANCE parcourue, pas
     * sur une durée : sur un téléphone, un appui bouge toujours de quelques
     * pixels, et un seuil de zéro rendrait la bulle impossible à ouvrir.
     */
    private View construireBulle() {
        ImageView vue = new ImageView(this);
        vue.setImageResource(R.mipmap.ic_launcher_round);
        vue.setPadding(dp(2), dp(2), dp(2), dp(2));

        final int seuil = dp(8);
        vue.setOnTouchListener(new View.OnTouchListener() {
            private int departX, departY;
            private float doigtX, doigtY;
            private boolean deplacee;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        departX = params.x;
                        departY = params.y;
                        doigtX = event.getRawX();
                        doigtY = event.getRawY();
                        deplacee = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = Math.round(event.getRawX() - doigtX);
                        int dy = Math.round(event.getRawY() - doigtY);
                        if (Math.abs(dx) > seuil || Math.abs(dy) > seuil) deplacee = true;
                        params.x = departX + dx;
                        params.y = departY + dy;
                        try {
                            fenetres.updateViewLayout(bulle, params);
                        } catch (Exception ignore) {
                            // Vue déjà retirée : rien à replacer.
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (deplacee) {
                            // La position est gardée : la retrouver ailleurs à
                            // chaque redémarrage rendrait le réglage inutile.
                            getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                                .edit().putInt(POS_X, params.x).putInt(POS_Y, params.y).apply();
                        } else {
                            ouvrirJarvis();
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });

        vue.setOnLongClickListener(v -> {
            // Ranger la bulle sans aller dans Paramètres. Le réglage, lui,
            // reste allumé : c'est un masquage jusqu'au prochain démarrage,
            // pas un choix qu'on lui ferait prendre par mégarde.
            stopSelf();
            return true;
        });
        return vue;
    }

    /**
     * Ce que l'appui ouvre : la fenêtre d'assistance en bas d'écran, celle de
     * l'appui long. Si elle n'est pas disponible sur cet appareil, on retombe
     * sur l'application elle-même en lançant l'écoute — le chemin du widget,
     * lui, est éprouvé.
     */
    private void ouvrirJarvis() {
        try {
            Intent overlay = new Intent(this, AssistOverlayActivity.class);
            overlay.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(overlay);
            return;
        } catch (Exception ignore) {
            // Fenêtre indisponible : on ouvre l'app.
        }
        Intent app = new Intent(this, MainActivity.class);
        app.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        app.putExtra("demarrer_ecoute", true);
        try {
            startActivity(app);
        } catch (Exception ignore) {
            // Rien à faire de plus : la bulle reste, il peut réessayer.
        }
    }

    private void demarrerAuPremierPlan() {
        NotificationManager gestionnaire =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && gestionnaire != null) {
            NotificationChannel canal = new NotificationChannel(
                CANAL, "Bulle Jarvis", NotificationManager.IMPORTANCE_MIN);
            canal.setDescription("La pastille Jarvis affichée par-dessus les autres applications.");
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
            .setContentTitle("Bulle Jarvis affichée")
            .setContentText("Appuie dessus pour lui parler. Appui long pour la ranger.")
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

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // START_STICKY : Android relance le service après avoir récupéré de la
        // mémoire, et la bulle revient toute seule.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        active = false;
        if (bulle != null && fenetres != null) {
            try {
                fenetres.removeView(bulle);
            } catch (Exception ignore) {
                // Déjà retirée.
            }
            bulle = null;
        }
        super.onDestroy();
    }
}
