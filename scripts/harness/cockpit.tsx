import { useState } from "react"
import { createRoot } from "react-dom/client"
// La vraie feuille de style de l'app : sans elle, le contrôle de largeur sur
// un écran de téléphone ne voudrait rien dire.
import "@/index.css"
import { Toaster } from "@/components/ui/sonner"
import { CockpitBoard } from "@/components/cockpit/CockpitBoard"
import { DepuisTonDernierPassage } from "@/components/cockpit/DepuisTonDernierPassage"
import { EnvoyerAClaudeCode } from "@/components/cockpit/EnvoyerAClaudeCode"
import { DevLogFeed } from "@/components/cockpit/DevLogFeed"
import { DoublonsTrouves } from "@/components/cockpit/DoublonsTrouves"
import { ErreursJarvis } from "@/components/cockpit/ErreursJarvis"
import { CeQuiAttendTaDecision } from "@/components/cockpit/CeQuiAttendTaDecision"
import { OuJenSuis } from "@/components/cockpit/OuJenSuis"
import { FILTRE_VIDE, type FiltreCockpit } from "@/lib/sections"
import type {
  DevItem,
  DevLogEntry,
  DevSection,
  ErreurCategorie,
  JarvisErreur,
} from "@/types/database"

/**
 * Banc d'essai du cockpit — le vrai tableau, le vrai registre des erreurs,
 * montés hors de Supabase avec des données factices.
 *
 * Pourquoi une page plutôt que des tests de fonctions : ce qui casse ici ne
 * casse pas dans le calcul (`scripts/verifier-sections.ts` le couvre déjà),
 * ça casse à l'écran. Une section qui ne se déplie pas, une corbeille qui
 * supprime sans demander, un tableau qui déborde en largeur sur un téléphone :
 * aucun de ces trois-là ne se voit dans une fonction qui renvoie la bonne
 * valeur. Voir scripts/verifier-cockpit-web.mjs.
 */
const rien = async () => {}

let n = 0
function chantier(titre: string, theme: string | null, statut: DevItem["status"] = "todo"): DevItem {
  n++
  return {
    id: `c${n}`,
    user_id: "banc",
    title: titre,
    notes: `Note du chantier ${n}`,
    status: statut,
    priority: "normal",
    theme,
    archived_at: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: `2026-09-0${(n % 9) + 1}T10:00:00Z`,
    updated_at: "2026-09-04T10:00:00Z",
  }
}

function section(nom: string, position: number): DevSection {
  return {
    id: `s${position}`,
    user_id: "banc",
    nom,
    description: null,
    position,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  }
}

function erreur(titre: string, categorie: ErreurCategorie, occurrences = 1): JarvisErreur {
  n++
  return {
    id: `e${n}`,
    user_id: "banc",
    categorie,
    titre,
    detail: "Détail technique",
    contexte: "Ce que je faisais",
    source: "app",
    statut: "nouveau",
    correction: null,
    dev_item_id: null,
    empreinte: `${categorie}:${titre}`,
    occurrences,
    first_seen: "2026-09-04T09:00:00Z",
    last_seen: "2026-09-04T10:00:00Z",
    reapparue_at: null,
    created_at: "2026-09-04T09:00:00Z",
    updated_at: "2026-09-04T10:00:00Z",
  }
}

const SECTIONS = [
  section("Voix et écoute", 1),
  section("Le téléphone", 2),
  // Créée d'avance, encore vide : elle doit apparaître quand même.
  section("Entraînement", 3),
]

/** Minuit ce matin, sur l'heure du navigateur qui fait tourner le banc. */
function minuitLocal(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Une réservation en cours, et une qui a expiré : les deux cas que
 * « Où j'en suis » distingue — ça bouge, et ça ne bouge plus. */
function reserve(item: DevItem, session: string, minutes: number): DevItem {
  return {
    ...item,
    claimed_by: session,
    claimed_at: new Date(Date.now() - 60 * 60000).toISOString(),
    claim_expires_at: new Date(Date.now() + minutes * 60000).toISOString(),
  }
}

const CHANTIERS = [
  reserve(
    chantier("Le micro se coupe en pleine phrase", "Voix et écoute", "in_progress"),
    "claude/voix-et-ecoute",
    45,
  ),
  chantier("Réveil vocal en arrière-plan", "Voix et écoute"),
  reserve(chantier("Widget d'écran d'accueil", "Le téléphone"), "claude/telephone-arretee", -120),
  // Une archive du jour : la liste des archivées, le compte « livrés cette
  // semaine », et la colonne « livré » de « Où j'en suis ». Datée à minuit
  // LOCAL plutôt qu'à « il y a deux jours » — la colonne « livré » compte par
  // défaut depuis minuit, et un banc qui ne tomberait dans la fenêtre qu'à
  // certaines heures du jour serait vert le matin et rouge le soir.
  {
    ...chantier("Le badge de version, livré", "Le téléphone", "done"),
    archived_at: minuitLocal().toISOString(),
  },
  {
    // Un marqueur en tête des notes, comme les sessions en écrivent : il doit
    // se voir sur la ligne, sans déplier.
    ...chantier("Un chantier dicté trop vite", null),
    notes: "[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]\nIl faut trancher le coût d'abord.",
  },
]

/** Deux messages du journal rattachés au premier chantier : une question
 * restée sans réponse, et une info. */
const MESSAGES: DevLogEntry[] = [
  {
    id: "m1",
    user_id: "banc",
    item_id: "c2",
    author: "claude/voix-et-ecoute",
    kind: "question",
    body: "Tu veux que je coupe le micro après 30 s de silence, ou qu'il attende ?",
    answered_at: null,
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
  {
    id: "m2",
    user_id: "banc",
    item_id: "c2",
    author: "claude/voix-et-ecoute",
    kind: "info",
    body: "En attendant je pars sur 30 s, c'est réversible.",
    answered_at: null,
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
]

/**
 * Les deux familles de « Ce qui attend ta décision » : une DÉCISION avec ses
 * options cliquables, et une ACTION de son côté. Rattachées à aucun chantier
 * exprès — c'est le cas qui n'apparaît sur aucune ligne de « Où j'en suis » et
 * qui, sans cet écran, attendrait indéfiniment.
 */
const DECISIONS: DevLogEntry[] = [
  {
    id: "d1",
    user_id: "banc",
    item_id: "c2",
    author: "claude/memoire",
    kind: "question",
    body: "On garde le mot-à-mot des conversations combien de temps ?",
    pourquoi: "Supprimer est irréversible, garder ne l'est pas.",
    options: [
      {
        cle: "sans_limite",
        libelle: "Sans limite",
        aide: "Rien n'est jamais supprimé, tu peux redescendre quand tu veux.",
        recommande: true,
      },
      { cle: "30j", libelle: "30 jours" },
      { cle: "7j", libelle: "7 jours" },
    ],
    answered_at: null,
    created_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
  },
  {
    id: "d2",
    user_id: "banc",
    item_id: null,
    author: "claude/telephone",
    kind: "action",
    body: "Dépose GOOGLE_GEOCODING_API_KEY dans les secrets Supabase",
    pourquoi: "Sans elle, les rappels de lieu ne savent pas géocoder une adresse.",
    etat: null,
    answered_at: null,
    created_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
]

/**
 * Un compte rendu d'une session à l'autre, à sa VRAIE longueur.
 *
 * Le 6 sept., deux notes de 2 000 et 2 500 caractères occupaient les deux
 * lignes les plus précieuses du bandeau « Depuis ton dernier passage » — le
 * matin même où Raphaël a dit ne pas arriver à savoir ce qui avait bougé. Une
 * note courte dans un banc d'essai ne reproduit pas ce défaut.
 */
const COMPTE_RENDU: DevLogEntry = {
  id: "cr1",
  user_id: "banc",
  item_id: null,
  author: "claude/une-autre-session",
  kind: "info",
  body:
    "SESSION X — commits abc1234, def5678. CE QUI VOUS CONCERNE : " +
    "la fonction machin a été déplacée, réutilisez-la plutôt que d'en écrire une seconde. ".repeat(20),
  answered_at: null,
  created_at: new Date(Date.now() - 90 * 60000).toISOString(),
}

const ERREURS = [
  erreur("Il a créé une tâche au lieu d'un chantier", "comprehension", 3),
  erreur("Le serveur vocal a refusé de répondre", "serveur"),
]

/**
 * Le cockpit à sa VRAIE taille (`?volume=1`) : quatre-vingts chantiers
 * répartis sur neuf sections, comme la base de Raphaël au 4 sept. 2026.
 *
 * Pourquoi c'est un cas à part : tout ce qui rend une liste lisible se
 * vérifie sur quatre chantiers et se casse sur quatre-vingts. Une barre de
 * filtres qui prend la moitié de l'écran, une rangée de puces qui déborde,
 * une barre d'actions groupées qu'on ne peut plus atteindre — rien de tout ça
 * ne se voit sur un banc à quatre lignes.
 */
const SECTIONS_REELLES = [
  "Voix et écoute",
  "Le téléphone",
  "Mémoire et apprentissage",
  "L'app elle-même",
  "Messagerie et agenda",
  "Ce qu'il me signale",
  "Recherche et veille",
  "Coût de fonctionnement",
  "A faire par Raphael",
]

const MARQUEURS_REELS = [
  "[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]\nIl faut trancher le coût.",
  "[LIBRE] Spécifié de bout en bout.",
  '[BLOQUÉ PAR : "Mémoire longue durée"]',
  null,
  null,
]

/** Le registre tel qu'il sera dans quelques mois : quarante erreurs
 * distinctes. La carte doit rester lisible. */
function erreursEnVolume(): JarvisErreur[] {
  const familles: ErreurCategorie[] = ["comprehension", "action", "ecoute", "serveur", "systeme"]
  return Array.from({ length: 40 }, (_, i) =>
    erreur(`Erreur numéro ${i + 1} relevée dans le cockpit`, familles[i % familles.length], (i % 4) + 1),
  )
}

function volumeReel(): { chantiers: DevItem[]; sections: DevSection[] } {
  // En mode calme, aucune réservation expirée : la carte « Qui travaille »
  // reste repliée, comme un jour ordinaire.
  const sections = SECTIONS_REELLES.map((nom, i) => section(nom, i + 1))
  const chantiers: DevItem[] = []
  // Des titres VRAIMENT différents les uns des autres, et pas seulement par
  // un numéro : la comparaison de mots retire les chiffres. Trois listes de
  // longueurs premières entre elles (11, 12, 13) : deux titres ne peuvent pas
  // partager à la fois leur début et leur fin avant le 143e, donc jamais sur
  // 83. Vérifié : 83 titres, aucune paire signalée — comme sur les 192
  // chantiers réels de Raphaël, où la mesure n'en sort qu'une, la vraie.
  //
  // Un banc qui fabrique ses propres doublons ferait mesurer un artefact du
  // banc au lieu du cockpit : la première version croisait 12 sujets et
  // 7 nuances, donc deux titres partageaient tout leur sujet, et la carte
  // « Ça existe déjà » en annonçait cinq qui n'existaient nulle part ailleurs.
  const DEBUTS = [
    "Corriger",
    "Comprendre pourquoi",
    "Mesurer",
    "Rendre réglable",
    "Documenter",
    "Supprimer",
    "Accélérer",
    "Simplifier",
    "Retrouver",
    "Fiabiliser",
    "Annuler",
  ]
  const QUOI = [
    "le micro",
    "la lecture des reçus",
    "le widget d'accueil",
    "les rappels de lieu",
    "la voix dictée",
    "l'agenda partagé",
    "les pièces jointes",
    "le tri des tâches",
    "la recherche",
    "les brouillons",
    "l'export PDF",
    "le thème sombre",
  ]
  const QUAND = [
    "quand le réseau tombe",
    "au premier lancement",
    "pendant une dictée longue",
    "après une mise à jour",
    "avec plusieurs comptes ouverts",
    "sur un écran de téléphone",
    "une fois l'app fermée",
    "hors ligne",
    "en pleine nuit",
    "depuis le widget",
    "à la reconnexion",
    "quand la batterie est faible",
    "sous Android 15",
  ]
  for (let i = 0; i < 83; i++) {
    const theme = SECTIONS_REELLES[i % SECTIONS_REELLES.length]
    const c = chantier(
      // Le nom de la section reste dans le titre : d'autres contrôles s'en
      // servent pour vérifier qu'un filtre ne laisse bien que sa section.
      `${DEBUTS[i % 11]} ${QUOI[i % 12]} ${QUAND[i % 13]} sur ${theme.toLowerCase()}`,
      theme,
      i % 7 === 0 ? "in_progress" : "todo",
    )
    chantiers.push({
      ...c,
      notes: MARQUEURS_REELS[i % MARQUEURS_REELS.length],
      // Un quart d'archives, comme en vrai.
      archived_at: i % 4 === 3 ? new Date(Date.now() - i * 3600_000).toISOString() : null,
    })
  }
  return { chantiers, sections }
}

/**
 * `?reel=1` : le banc monte les VRAIES données du cockpit, injectées par le
 * script qui pilote le navigateur (jamais commitées ici — elles vieilliraient
 * en une journée). Sert à voir ce que donnent les vrais titres, les vraies
 * notes et les vraies réservations, que des données inventées ne reproduisent
 * pas : titres de deux cents caractères, notes qui citent d'autres chantiers,
 * thèmes sans section, réservations expirées depuis trois jours.
 */
interface FixtureReelle {
  chantiers: DevItem[]
  sections: DevSection[]
  messages: DevLogEntry[]
}
const REELLES = (window as unknown as { __FIXTURE_REELLE?: FixtureReelle }).__FIXTURE_REELLE

/** `?doublons=1` : deux chantiers strictement identiques, plus un ouvert qui
 * redit un chantier déjà archivé. Le cas réel du 5 sept. 2026, où deux
 * « Sous-sections pour sessions multiples Claude Code » cohabitaient. */
const DOUBLONS = new URLSearchParams(location.search).has("doublons")

const VOLUME = new URLSearchParams(location.search).has("volume")
/** Le cockpit un jour ordinaire : rien qui appelle une action — pas de
 * question en attente, pas de réservation abandonnée. C'est l'état dans lequel
 * Raphaël l'ouvre le plus souvent, donc celui qui doit tenir dans un écran. */
const CALME = new URLSearchParams(location.search).has("calme")
/** `?panne=1` : les sections et le registre des erreurs n'ont pas pu être
 * chargés. Ce que le cockpit dit alors compte autant que ce qu'il dit quand
 * tout va bien — une panne muette se lit comme une absence. */
const PANNE = new URLSearchParams(location.search).has("panne")
const REEL = VOLUME ? volumeReel() : null

function BancDuCockpit() {
  const [devItems, setDevItems] = useState<DevItem[]>(
    DOUBLONS
      ? [
          chantier("Sous-sections pour sessions multiples Claude Code", "Le cockpit"),
          chantier("Sous-sections pour sessions multiples Claude Code", "Le cockpit"),
          {
            ...chantier("Retrouver une conversation passée", "Mémoire et apprentissage"),
            archived_at: new Date(Date.now() - 86400_000).toISOString(),
          },
          chantier("Retrouver une conversation passée", "Mémoire et apprentissage"),
          chantier("Le micro se coupe entre deux phrases", "Voix et écoute"),
        ]
      : (REELLES?.chantiers ?? REEL?.chantiers ?? CHANTIERS),
  )
  const [sections] = useState<DevSection[]>(REELLES?.sections ?? REEL?.sections ?? SECTIONS)
  const [erreurs, setErreurs] = useState<JarvisErreur[]>(VOLUME ? erreursEnVolume() : ERREURS)
  const [messages, setMessages] = useState<DevLogEntry[]>(
    REELLES?.messages ?? (CALME ? [] : [...MESSAGES, ...DECISIONS, COMPTE_RENDU]),
  )
  const [filtre, setFiltre] = useState<FiltreCockpit>(FILTRE_VIDE)

  const sectionsState = {
    sections: PANNE ? [] : sections,
    loading: false,
    error: PANNE ? "Le serveur ne répond pas." : (null as string | null),
    refresh: rien,
    addSection: rien,
    updateSection: rien,
    renameSection: async () => 0,
    mergeSections: async () => 0,
    removeSection: async () => 0,
    reorderSections: rien,
  }

  const erreursState = {
    erreurs: PANNE ? [] : erreurs,
    loading: false,
    error: PANNE ? "Le serveur ne répond pas." : (null as string | null),
    refresh: rien,
    ajouterErreur: rien,
    modifierErreur: rien,
    changerStatut: rien,
    supprimerErreur: async (id: string) => {
      setErreurs((e) => e.filter((x) => x.id !== id))
    },
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Le même Toaster que l'app : c'est lui qui porte le bouton
          « Annuler » après une action groupée. Sans lui, le banc verrait
          l'action réussir et manquerait la moitié qui compte. */}
      <Toaster />
      <DepuisTonDernierPassage devItems={devItems} messages={messages} />
      <OuJenSuis
        devItems={devItems}
        sections={sections}
        messages={messages}
        onLiberer={async (id) => {
          setDevItems((items) =>
            items.map((i) =>
              i.id === id ? { ...i, claimed_by: null, claimed_at: null, claim_expires_at: null } : i,
            ),
          )
        }}
        onVoirSection={(nom) => setFiltre({ ...FILTRE_VIDE, section: nom })}
      />
      <CeQuiAttendTaDecision
        messages={messages}
        devItems={devItems}
        onRepondre={async (question, option, commentaire) => {
          setMessages((m) => [
            ...m.map((x) =>
              x.id === question.id ? { ...x, answered_at: new Date().toISOString() } : x,
            ),
            {
              id: `rep-${question.id}`,
              user_id: "banc",
              item_id: question.item_id,
              author: "Raphaël",
              kind: "reponse",
              body: [option?.libelle, commentaire.trim()].filter(Boolean).join(" — "),
              answered_at: null,
              created_at: new Date().toISOString(),
            },
          ])
        }}
        onEtat={async (id, etat) => {
          setMessages((m) =>
            m.map((x) =>
              x.id === id
                ? { ...x, etat, answered_at: etat === "fait" ? new Date().toISOString() : null }
                : x,
            ),
          )
        }}
      />
      <EnvoyerAClaudeCode
        devItems={devItems}
        sections={sections}
        themes={sections.map((s) => s.nom)}
        onSend={async () => {}}
      />

      {/* Le journal, à sa place réelle dans la page : sans lui, la mesure de
          ce qu'on voit en arrivant serait fausse de deux cents points. */}
      <DevLogFeed
        entries={messages}
        devItems={devItems}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onAdd={async () => {}}
        onMarkAnswered={async () => {}}
      />
      {/* SANS div d'enrobage, et c'est important : la carte se retire d'elle-même
          quand il n'y a rien à dire, mais un conteneur vide continuerait de
          consommer un `gap` de la colonne. Seize points de plus poussés sur
          tout ce qui suit, mesurés par le banc, pour un bloc invisible. */}
      <DoublonsTrouves
        devItems={devItems}
        onArchive={async (id) =>
          setDevItems((liste) =>
            liste.map((i) => (i.id === id ? { ...i, archived_at: new Date().toISOString() } : i)),
          )
        }
        onRestore={async () => {}}
      />

      <ErreursJarvis
        erreursState={erreursState}
        devItems={devItems}
        sections={sections}
        onCreerChantier={async () => undefined}
      />
      <CockpitBoard
        devItems={devItems}
        sectionsState={sectionsState}
        filtre={filtre}
        onFiltre={setFiltre}
        onUpdate={async (id, patch) => {
          setDevItems((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i)))
        }}
        onDelete={async (id) => {
          setDevItems((items) => items.filter((i) => i.id !== id))
        }}
        onArchive={rien}
        onUnarchive={rien}
        onUpdateMany={async (ids, patch) => {
          setDevItems((items) =>
            items.map((i) => (ids.includes(i.id) ? { ...i, ...patch } : i)),
          )
        }}
        onArchiveMany={async (ids) => {
          setDevItems((items) =>
            items.map((i) =>
              ids.includes(i.id)
                ? { ...i, status: "done", archived_at: "2026-09-04T12:00:00Z" }
                : i,
            ),
          )
        }}
        onDeleteMany={async (ids) => {
          setDevItems((items) => items.filter((i) => !ids.includes(i.id)))
        }}
        messages={messages}
        onRepondre={async (itemId, body) => {
          setMessages((m) => [
            ...m,
            {
              id: `r${m.length}`,
              user_id: "banc",
              item_id: itemId,
              author: "Raphaël",
              kind: "reponse",
              body,
              answered_at: null,
              created_at: new Date().toISOString(),
            },
          ])
        }}
        onMarquerTraite={async (id) => {
          setMessages((m) =>
            m.map((x) => (x.id === id ? { ...x, answered_at: new Date().toISOString() } : x)),
          )
        }}
        onRestore={async (etats) => {
          setDevItems((items) =>
            items.map((i) => {
              const etat = etats.find((e) => e.id === i.id)
              return etat ? { ...i, ...etat } : i
            }),
          )
        }}
      />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<BancDuCockpit />)
