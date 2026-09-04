import { useState } from "react"
import { createRoot } from "react-dom/client"
// La vraie feuille de style de l'app : sans elle, le contrôle de largeur sur
// un écran de téléphone ne voudrait rien dire.
import "@/index.css"
import { Toaster } from "@/components/ui/sonner"
import { CockpitBoard } from "@/components/cockpit/CockpitBoard"
import { ErreursJarvis } from "@/components/cockpit/ErreursJarvis"
import type {
  DevItem,
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

const CHANTIERS = [
  chantier("Le micro se coupe en pleine phrase", "Voix et écoute", "in_progress"),
  chantier("Réveil vocal en arrière-plan", "Voix et écoute"),
  chantier("Widget d'écran d'accueil", "Le téléphone"),
  chantier("Un chantier dicté trop vite", null),
]

const ERREURS = [
  erreur("Il a créé une tâche au lieu d'un chantier", "comprehension", 3),
  erreur("Le serveur vocal a refusé de répondre", "serveur"),
]

function BancDuCockpit() {
  const [devItems, setDevItems] = useState<DevItem[]>(CHANTIERS)
  const [sections] = useState<DevSection[]>(SECTIONS)
  const [erreurs, setErreurs] = useState<JarvisErreur[]>(ERREURS)

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
