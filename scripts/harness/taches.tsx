import { useState } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { Toaster } from "@/components/ui/sonner"
import { TaskItem } from "@/components/tasks/TaskItem"
import type { Task } from "@/types/database"

/**
 * Banc d'essai de la ligne de tâche — la vraie, montée hors de Supabase.
 *
 * Ce qu'il vérifie tient en une phrase : la corbeille d'une tâche demande
 * avant de supprimer. Jusqu'au 5 sept. 2026 elle supprimait au premier appui,
 * sans un mot, et une tâche supprimée ne se retrouve nulle part — il n'y a pas
 * d'archive pour les tâches, contrairement aux chantiers.
 */
const rien = async () => {}

const TACHES: Task[] = [
  {
    id: "t1",
    user_id: "banc",
    category_id: null,
    title: "Appeler le plombier",
    notes: "Avant vendredi",
    due_date: null,
    due_time: null,
    status: "todo",
    created_at: "2026-09-04T10:00:00Z",
    updated_at: "2026-09-04T10:00:00Z",
  },
]

function BancDesTaches() {
  const [taches, setTaches] = useState<Task[]>(TACHES)

  return (
    <div className="flex flex-col gap-2 p-3">
      <Toaster />
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
        />
      ))}
      {taches.length === 0 && <p id="vide">Plus aucune tâche.</p>}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<BancDesTaches />)
