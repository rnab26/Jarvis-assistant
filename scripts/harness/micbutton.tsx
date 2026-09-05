import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { MicButton } from "@/components/voice/MicButton"
import type { Task } from "@/types/database"

/**
 * Banc d'essai du cœur — le vrai MicButton, monté comme dans l'app, avec des
 * données factices qui arrivent APRÈS le montage, comme en vrai : l'app
 * s'affiche d'abord, les tâches sont chargées ensuite.
 *
 * Ce que ça vérifie (bug réel du 4 sept. 2026) : une conversation ouverte en
 * disant « Jarvis » — pas en appuyant sur le cœur — doit voir les tâches qui
 * ont été chargées après le montage. La boucle de veille vit dans un effet
 * monté une seule fois ; sans précaution, elle garde les fonctions du
 * premier rendu, où tout était encore vide, et Jarvis répond « Aucune tâche
 * trouvée » alors qu'il y en a dix-neuf.
 */
const rien = async () => {}

function tache(id: string, title: string): Task {
  return {
    id,
    user_id: "banc",
    title,
    notes: null,
    status: "todo",
    category_id: null,
    due_date: null,
    due_time: null,
    created_at: "2026-09-04T00:00:00Z",
    updated_at: "2026-09-04T00:00:00Z",
  } as Task
}

function BancDuCoeur() {
  const [tasks, setTasks] = useState<Task[]>([])

  // Les tâches arrivent un peu après le montage, comme depuis Supabase.
  useEffect(() => {
    const t = setTimeout(() => setTasks([tache("1", "Appeler le plombier"), tache("2", "Payer l'arnona")]), 400)
    return () => clearTimeout(t)
  }, [])

  return (
    <MicButton
      tasksApi={{ tasks, categories: [], addTask: rien, updateTask: rien, deleteTask: rien }}
      devItemsApi={{ devItems: [], addDevItem: rien, updateDevItem: rien, deleteDevItem: rien, archiveDevItem: rien }}
      devSectionsApi={{ sections: [], addSection: async () => {}, renameSection: async () => 0 }}
      documentsApi={{ documents: [], saveTextDocument: rien }}
      contactsApi={{ contacts: [], addContact: rien, updateContact: rien, deleteContact: rien }}
      placeRemindersApi={{ placeReminders: [], addPlaceReminder: rien, deletePlaceReminder: rien, geocodePlace: null }}
      pronunciationsApi={{ pronunciations: [], addPronunciation: rien, deletePronunciation: rien }}
      voiceSettingApi={{ muted: false, setMuted: () => {} }}
      widgetApi={{ config: { maxTasks: 5, urgentOnly: false, categoryId: null }, setConfig: () => {} }}
      wakeWordEnabled={true}
      voiceIndex={null}
      suiteMs={0}
    />
  )
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <BancDuCoeur />
  </MemoryRouter>,
)
