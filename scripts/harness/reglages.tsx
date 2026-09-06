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
import { Memoire } from "@/components/settings/Memoire"
import { Consommation } from "@/components/settings/Consommation"
import { SessionsAutonomes } from "@/components/settings/SessionsAutonomes"
import type { LigneConsommation } from "@/lib/consommationModele"
import type { PasseAutonome } from "@/lib/passeAutonome"
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

/** Quatre conversations, d'âges connus : une d'hier, une de la semaine, une du
 * mois dernier, une d'il y a six mois. De quoi vérifier que la fenêtre annonce
 * le bon NOMBRE avant d'effacer, et pas seulement qu'elle demande. */
const DATES_ECHANGES = [1, 10, 40, 200].map((j) =>
  new Date(Date.now() - j * 24 * 3600_000).toISOString(),
)

/** Le pont vers Android, en factice : le banc tourne dans un vrai navigateur,
 * où le plugin n'existe pas. Les quatre états qui comptent (APK trop ancienne,
 * APK qui déclare l'activité mais PAS le service — le cas réel du 6 sept.,
 * celui qui laissait croire que tout allait bien —, candidat mais pas choisi,
 * choisi) se parcourent ainsi à 390 points de large, comme Raphaël les
 * verra. */
function pontFactice(
  assistant: {
    candidat: boolean
    service?: boolean
    role: "actif" | "inactif" | "inconnu"
  } | null,
): PontAssistant {
  return {
    natif: true,
    lire: async () => {
      if (assistant === null) throw new Error("plugin absent de cette APK")
      return assistant
    },
    ouvrir: async () => ({ ecran: "assistant" }),
  }
}

/** Sa situation réelle, en petit : quelques tâches datées, beaucoup sans
 * date, quelques retards. Mesuré chez lui le 6 sept. : 4 sonneront, 22 sans
 * date, 4 en retard — et rien ne le disait. */
const TACHES_BILAN = [
  { id: "b1", due_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10), due_time: "09:00" },
  { id: "b2", due_date: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10), due_time: null },
  { id: "b3", due_date: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10), due_time: null },
  { id: "b4", due_date: null, due_time: null },
  { id: "b5", due_date: null, due_time: null },
  { id: "b6", due_date: null, due_time: null },
].map((t) => ({
  ...t,
  user_id: "banc",
  category_id: null,
  title: `Tâche ${t.id}`,
  notes: null,
  status: "todo" as const,
  created_at: "2026-09-04T10:00:00Z",
  updated_at: "2026-09-04T10:00:00Z",
}))

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

/** Une journée ordinaire de passes : une qui a livré, deux qui se sont
 * retirées. Les dates sont posées par rapport à MAINTENANT, sinon le banc
 * afficherait « plus rien ne passe » dès le lendemain de son écriture. */
const ilYA = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()

const PASSES_BANC: PasseAutonome[] = [
  {
    id: "p1",
    branche: "claude/auto-0906",
    verdict: "occupe",
    raison: "Une session travaille déjà (claude/voix-0509) sur « Le micro n'entend rien ».",
    item_id: null,
    resume: null,
    commit_hash: null,
    demarre_at: ilYA(20),
    fini_at: ilYA(20),
  },
  {
    id: "p2",
    branche: "claude/auto-0906",
    verdict: "travaille",
    raison: "Chantier pris : « Ranger les chantiers par section ».",
    item_id: "00000000-0000-0000-0000-000000000001",
    resume: "Sections repliables livrées, CI verte, commit 5a83a15.",
    commit_hash: "5a83a15",
    demarre_at: ilYA(90),
    fini_at: ilYA(45),
  },
  {
    id: "p3",
    branche: "claude/auto-0906",
    verdict: "rien_a_prendre",
    raison: "Aucun chantier marqué [LIBRE] n'est disponible.",
    item_id: null,
    resume: null,
    commit_hash: null,
    demarre_at: ilYA(150),
    fini_at: ilYA(150),
  },
]

/** Le déclencheur ne tourne plus : la dernière passe est vieille de deux jours. */
const PASSES_MUETTES: PasseAutonome[] = [
  { ...PASSES_BANC[2], id: "p9", demarre_at: ilYA(60 * 48), fini_at: ilYA(60 * 48) },
]

/**
 * Une journée ORDINAIRE de consommation : le modèle principal répond, il a
 * enchaîné vite à un moment (des refus « par minute »), et la mémoire a
 * travaillé de son côté.
 *
 * Ce que le banc vérifie sur cet état est un SILENCE : ces refus-là ne doivent
 * lever aucune alerte. C'est le fonctionnement normal quand il enchaîne les
 * phrases, ça se lève en soixante secondes, et un bandeau qui s'allume tous
 * les jours n'est plus lu — c'est la panne qu'on ne verra pas.
 */
const CONSO_ORDINAIRE: LigneConsommation[] = [
  {
    role: "commande",
    modele: "gemini-3.1-flash-lite",
    fournisseur: "gemini",
    appels: 44,
    reussis: 40,
    refus_minute: 4,
    refus_jour: 0,
    jetons_entree: 486_000,
    jetons_sortie: 12_400,
    jetons_reflexion: 0,
    ms_median: 1420,
    dernier_at: new Date().toISOString(),
    rang: 0,
  },
  {
    role: "memoire",
    modele: "gemini-3.5-flash-lite",
    fournisseur: "gemini",
    appels: 40,
    reussis: 40,
    refus_minute: 0,
    refus_jour: 0,
    jetons_entree: 61_000,
    jetons_sortie: 3_100,
    jetons_reflexion: 0,
    ms_median: 900,
    dernier_at: new Date().toISOString(),
    rang: 0,
  },
]

/**
 * Ses phrases passent par un SECOURS : le principal ne répond pas.
 *
 * Le rang vient du serveur (`rang: 1`) et c'est lui seul qui le dit. Le
 * principal se règle par le secret `GEMINI_MODELE`, que l'app ne peut pas
 * lire : comparer des noms de modèles ici donnerait une page fausse en
 * silence le jour du changement — c'est-à-dire le jour où il faut savoir.
 */
const CONSO_SECOURS: LigneConsommation[] = [
  {
    ...CONSO_ORDINAIRE[0],
    modele: "gemini-3.1-flash-lite-preview",
    reussis: 12,
    appels: 19,
    refus_minute: 0,
    rang: 1,
  },
]

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
            taches={TACHES_BILAN}
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

      {/* LE CAS RÉEL DU 6 SEPT. : l'activité ACTION_ASSIST est là (candidat),
          mais pas le VoiceInteractionService — et la liste de Samsung ne
          regarde que celui-là. Sans ce cas, la carte disait « Jarvis peut être
          choisi » devant une liste où il n'était pas. */}
      <div id="assistant-sans-service">
        <Section titre="Assistant (sans le service)" cle="banc-assist-sans-service" ouverteParDefaut>
          <AssistantTelephone
            pont={pontFactice({ candidat: true, service: false, role: "inactif" })}
          />
        </Section>
      </div>

      <div id="assistant-candidat">
        <Section titre="Assistant (choisissable)" cle="banc-assist-candidat" ouverteParDefaut>
          <AssistantTelephone pont={pontFactice({ candidat: true, service: true, role: "inactif" })} />
        </Section>
      </div>

      <div id="assistant-actif">
        <Section titre="Assistant (actif)" cle="banc-assist-actif" ouverteParDefaut>
          <AssistantTelephone pont={pontFactice({ candidat: true, service: true, role: "actif" })} />
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

      {/* La carte « Mémoire » dans ses trois états qui comptent : des
          conversations à perdre, aucune, et une lecture en échec. Le dernier
          est le piège — une panne qui se lirait comme « 0 seront effacées »
          juste avant une purge qui en efface des centaines. */}
      <div id="memoire">
        <Memoire api={{ dates: DATES_ECHANGES, erreur: null }} />
      </div>
      <div id="memoire-vide">
        <Memoire api={{ dates: [], erreur: null }} />
      </div>
      <div id="memoire-panne">
        <Memoire api={{ dates: null, erreur: "Le serveur ne répond pas." }} />
      </div>

      {/* Les sessions autonomes, dans les trois états qui comptent. Le
          dernier est celui qui trompe : rien depuis des heures alors que
          c'est allumé ne veut pas dire « il n'y avait rien à faire », ça veut
          dire que le déclencheur ne tourne plus — et les deux se ressemblent
          parfaitement si la carte ne le dit pas. */}
      <div id="autonomes">
        <SessionsAutonomes api={{ passes: PASSES_BANC, loading: false, error: null }} />
      </div>
      <div id="autonomes-vide">
        <SessionsAutonomes api={{ passes: [], loading: false, error: null }} />
      </div>
      <div id="autonomes-silence">
        <SessionsAutonomes api={{ passes: PASSES_MUETTES, loading: false, error: null }} />
      </div>
      <div id="autonomes-panne">
        <SessionsAutonomes api={{ passes: [], loading: false, error: "Le serveur ne répond pas." }} />
      </div>

      {/* Ce que Jarvis a consommé, dans les quatre états qui comptent. Deux
          d'entre eux se vérifient par un SILENCE : une journée ordinaire ne
          doit afficher NI solde NI pourcentage (l'offre est gratuite, les
          plafonds ne se lisent que dans le corps d'un 429), et des refus
          « par minute » ne doivent lever aucune alerte. Le dernier est celui
          qui trompe : une lecture en échec ne doit pas se lire comme « rien
          consommé » — ce serait le rassurer juste avant un quota vide. */}
      <div id="conso">
        <Consommation
          api={{ lignes: CONSO_ORDINAIRE, erreur: null, enCours: false, rafraichir: async () => {} }}
        />
      </div>
      <div id="conso-secours">
        <Consommation
          api={{ lignes: CONSO_SECOURS, erreur: null, enCours: false, rafraichir: async () => {} }}
        />
      </div>
      <div id="conso-vide">
        <Consommation api={{ lignes: [], erreur: null, enCours: false, rafraichir: async () => {} }} />
      </div>
      <div id="conso-panne">
        <Consommation
          api={{
            lignes: null,
            erreur: "Le serveur ne répond pas.",
            enCours: false,
            rafraichir: async () => {},
          }}
        />
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
          ["Autorisations du téléphone", "Ce que Jarvis a le droit de faire"],
          ["Voix et écoute", "Sa voix, le rythme, le mot-clé de réveil"],
          ["Tâches et organisation", "Widget d'écran d'accueil, rappels de lieu"],
          ["Notifications", "Ce que Jarvis a le droit de faire sonner"],
          ["Ce que Jarvis utilise", "Applications par défaut, appui long sur le bouton"],
          ["Ce que Jarvis consomme", "Phrases et jetons du jour, et la marge qu'il reste"],
          ["Mémoire", "Combien de temps il garde tes conversations"],
          ["Le cockpit", "Ce qui compte comme « livré », et les sessions qui travaillent sans toi"],
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
