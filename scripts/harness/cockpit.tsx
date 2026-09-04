import { useState } from "react"
import { createRoot } from "react-dom/client"
// La vraie feuille de style de l'app : sans elle, le contrôle de largeur sur
// un écran de téléphone ne voudrait rien dire.
import "@/index.css"
import { Toaster } from "@/components/ui/sonner"
import { CockpitBoard } from "@/components/cockpit/CockpitBoard"
import { EnvoyerAClaudeCode } from "@/components/cockpit/EnvoyerAClaudeCode"
import { DevLogFeed } from "@/components/cockpit/DevLogFeed"
import { ErreursJarvis } from "@/components/cockpit/ErreursJarvis"
import { SessionsAuTravail } from "@/components/cockpit/SessionsAuTravail"
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

/** Une réservation en cours, et une qui a expiré : les deux cas de la carte
 * « Qui travaille en ce moment ». */
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
  // Une archive récente : la liste des archivées et le compte « livrés cette
  // semaine » n'étaient couverts par rien.
  {
    ...chantier("Le badge de version, livré", "Le téléphone", "done"),
    archived_at: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
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

function volumeReel(): { chantiers: DevItem[]; sections: DevSection[] } {
  // En mode calme, aucune réservation expirée : la carte « Qui travaille »
  // reste repliée, comme un jour ordinaire.
  const sections = SECTIONS_REELLES.map((nom, i) => section(nom, i + 1))
  const chantiers: DevItem[] = []
  for (let i = 0; i < 83; i++) {
    const theme = SECTIONS_REELLES[i % SECTIONS_REELLES.length]
    const c = chantier(
      `Chantier numéro ${i + 1} sur ${theme.toLowerCase()}, avec un titre assez long pour déborder`,
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

const VOLUME = new URLSearchParams(location.search).has("volume")
/** Le cockpit un jour ordinaire : rien qui appelle une action — pas de
 * question en attente, pas de réservation abandonnée. C'est l'état dans lequel
 * Raphaël l'ouvre le plus souvent, donc celui qui doit tenir dans un écran. */
const CALME = new URLSearchParams(location.search).has("calme")
const REEL = VOLUME ? volumeReel() : null

function BancDuCockpit() {
  const [devItems, setDevItems] = useState<DevItem[]>(REEL?.chantiers ?? CHANTIERS)
  const [sections] = useState<DevSection[]>(REEL?.sections ?? SECTIONS)
  const [erreurs, setErreurs] = useState<JarvisErreur[]>(ERREURS)
  const [messages, setMessages] = useState<DevLogEntry[]>(CALME ? [] : MESSAGES)

  const sectionsState = {
    sections,
    loading: false,
    error: null as string | null,
    refresh: rien,
    addSection: rien,
    updateSection: rien,
    renameSection: async () => 0,
    mergeSections: async () => 0,
    removeSection: async () => 0,
    reorderSections: rien,
  }

  const erreursState = {
    erreurs,
    loading: false,
    error: null as string | null,
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
      <EnvoyerAClaudeCode
        devItems={devItems}
        sections={sections}
        themes={sections.map((s) => s.nom)}
        onSend={async () => {}}
      />
      <SessionsAuTravail
        devItems={devItems}
        onLiberer={async (id) => {
          setDevItems((items) =>
            items.map((i) =>
              i.id === id ? { ...i, claimed_by: null, claimed_at: null, claim_expires_at: null } : i,
            ),
          )
        }}
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
      <ErreursJarvis
        erreursState={erreursState}
        devItems={devItems}
        sections={sections}
        onCreerChantier={async () => undefined}
      />
      <CockpitBoard
        devItems={devItems}
        sectionsState={sectionsState}
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
