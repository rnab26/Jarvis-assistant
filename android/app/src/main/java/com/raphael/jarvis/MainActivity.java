package com.raphael.jarvis;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * Vrai pendant que cette activité est au premier plan — lu par
     * AnnonceApresNotification (chantier 23ee3735) pour ne jamais dire une
     * notification en double : l'app ouverte parle déjà par son propre
     * chemin (localNotificationReceived, useNotifications.ts).
     */
    static volatile boolean auPremierPlan = false;

    @Override
    public void onResume() {
        super.onResume();
        auPremierPlan = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        auPremierPlan = false;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JarvisWidgetPlugin.class);
        registerPlugin(ShareReceiverPlugin.class);
        registerPlugin(GeofencePlugin.class);
        registerPlugin(ApkDownloaderPlugin.class);
        registerPlugin(ActionsTelephonePlugin.class);
        registerPlugin(ReglagesSystemePlugin.class);
        registerPlugin(AutorisationsPlugin.class);
        registerPlugin(BullePlugin.class);
        registerPlugin(AccessibilitePlugin.class);
        registerPlugin(NotificationsPlugin.class);
        registerPlugin(AnnonceNativePlugin.class);
        registerPlugin(EtatLivePlugin.class);
        super.onCreate(savedInstanceState);
        handleShareIntent(getIntent());
        handleWidgetIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // launchMode="singleTask" : un partage ou un appui sur le widget vers
        // une instance déjà ouverte arrive ici plutôt que dans une nouvelle
        // onCreate().
        handleShareIntent(intent);
        handleWidgetIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (!"text/plain".equals(intent.getType())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text != null && !text.isEmpty()) {
            ShareReceiverPlugin.pendingText = text;
        }
    }

    private void handleWidgetIntent(Intent intent) {
        if (intent == null) return;
        if (intent.getBooleanExtra("demarrer_ecoute", false)) {
            JarvisWidgetPlugin.demarrerEcoute = true;
            JarvisWidgetPlugin.demarreeA = System.currentTimeMillis();
        }
    }
}
