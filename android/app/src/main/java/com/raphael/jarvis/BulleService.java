package com.raphael.jarvis;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.PorterDuff;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;

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

    /** La seule instance vivante, pour que setEnEcoute() puisse retoucher
     * l'icône depuis BulleEcouteActivity (même processus, même genre de
     * champ statique que BulleEcouteActivity.instance). */
    private static volatile BulleService instance;

    private WindowManager fenetres;
    private ImageView bulle;
    private WindowManager.LayoutParams params;
    private final Handler principal = new Handler(Looper.getMainLooper());

    /**
     * LA CROIX DU BAS — glisser la bulle dessus la range (chantier 9c22a183,
     * sa demande : « permettre de supprimer la bulle en la faisant glisser
     * vers le bas de l'écran au lieu de passer par les paramètres »). Le geste
     * de Messenger et de toutes les bulles Android : la cible n'apparaît QUE
     * pendant un glissement, et ne prend aucun toucher (FLAG_NOT_TOUCHABLE) —
     * posée par-dessus l'écran, elle volerait sinon les appuis de
     * l'application en dessous.
     */
    private TextView cible;
    private WindowManager.LayoutParams paramsCible;
    private boolean cibleAffichee = false;
    private boolean surCible = false;
    private static final int TAILLE_CIBLE_DP = 64;
    private static final int MARGE_CIBLE_DP = 56;
    /** Le doigt n'a pas à être pile au centre : un rayon généreux, comme les
     * bulles de Messenger qui « aimantent » vers la croix. */
    private static final int RAYON_AIMANT_DP = 72;

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

        // ON RÉPARE UNE POSITION DÉJÀ ENREGISTRÉE HORS ÉCRAN, et c'est le
        // point essentiel de ce correctif. Le 7 sept. 2026, Raphaël : « ma
        // bulle jarvis est bloqué complètement en haut a droite j'arrive plus
        // a la récupérer ». Une position hors écran était SAUVEGARDÉE (voir
        // ACTION_UP), donc elle survivait à l'arrêt du service, au
        // redémarrage du téléphone et à la réinstallation de l'interface :
        // borner seulement le glissement ne l'aurait jamais sorti de là.
        bornerDansEcran(taille);
        prefs.edit().putInt(POS_X, params.x).putInt(POS_Y, params.y).apply();

        try {
            fenetres.addView(bulle, params);
            active = true;
            instance = this;
        } catch (Exception e) {
            stopSelf();
        }
    }

    /** L'autorisation « afficher par-dessus les autres applications ». */
    static boolean peutAfficher(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(ctx);
    }

    /**
     * Ramener la bulle dans l'écran.
     *
     * POURQUOI ELLE POUVAIT EN SORTIR : FLAG_LAYOUT_NO_LIMITS autorise la vue
     * à déborder des limites de l'écran (il sert à passer sous les barres
     * système), et le glissement ci-dessous ajoutait le déplacement du doigt à
     * la position SANS AUCUNE BORNE. Un geste un peu large la poussait donc
     * dehors, et comme la position est enregistrée, elle y restait.
     *
     * MARGE_VISIBLE plutôt que « entièrement dans l'écran » : on garde
     * volontairement la possibilité de la coller au bord — c'est ce qu'on fait
     * naturellement pour la ranger — mais jamais au point qu'il ne reste plus
     * assez de bulle pour la rattraper au doigt.
     */
    private void bornerDansEcran(int taille) {
        DisplayMetrics ecran = getResources().getDisplayMetrics();
        int margeVisible = Math.max(dp(24), taille / 2);
        int xMin = margeVisible - taille;
        int xMax = ecran.widthPixels - margeVisible;
        int yMin = 0;
        int yMax = ecran.heightPixels - margeVisible;

        if (params.x < xMin) params.x = xMin;
        if (params.x > xMax) params.x = xMax;
        if (params.y < yMin) params.y = yMin;
        if (params.y > yMax) params.y = yMax;
    }

    /**
     * Remettre la bulle à sa place d'origine — le filet quand elle a été
     * perdue. Appelée par le bouton de Paramètres via BullePlugin.
     */
    static void oublierPosition(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove(POS_X).remove(POS_Y).apply();
    }

    private int dp(int valeur) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, valeur, getResources().getDisplayMetrics()));
    }

    /**
     * Le cœur de Jarvis, en petit.
     *
     * Un appui l'ouvre, un glissement la déplace, un appui long la range —
     * et la glisser sur la croix qui apparaît en bas la range aussi.
     * La distinction entre les deux se fait sur la DISTANCE parcourue, pas
     * sur une durée : sur un téléphone, un appui bouge toujours de quelques
     * pixels, et un seuil de zéro rendrait la bulle impossible à ouvrir.
     */
    private ImageView construireBulle() {
        ImageView vue = new ImageView(this);
        vue.setImageResource(R.mipmap.ic_launcher_round);
        vue.setPadding(dp(2), dp(2), dp(2), dp(2));

        final int seuil = dp(8);
        vue.setOnTouchListener(new View.OnTouchListener() {
            private int departX, departY;
            private float doigtX, doigtY;
            private boolean deplacee;
            private boolean appuiLongFait;

            /**
             * L'APPUI LONG, détecté ICI et plus par setOnLongClickListener.
             * Trouvé le 23 sept. 2026 : ce listener renvoie `true` dès
             * ACTION_DOWN, donc Android n'appelait jamais onTouchEvent — là où
             * il détecte l'appui long. « Appui long pour la ranger », promis
             * par la notification et par Paramètres, n'a jamais pu marcher.
             */
            private final Runnable appuiLong = () -> {
                appuiLongFait = true;
                vue.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                ranger();
            };

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        departX = params.x;
                        departY = params.y;
                        doigtX = event.getRawX();
                        doigtY = event.getRawY();
                        deplacee = false;
                        appuiLongFait = false;
                        principal.postDelayed(appuiLong, ViewConfiguration.getLongPressTimeout());
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        if (appuiLongFait) return true;
                        int dx = Math.round(event.getRawX() - doigtX);
                        int dy = Math.round(event.getRawY() - doigtY);
                        if (!deplacee && (Math.abs(dx) > seuil || Math.abs(dy) > seuil)) {
                            deplacee = true;
                            // Un glissement n'est pas un appui long.
                            principal.removeCallbacks(appuiLong);
                            montrerCible();
                        }
                        params.x = departX + dx;
                        params.y = departY + dy;
                        // Borné À CHAQUE mouvement, pas seulement au relâcher :
                        // sinon on la voit partir hors de l'écran pendant le
                        // geste, et c'est ce départ-là qui donne l'impression
                        // qu'on l'a perdue.
                        bornerDansEcran(v.getWidth() > 0 ? v.getWidth() : dp(52));
                        if (deplacee) marquerCible(doigtSurCible(event.getRawX(), event.getRawY()));
                        try {
                            fenetres.updateViewLayout(bulle, params);
                        } catch (Exception ignore) {
                            // Vue déjà retirée : rien à replacer.
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        principal.removeCallbacks(appuiLong);
                        if (appuiLongFait) return true;
                        if (deplacee) {
                            boolean aRanger = cibleAffichee && doigtSurCible(event.getRawX(), event.getRawY());
                            cacherCible();
                            if (aRanger) {
                                // Rangée : on NE garde PAS cette position —
                                // sinon elle réapparaîtrait sur la croix, en
                                // bas de l'écran, la prochaine fois.
                                v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                                ranger();
                                return true;
                            }
                            // La position est gardée : la retrouver ailleurs à
                            // chaque redémarrage rendrait le réglage inutile.
                            getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                                .edit().putInt(POS_X, params.x).putInt(POS_Y, params.y).apply();
                        } else {
                            ouvrirJarvis();
                        }
                        return true;
                    case MotionEvent.ACTION_CANCEL:
                        principal.removeCallbacks(appuiLong);
                        cacherCible();
                        return true;
                    default:
                        return false;
                }
            }
        });
        return vue;
    }

    /**
     * Ranger la bulle sans passer par Paramètres. Si elle écoutait, l'écoute
     * s'arrête AVEC elle : sa teinte rouge était la seule chose qui disait que
     * le micro était ouvert — la ranger en le laissant ouvert laisserait un
     * micro allumé que rien ne montre.
     */
    private void ranger() {
        cacherCible();
        BulleEcouteActivity.arreterSiActive();
        stopSelf();
    }

    private void montrerCible() {
        if (cibleAffichee || fenetres == null) return;
        if (cible == null) {
            cible = new TextView(this);
            cible.setText("\u2715");
            cible.setTextColor(Color.WHITE);
            cible.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
            cible.setGravity(Gravity.CENTER);
            cible.setContentDescription("Ranger la bulle");
            GradientDrawable fond = new GradientDrawable();
            fond.setShape(GradientDrawable.OVAL);
            fond.setColor(Color.argb(170, 30, 30, 30));
            cible.setBackground(fond);

            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
            int taille = dp(TAILLE_CIBLE_DP);
            paramsCible = new WindowManager.LayoutParams(
                taille,
                taille,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
            paramsCible.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            paramsCible.y = dp(MARGE_CIBLE_DP);
        }
        surCible = false;
        cible.setScaleX(1f);
        cible.setScaleY(1f);
        try {
            fenetres.addView(cible, paramsCible);
            cibleAffichee = true;
        } catch (Exception ignore) {
            // Sans la croix, le glissement reste un simple déplacement.
        }
    }

    private void cacherCible() {
        if (!cibleAffichee || fenetres == null || cible == null) return;
        try {
            fenetres.removeView(cible);
        } catch (Exception ignore) {
            // Déjà retirée.
        }
        cibleAffichee = false;
        surCible = false;
    }

    /** La croix grossit et rougit quand le doigt est dessus : il sait, AVANT
     * de lâcher, que la bulle va être rangée. */
    private void marquerCible(boolean dessus) {
        if (!cibleAffichee || cible == null || dessus == surCible) return;
        surCible = dessus;
        cible.setScaleX(dessus ? 1.25f : 1f);
        cible.setScaleY(dessus ? 1.25f : 1f);
        GradientDrawable fond = new GradientDrawable();
        fond.setShape(GradientDrawable.OVAL);
        fond.setColor(dessus ? Color.argb(220, 220, 50, 50) : Color.argb(170, 30, 30, 30));
        cible.setBackground(fond);
        if (dessus) cible.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
    }

    /**
     * Le DOIGT est-il sur la croix ? On compare le doigt (coordonnées
     * d'écran brutes) au centre RÉEL de la croix tel qu'Android l'a posée —
     * pas à une position recalculée, qui se tromperait de la hauteur de la
     * barre de navigation selon les téléphones.
     */
    private boolean doigtSurCible(float xDoigt, float yDoigt) {
        if (cible == null) return false;
        int centreX;
        int centreY;
        if (cible.getWidth() > 0) {
            int[] ou = new int[2];
            cible.getLocationOnScreen(ou);
            centreX = ou[0] + cible.getWidth() / 2;
            centreY = ou[1] + cible.getHeight() / 2;
        } else {
            DisplayMetrics ecran = getResources().getDisplayMetrics();
            centreX = ecran.widthPixels / 2;
            centreY = ecran.heightPixels - dp(MARGE_CIBLE_DP) - dp(TAILLE_CIBLE_DP) / 2;
        }
        float dx = xDoigt - centreX;
        float dy = yDoigt - centreY;
        float rayon = dp(RAYON_AIMANT_DP);
        return dx * dx + dy * dy <= rayon * rayon;
    }

    /**
     * SA DÉCISION, 15 sept. 2026, mot pour mot : « Moi l'utilisateur j'appuie
     * pour activer jarvis ». Un appui ACTIVE ou DÉSACTIVE le micro de Jarvis,
     * SANS FENÊTRE qui s'ouvre — c'est la bulle elle-même (son icône) qui
     * montre qu'elle écoute. Ce n'est PLUS la fenêtre d'assistance de
     * l'appui long (AssistOverlayActivity) : les deux chemins restent
     * distincts, chacun avec sa propre décision.
     *
     * Bascule, pas un simple démarrage : si la fenêtre invisible d'écoute
     * est déjà ouverte (appui précédent), cet appui-ci l'ARRÊTE plutôt que
     * d'en ouvrir une seconde.
     */
    private void ouvrirJarvis() {
        if (BulleEcouteActivity.estActive()) {
            BulleEcouteActivity.arreterSiActive();
            return;
        }
        try {
            Intent ecoute = new Intent(this, BulleEcouteActivity.class);
            ecoute.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(ecoute, BulleEcouteActivity.optionsSansAnimation(this));
            return;
        } catch (Exception ignore) {
            // Fenêtre invisible indisponible : on retombe sur l'app, avec le
            // chemin du widget, lui, éprouvé.
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

    /**
     * Ce que la bulle montre PENDANT qu'elle écoute — sa seule façon de le
     * dire, puisqu'aucune fenêtre ne s'ouvre. Appelée par
     * BulleEcouteActivity (même processus), donc jamais garantie sur le
     * thread principal : postée par précaution, une ImageView ne se retouche
     * que depuis lui.
     */
    static void setEnEcoute(boolean actif) {
        BulleService service = instance;
        if (service == null || service.bulle == null) return;
        service.principal.post(() -> {
            ImageView vue = service.bulle;
            if (vue == null) return;
            if (actif) {
                vue.setColorFilter(Color.argb(140, 255, 80, 80), PorterDuff.Mode.SRC_ATOP);
            } else {
                vue.clearColorFilter();
            }
        });
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
            .setContentText("Appuie dessus pour lui parler. Glisse-la sur la croix en bas pour la ranger.")
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
        if (instance == this) instance = null;
        cacherCible();
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
