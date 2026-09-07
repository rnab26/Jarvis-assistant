import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { BarreActualiser } from "@/components/BarreActualiser"
import { LoadError } from "@/components/LoadError"
import { CategoryFilter, ALL_CATEGORIES } from "@/components/tasks/CategoryFilter"
import { EnAttenteDenvoi } from "@/components/tasks/EnAttenteDenvoi"
import { OrganiserCategories } from "@/components/tasks/OrganiserCategories"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TaskList } from "@/components/tasks/TaskList"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { categoriesOrdonnees } from "@/lib/ordreCategories"
import type { Task } from "@/types/database"

export function DashboardPage() {
  const { tasksState, devItemsState, notificationsState } = useJarvisData()
  const {
    tasks,
    categories,
    loading,
    error,
    refresh,
    derniereMaj,
    statutDirect,
    actualisationEnCours,
    actualiser,
    addTask,
    updateTask,
    deleteTask,
    toggleStatus,
    addCategory,
    renameCategory,
    deleteCategory,
    reorderCategories,
    fileEnAttente,
    fileIllisible,
    relancerEnvoi,
    oublierEnAttente,
  } = tasksState
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)

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
    // Une dictée encore en attente de réseau n'existe pas en base : un
    // update par id ne toucherait aucune ligne, et la tâche repartirait
    // pour un second chantier au prochain appui (revue Copilot, PR #5).
    if (task.enAttente) oublierEnAttente(task.id)
    else await toggleStatus(task)
  }

  const filteredTasks =
    categoryFilter === ALL_CATEGORIES
      ? tasks
      : tasks.filter((t) => t.category_id === categoryFilter)


  return (
    <div className="flex flex-col gap-4">
      {/* SON REPROCHE DU 7 SEPT., et le pourquoi de cette disposition : « c'est
          plus logique d'avoir une tâche a ajouter au milieu et sur le cote les
          categorie modulable ». Avant, « + Tâche » était un petit bouton coincé
          à droite, et le champ « Nouvelle catégorie » occupait une ligne pleine
          largeur — alors qu'on crée une catégorie deux fois par an et une tâche
          dix fois par jour. Tout ce qui touche aux catégories est passé
          derrière le crayon, et l'ajout de tâche a pris la place. */}
      <div className="flex items-center gap-2">
        <CategoryFilter
          categories={categoriesOrdonnees(categories)}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <OrganiserCategories
          categories={categories}
          taches={tasks}
          onAjouter={addCategory}
          onRenommer={renameCategory}
          onSupprimer={deleteCategory}
          onReordonner={reorderCategories}
        />
      </div>

      <TaskFormDialog
        categories={categoriesOrdonnees(categories)}
        taches={tasks}
        onSubmit={addTask}
        trigger={
          <Button className="w-full">
            <Plus className="size-4" />
            Nouvelle tâche
          </Button>
        }
      />

      {/* Ce qu'il a dicté sans réseau. La carte ne s'affiche PAS quand il n'y
          a rien : un bandeau « 0 en attente » use le signal qui doit servir le
          jour où il y en a. Elle est au-dessus de la liste et pas dedans,
          parce que le filtre de catégorie ne doit pas pouvoir la masquer. */}
      <EnAttenteDenvoi file={fileEnAttente} illisible={fileIllisible} />

      {/* SA PLAINTE, MOT POUR MOT : « Les taches ne s'affichent pas en live et
          il n'y a aucun moyen d'actualiser ». La seconde moitié était vraie
          sans réserve — `refresh` n'était atteignable que depuis l'écran
          d'erreur, donc jamais quand le chargement avait RÉUSSI et que c'est
          le direct qui était tombé.

          Une ligne, pas une carte : l'écran vient d'être réorganisé pour que
          « Nouvelle tâche » soit au centre, et lui reprendre cinquante points
          pour un bandeau serait défaire ce travail. */}
      <BarreActualiser
        statut={statutDirect}
        derniereMaj={derniereMaj}
        enCours={actualisationEnCours}
        onActualiser={actualiser}
      />

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
          prefsNotifs={notificationsState.prefs}
          onRelancerEnvoi={relancerEnvoi}
          onOublierEnAttente={oublierEnAttente}
        />
      )}
    </div>
  )
}
