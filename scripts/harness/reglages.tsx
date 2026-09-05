import { Capacitor } from "@capacitor/core"
import { ThemeProvider } from "next-themes"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
// La vraie feuille de style de l'app : sans elle, le contrôle de largeur sur
// un écran de téléphone ne voudrait rien dire.
import "@/index.css"
import { AssistantTelephone, type PontAssistant } from "@/components/settings/AssistantTelephone"
import { Confidentialite } from "@/components/settings/Confidentialite"
import { ModeLive } from "@/components/settings/ModeLive"
import { Notifications } from "@/components/settings/Notifications"
import { Reinitialiser } from "@/components/settings/Reinitialiser"
import { Section } from "@/components/settings/Section"
import { Theme } from "@/components/settings/Theme"
import type { NotificationsApi } from "@/hooks/useNotifications"
import type { MajWebApi } from "@/hooks/useMajWeb"
import type { PublishedBuild, UpdateStatus, Verdict } from "@/hooks/useUpdateCheck"
import { PREFS_NOTIFS_DEFAUT, type PrefsNotifications } from "@/lib/notifications/prefs"
import { REGLAGES_RESTAURES } from "@/lib/reglages"
import { THEME_KEY } from "@/lib/theme"
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

/** Le pont vers Android, en factice : le banc tourne dans un vrai navigateur,
 * où le plugin n'existe pas. Les trois états qui comptent (APK trop ancienne,
 * candidat mais pas choisi, choisi) se parcourent ainsi à 390 points de large,
 * comme Raphaël les verra. */
function pontFactice(assistant: { candidat: boolean; role: "actif" | "inactif" | "inconnu" } | null): PontAssistant {
  return {
    natif: true,
    lire: async () => {
      if (assistant === null) throw new Error("plugin absent de cette APK")
      return assistant
    },
    ouvrir: async () => ({ ecran: "assistant" }),
  }
}

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
  // Ce que le micro écoute pour se relire : sans ce signal, l'interrupteur du
  // mode Live n'aurait d'effet qu'au prochain lancement de l'app.
  const [signaux, setSignaux] = useState(0)
  useEffect(() => {
    const run = () => setSignaux((n) => n + 1)
    window.addEventListener(REGLAGES_RESTAURES, run)
    return () => window.removeEventListener(REGLAGES_RESTAURES, run)
  }, [])

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

      {/* Notifications coupées côté système : le seul recours est l'écran
          d'Android, et il faut pouvoir l'ouvrir d'ici. */}
      <div id="notifs-coupees">
        <Section titre="Notifications (coupées côté système)" cle="banc-coupees" ouverteParDefaut>
          <Notifications
            api={notifsFactices(
              { ...ETAT_AUTORISE, actives: false },
              PREFS_NOTIFS_DEFAUT,
              0,
              () => {},
              PREFS_NOTIFS_DEFAUT,
            )}
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

      {/* L'assistant du téléphone : la carte doit dire POURQUOI Jarvis
          n'apparaît pas dans la liste d'Android — une APK trop ancienne — au
          lieu de laisser chercher. */}
      <div id="assistant-ancien">
        <Section titre="Assistant (APK trop ancienne)" cle="banc-assist-vieux" ouverteParDefaut>
          <AssistantTelephone pont={pontFactice(null)} />
        </Section>
      </div>

      <div id="assistant-candidat">
        <Section titre="Assistant (choisissable)" cle="banc-assist-candidat" ouverteParDefaut>
          <AssistantTelephone pont={pontFactice({ candidat: true, role: "inactif" })} />
        </Section>
      </div>

      <div id="assistant-actif">
        <Section titre="Assistant (actif)" cle="banc-assist-actif" ouverteParDefaut>
          <AssistantTelephone pont={pontFactice({ candidat: true, role: "actif" })} />
        </Section>
      </div>

      <div id="maj-rapide">
        <Section titre="Mise à jour rapide possible" cle="banc-maj-rapide" ouverteParDefaut>
          <MettreAJour update={updateFactice("update-available")} majWeb={majFactice(true)} />
        </Section>
      </div>

      {/* La recherche : une section qui répond s'affiche dépliée, les autres
          disparaissent. Le filtre est figé ici — ce qui se vérifie, c'est le
          comportement de la section, pas le champ de saisie. */}
      <div id="recherche">
        <Section
          titre="Voix et écoute"
          resume="Sa voix, le rythme"
          cle="banc-r1"
          motsCles="voix débit"
          filtre="notification"
        >
          <p>Contenu voix</p>
        </Section>
        <Section
          titre="Notifications"
          resume="Ce que Jarvis a le droit de faire sonner"
          cle="banc-r2"
          motsCles="notification sonner rappel"
          filtre="notification"
        >
          <p>Contenu notifications</p>
        </Section>
      </div>

      {/* Le mode Live : ce qui compte est que le micro, qui garde son propre
          état, soit prévenu. Le compteur affiche le signal reçu. */}
      <div id="live">
        <ModeLive />
        <p>signaux : {signaux}</p>
      </div>

      <div id="theme">
        <Theme />
      </div>

      <div id="reinit">
        <Reinitialiser />
      </div>

      <div id="confidentialite">
        <Confidentialite />
      </div>

      {/* L'ORDRE RÉEL des sections de Paramètres, replié comme il l'est à
          l'ouverture, avec la vraie carte de mise à jour dedans. C'est le seul
          moyen de MESURER ce que Raphaël décrit — « pour la mise à jour, il
          faut que je descende tout en bas » — au lieu de le supposer. Les
          titres et l'ordre sont recopiés de SettingsPage : s'ils y changent,
          ce banc mesure autre chose, et c'est écrit ici pour qu'on le sache. */}
      <div id="ordre-reel" className="flex flex-col gap-2">
        <Section
          titre="L'application"
          resume="Version, mise à jour, nouveautés"
          cle="banc-ordre-app"
          ouverteParDefaut
          badge={<span className="shrink-0 text-xs text-muted-foreground">À jour</span>}
        >
          <MettreAJour update={updateFactice("up-to-date")} majWeb={majFactice(true)} />
        </Section>
        {[
          ["Voix et écoute", "Sa voix, le rythme, le mot-clé de réveil"],
          ["Tâches et organisation", "Widget d'écran d'accueil, rappels de lieu"],
          ["Notifications", "Ce que Jarvis a le droit de faire sonner"],
          ["Ce que Jarvis utilise", "Applications par défaut, canal des messages"],
          ["Apparence", "Thème clair ou sombre, image du cœur"],
          ["Comptes et connexions", "Google"],
        ].map(([titre, resume], i) => (
          <Section key={titre} titre={titre} resume={resume} cle={`banc-ordre-${i}`}>
            <p>Contenu</p>
          </Section>
        ))}
      </div>

      <div id="maj-apk">
        <Section titre="Mise à jour qui demande l'APK" cle="banc-maj-apk" ouverteParDefaut>
          <MettreAJour update={updateFactice("update-available")} majWeb={majFactice(false)} />
        </Section>
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" storageKey={THEME_KEY} enableSystem>
    <BancDesReglages />
  </ThemeProvider>,
)
