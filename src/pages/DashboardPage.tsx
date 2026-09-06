import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoadError } from "@/components/LoadError"
import { CategoryFilter, ALL_CATEGORIES } from "@/components/tasks/CategoryFilter"
import { ChantiersEgares } from "@/components/tasks/ChantiersEgares"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TaskList } from "@/components/tasks/TaskList"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import type { Task } from "@/types/database"

export function DashboardPage() {
  const { tasksState, devItemsState } = useJarvisData()
  const {
    tasks,
    categories,
    loading,
    error,
    refresh,
    addTask,
    updateTask,
    deleteTask,
    toggleStatus,
    addCategory,
  } = tasksState
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const [newCategoryName, setNewCategoryName] = useState("")

  /**
   * Une « tâche » qui est en fait une demande à Claude passe dans le cockpit.
   *
   * On crée le chantier ET on marque la tâche faite — on ne la SUPPRIME
   * jamais : c'est sa liste, et il doit pouvoir retrouver ce qu'il a dicté.
   * La note d'origine part avec le chantier, sinon le contexte resterait dans
   * la tâche pendant que le travail part sans lui.
   */
  async function enFaireUnChantier(task: Task, titre: string, notes: string | null) {
    await devItemsState.addDevItem({
      title: titre,
      notes: [notes, `Dicté comme tâche perso le ${new Date(task.created_at).toLocaleDateString("fr-FR")}, remis dans le cockpit depuis l'onglet Tâches.`]
        .filter(Boolean)
        .join("\n\n"),
      status: "todo",
      priority: "normal",
      theme: null,
    })
    await toggleStatus(task)
  }

  const filteredTasks =
    categoryFilter === ALL_CATEGORIES
      ? tasks
      : tasks.filter((t) => t.category_id === categoryFilter)

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    try {
      await addCategory(newCategoryName.trim())
      setNewCategoryName("")
    } catch {
      // Erreur déjà signalée par un toast : on conserve la saisie.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <CategoryFilter
          categories={categories}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <TaskFormDialog
          categories={categories}
          taches={tasks}
          onSubmit={addTask}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Tâche
            </Button>
          }
        />
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Nouvelle catégorie"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
        />
        <Button variant="outline" onClick={handleAddCategory}>
          Ajouter
        </Button>
      </div>

      {/* En tête, et seulement s'il y en a. Le signalement existait déjà sur
          chaque ligne ; avec vingt-neuf tâches réparties par catégorie, il ne
          se trouvait que par hasard — ses mots du 6 sept. : « je ne vois pas
          de quelles 7 lignes existantes tu parles ». La carte porte sur TOUTES
          ses tâches, pas sur ce que le filtre de catégorie laisse passer :
          une tâche égarée dans une catégorie qu'il ne regarde pas est
          précisément celle qu'il ne trouve jamais. */}
      {!loading && !error && (
        <ChantiersEgares
          tasks={tasks}
          devItems={devItemsState.devItems}
          onEnFaireUnChantier={enFaireUnChantier}
          onMarquerFaite={toggleStatus}
        />
      )}

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : error ? (
        <LoadError message={error} onRetry={refresh} />
      ) : (
        <TaskList
          tasks={filteredTasks}
          categories={categories}
          onToggle={toggleStatus}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onEnFaireUnChantier={enFaireUnChantier}
        />
      )}
    </div>
  )
}
