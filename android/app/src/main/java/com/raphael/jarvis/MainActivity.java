package com.raphael.jarvis;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JarvisWidgetPlugin.class);
        registerPlugin(ShareReceiverPlugin.class);
        super.onCreate(savedInstanceState);
        handleShareIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // launchMode="singleTask" : un partage vers une instance déjà ouverte
        // arrive ici plutôt que dans une nouvelle onCreate().
        handleShareIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (!"text/plain".equals(intent.getType())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text != null && !text.isEmpty()) {
            ShareReceiverPlugin.pendingText = text;
        }
    }
}
