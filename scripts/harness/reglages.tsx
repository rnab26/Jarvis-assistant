import { Capacitor } from "@capacitor/core"
import { useState } from "react"
import { createRoot } from "react-dom/client"
// La vraie feuille de style de l'app : sans elle, le contrôle de largeur sur
// un écran de téléphone ne voudrait rien dire.
import "@/index.css"
import { Notifications } from "@/components/settings/Notifications"
import { Section } from "@/components/settings/Section"
import type { NotificationsApi } from "@/hooks/useNotifications"
import type { MajWebApi } from "@/hooks/useMajWeb"
import type { PublishedBuild, UpdateStatus, Verdict } from "@/hooks/useUpdateCheck"
import { PREFS_NOTIFS_DEFAUT, type PrefsNotifications } from "@/lib/notifications/prefs"
import type { EtatNotifications } from "@/lib/notifications/service"

/**
 * Banc d'essai des réglages — les VRAIES cartes « Quand Jarvis te dérange »
 * et « Mettre à jour l'application », montées hors de Supabase et hors
 * d'Android avec un état factice.
 *
 * Pourquoi une page plutôt que des tests de fonctions : ce qui casse ici ne
 * casse pas dans le calcul (verifier-notifications.ts et verifier-maj-web.ts
 * le couvrent déjà), ça casse à l'écran. Un interrupteur qui ne bascule pas,
 * un réglage d'heure qui n'apparaît que si on sait où chercher, un « Tout
 * annuler » qui annule sans demander, une carte qui déborde en largeur sur un
 * téléphone : aucun des quatre ne se voit dans une fonction qui renvoie la
 * bonne valeur. Voir scripts/verifier-reglages-web.mjs.
 *
 * `isNative` est forcé à vrai AVANT d'importer la carte de mise à jour : elle
 * le lit une fois au chargement du module, et sans ça le banc ne verrait que
 * la version web de la carte — pas celle que Raphaël a sous les yeux.
 */
Capacitor.isNativePlatform = () => true
const { MettreAJour } = await import("@/components/settings/MettreAJour")

const rien = async () => {}

const ETAT_AUTORISE: EtatNotifications = {
  disponible: true,
  autorise: true,
  actives: true,
  alarmesExactes: true,
}

function notifsFactices(
  etat: EtatNotifications,
  prefsInitiales: PrefsNotifications,
  total: number,
  setPrefsExterne: (p: PrefsNotifications) => void,
  prefs: PrefsNotifications,
): NotificationsApi {
  void prefsInitiales
  return {
    prefs,
    pret: true,
    setPrefs: (partiel) => setPrefsExterne({ ...prefs, ...partiel }),
    etat,
    programmees: {
      total,
      prochaine: total > 0 ? new Date(Date.now() + 3 * 3600_000) : null,
    },
    demander: async () => etat,
    ouvrirAlarmes: async () => etat,
    tester: rien,
    effacerTout: rien,
    rafraichir: rien,
  }
}

function majFactice(possible: boolean): MajWebApi {
  return {
    etat: {
      disponible: true,
      identiteApk: { build: 117, empreinte: "abc123" },
      actif: possible
        ? null
        : { build: 116, version: "2026.09.04-b116", commit: "abc", chemin: "/x", applique: "2026-09-04T10:00:00Z" },
      dernierEchec: null,
    },
    verdict: possible
      ? { possible: true }
      : {
          possible: false,
          raison:
            "Cette mise à jour touche le cœur de l'application (un plugin, une permission, le widget) : elle demande d'installer l'APK.",
        },
    pret: true,
    etape: null,
    progression: null,
    erreur: null,
    auto: true,
    setAuto: () => {},
    appliquer: rien,
    revenir: rien,
    rafraichir: rien,
  }
}

const PUBLIEE: PublishedBuild = {
  commit: "0c2afd6127d21ca925785009c8b2274f2c149a62",
  version: "2026.09.04-b118-0c2afd6",
  buildNumber: 118,
  date: "2026-09-04T16:30:48Z",
  empreinteNative: "abc123",
  bundleUrl: "https://exemple/web-bundle.zip",
}

function updateFactice(status: UpdateStatus) {
  return {
    status,
    published: PUBLIEE,
    verifieA: new Date("2026-09-04T16:40:00Z"),
    recheck: async (): Promise<Verdict> => ({ status, published: PUBLIEE }),
  }
}

function BancDesReglages() {
  const [prefs, setPrefs] = useState<PrefsNotifications>(PREFS_NOTIFS_DEFAUT)

  return (
    <div className="flex flex-col gap-4 p-3">
      <div id="notifs-refuse">
        <Section titre="Notifications (permission refusée)" cle="banc-refuse" ouverteParDefaut>
          <Notifications
            api={notifsFactices(
              { disponible: true, autorise: false, actives: false, alarmesExactes: false },
              PREFS_NOTIFS_DEFAUT,
              0,
              () => {},
              PREFS_NOTIFS_DEFAUT,
            )}
          />
        </Section>
      </div>

      <div id="notifs-ok">
        <Section titre="Notifications" cle="banc-ok" ouverteParDefaut>
          <Notifications
            api={notifsFactices(ETAT_AUTORISE, PREFS_NOTIFS_DEFAUT, 12, setPrefs, prefs)}
          />
        </Section>
      </div>

      <div id="notifs-alarmes">
        <Section titre="Notifications (alarmes inexactes)" cle="banc-alarmes" ouverteParDefaut>
          <Notifications
            api={notifsFactices(
              { ...ETAT_AUTORISE, alarmesExactes: false },
              PREFS_NOTIFS_DEFAUT,
              0,
              () => {},
              PREFS_NOTIFS_DEFAUT,
            )}
          />
        </Section>
      </div>

      <div id="maj-rapide">
        <Section titre="Mise à jour rapide possible" cle="banc-maj-rapide" ouverteParDefaut>
          <MettreAJour update={updateFactice("update-available")} majWeb={majFactice(true)} />
        </Section>
      </div>

      <div id="maj-apk">
        <Section titre="Mise à jour qui demande l'APK" cle="banc-maj-apk" ouverteParDefaut>
          <MettreAJour update={updateFactice("update-available")} majWeb={majFactice(false)} />
        </Section>
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<BancDesReglages />)
