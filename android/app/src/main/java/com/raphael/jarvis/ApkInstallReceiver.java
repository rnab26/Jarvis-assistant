package com.raphael.jarvis;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/**
 * Reçoit le résultat d'une installation lancée par ApkDownloaderPlugin via
 * PackageInstaller en mode SESSION (chantier 0847b38f).
 *
 * STATUS_PENDING_USER_ACTION N'EST PAS UN ÉCHEC, ET IL FAUT LE TRAITER DANS
 * TOUS LES CAS — même avec setRequireUserAction(USER_ACTION_NOT_REQUIRED).
 * Cette option ne supprime la fenêtre de confirmation QUE si l'app est déjà
 * son propre "installer of record" pour ce paquet ; la toute première
 * installation par cette voie (juste après que Raphaël a installé l'APK qui
 * porte ce code) ne l'est pas encore, et Android redemande une fois. Sans ce
 * relais, cette confirmation ne s'afficherait tout simplement jamais et
 * l'installation resterait bloquée en silence.
 */
public class ApkInstallReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmIntent = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmIntent != null) {
                confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirmIntent);
            }
            return;
        }
        // STATUS_SUCCESS relance normalement le processus (mise à jour de
        // soi-même) : l'app redémarre, il n'y a personne à qui le dire ici.
        // Un échec silencieux vaut mieux qu'un plantage du receiver : la
        // prochaine tentative retombera sur l'intent classique si celui-ci
        // échoue systématiquement (voir ApkDownloaderPlugin.lancerInstallation).
    }
}
