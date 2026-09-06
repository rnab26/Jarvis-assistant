import { useState } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { Toaster } from "@/components/ui/sonner"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TaskItem } from "@/components/tasks/TaskItem"
import { ChantiersEgares } from "@/components/tasks/ChantiersEgares"
import { Button } from "@/components/ui/button"
import type { DevItem, Task } from "@/types/database"

/**
 * Banc d'essai de la ligne de tâche — la vraie, montée hors de Supabase.
 *
 * Ce qu'il vérifie tient en une phrase : la corbeille d'une tâche demande
 * avant de supprimer. Jusqu'au 5 sept. 2026 elle supprimait au premier appui,
 * sans un mot, et une tâche supprimée ne se retrouve nulle part — il n'y a pas
 * d'archive pour les tâches, contrairement aux chantiers.
 */
const rien = async () => {}

function tache(id: string, title: string, notes: string | null = null): Task {
  return {
    id,
    user_id: "banc",
    category_id: null,
    title,
    notes,
    due_date: null,
    due_time: null,
    status: "todo",
    created_at: "2026-09-04T10:00:00Z",
    updated_at: "2026-09-04T10:00:00Z",
  }
}

const TACHES: Task[] = [
  tache("t1", "Appeler le plombier", "Avant vendredi"),
  // Une de ses VRAIES tâches du 5 sept. : une demande à Claude atterrie dans
  // sa liste de courses, où aucune session ne l'aurait jamais lue.
  tache("t2", "R un chantier : savoir combien il reste de credit"),
  // Et une vraie tâche qui parle d'un chantier de maçonnerie : elle ne doit
  // RIEN déclencher. Raphaël est dans l'immobilier — c'est le sens courant
  // du mot chez lui.
  tache("t3", "Commander les carreaux pour le chantier de la villa Dan"),
  tache("t4", "Racheter un spot pour l'entrée de la maison"),
  // Une seconde demande à Claude, elle aussi déjà présente dans le cockpit :
  // le cas le plus fréquent dans ses vraies données (quatre sur six).
  tache("t5", "R un chantier sur la latence du mode Live"),
]

/**
 * Deux chantiers du cockpit, dont UN qui correspond déjà à une tâche égarée.
 *
 * C'est le cas mesuré sur ses vraies données le 6 sept. : quatre des six
 * tâches égarées avaient déjà leur chantier. Sans ce garde-fou, un appui
 * créait un doublon de quelque chose parfois déjà livré.
 */
const CHANTIERS: DevItem[] = [
  {
    id: "d1",
    user_id: "banc",
    title: "Savoir combien il reste de crédit, et à combien de temps de discussion ça équivaut",
    notes: null,
    status: "todo",
    priority: "normal",
    theme: "Coût de fonctionnement",
    archived_at: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: "2026-09-05T10:00:00Z",
    updated_at: "2026-09-05T10:00:00Z",
  },
  {
    id: "d2",
    user_id: "banc",
    title: "Live dans l'app : lent, coupures, la latence du mode Live sur l'appareil",
    notes: null,
    status: "todo",
    priority: "high",
    theme: "Voix et écoute",
    archived_at: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: "2026-09-05T10:00:00Z",
    updated_at: "2026-09-05T10:00:00Z",
  },
]

function BancDesTaches() {
  const [taches, setTaches] = useState<Task[]>(TACHES)
  const [chantiersCrees, setChantiersCrees] = useState<string[]>([])

  return (
    <div className="flex flex-col gap-2 p-3">
      <Toaster />
      <TaskFormDialog
        categories={[]}
        taches={taches}
        onSubmit={rien}
        trigger={<Button size="sm">Nouvelle tâche</Button>}
      />
      <p id="chantiers-crees">Chantiers créés : {chantiersCrees.join(" | ") || "aucun"}</p>
      {/* La carte qui RASSEMBLE les tâches égarées, en tête de l'onglet. Ses
          mots du 6 sept. : « je ne vois pas de quelles 7 lignes existantes tu
          parles » — le signalement était sur chaque ligne, réparti dans
          vingt-neuf tâches. */}
      <div id="egares">
        <ChantiersEgares
          tasks={taches}
          devItems={CHANTIERS}
          onEnFaireUnChantier={async (t, titre) => {
            setChantiersCrees((liste) => [...liste, titre])
            setTaches((liste) => liste.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)))
          }}
          onMarquerFaite={async (t) => {
            setTaches((liste) => liste.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)))
          }}
        />
      </div>
      {taches.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          categories={[]}
          onToggle={rien}
          onUpdate={rien}
          onDelete={async (id) => {
            setTaches((liste) => liste.filter((x) => x.id !== id))
          }}
          onEnFaireUnChantier={async (titre) => {
            setChantiersCrees((liste) => [...liste, titre])
            setTaches((liste) =>
              liste.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)),
            )
          }}
        />
      ))}
      {taches.length === 0 && <p id="vide">Plus aucune tâche.</p>}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<BancDesTaches />)
