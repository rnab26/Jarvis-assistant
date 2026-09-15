import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TaskItem } from "@/components/tasks/TaskItem"
import { libelleArchive, phraseCategorieSoldee, repartir } from "@/lib/archiveTaches"
import type { PrefsNotifications } from "@/lib/notifications/prefs"
import type { Category, Task, TaskInput } from "@/types/database"

interface TaskListProps {
  tasks: Task[]
  categories: Category[]
  onToggle: (task: Task) => Promise<void>
  onUpdate: (id: string, input: TaskInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** Transformer une « tâche » qui est en fait une demande à Claude en
   * chantier du cockpit. Absent = la proposition ne s'affiche pas. */
  onEnFaireUnChantier?: (task: Task, titre: string, notes: string | null) => Promise<void>
  /** Pour dire, sur une ligne dépliée, ce que Jarvis fera sonner et quand. */
  prefsNotifs?: PrefsNotifications
  /** Relancer l'envoi d'une tâche restée en attente (réseau coupé). */
  onRelancerEnvoi?: (id: string) => void
  /** Retirer une dictée de la file d'attente. */
  onOublierEnAttente?: (id: string) => void
  /** Les terminées dépliées d'entrée ? Réglage `jarvis_taches_archives_ouvertes`
   * (Paramètres › Tâches et organisation). Replié par défaut : c'est le but
   * même de sa demande — que les tâches faites cessent de polluer la liste. */
  archivesOuvertes?: boolean
}

const NO_CATEGORY_LABEL = "Sans catégorie"

export function TaskList({
  tasks,
  categories,
  onToggle,
  onUpdate,
  onDelete,
  onEnFaireUnChantier,
  prefsNotifs,
  onRelancerEnvoi,
  onOublierEnAttente,
  archivesOuvertes = false,
}: TaskListProps) {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]))
  const groups = new Map<string, Task[]>()

  for (const task of tasks) {
    const key = task.category_id ?? "none"
    const group = groups.get(key) ?? []
    group.push(task)
    groups.set(key, group)
  }

  // Ordre stable : catégories dans l'ordre alphabétique déjà fourni par
  // useTasks, puis "Sans catégorie" en dernier — plutôt que l'ordre
  // d'apparition dans les tâches (qui change à chaque tri par échéance).
  const orderedKeys = [...categories.map((c) => c.id), "none"].filter((key) =>
    groups.has(key),
  )

  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Aucune tâche pour l'instant.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {orderedKeys.map((categoryId) => (
        <BlocCategorie
          key={categoryId}
          nom={categoryById.get(categoryId) ?? NO_CATEGORY_LABEL}
          taches={groups.get(categoryId)!}
          categories={categories}
          onToggle={onToggle}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEnFaireUnChantier={onEnFaireUnChantier}
          prefsNotifs={prefsNotifs}
          onRelancerEnvoi={onRelancerEnvoi}
          onOublierEnAttente={onOublierEnAttente}
          archivesOuvertes={archivesOuvertes}
        />
      ))}
    </div>
  )
}

/**
 * Un bloc de catégorie : son nom, ce qui reste à faire, et ses terminées.
 *
 * LE NOM EST CENTRÉ ET PORTE UN BANDEAU, et c'est sa demande du 15 sept. 2026
 * (capture à l'appui, trois noms de catégorie entourés) : « je veux que tu
 * centre le nom des catégories de listes dans leur blocs respectifs et fait
 * les plus ressortir sans que ce soit trop lourd mais quon puisse mieux faire
 * la distinction dans les differents blocs de liste de taches ».
 *
 * Le bandeau prend la place du padding haut de la carte au lieu de s'y
 * ajouter (`-mt-(--card-spacing)`) : sur dix catégories, un en-tête qui
 * coûterait vingt points chacun repousserait la moitié de sa liste hors de
 * l'écran. Pas de majuscules forcées — « HIPOUY » crie, et il demande
 * justement que ce ne soit pas lourd.
 */
function BlocCategorie({
  nom,
  taches,
  categories,
  onToggle,
  onUpdate,
  onDelete,
  onEnFaireUnChantier,
  prefsNotifs,
  onRelancerEnvoi,
  onOublierEnAttente,
  archivesOuvertes,
}: {
  nom: string
  taches: Task[]
} & Omit<TaskListProps, "tasks">) {
  const { aFaire, archivees } = repartir(taches)
  const [ouvert, setOuvert] = useState(archivesOuvertes === true)
  const soldee = aFaire.length === 0 ? phraseCategorieSoldee(archivees.length) : null

  const ligne = (task: Task) => (
    <TaskItem
      key={task.id}
      task={task}
      categories={categories}
      onToggle={onToggle}
      onUpdate={onUpdate}
      onDelete={onDelete}
      prefsNotifs={prefsNotifs}
      onRelancerEnvoi={onRelancerEnvoi}
      onOublierEnAttente={onOublierEnAttente}
      onEnFaireUnChantier={
        onEnFaireUnChantier
          ? (titre, notes) => onEnFaireUnChantier(task, titre, notes)
          : undefined
      }
    />
  )

  return (
    // `gap-2` AU LIEU DES 16 POINTS PAR DÉFAUT, et c'est ce qui paie le
    // bandeau : mesuré sur le banc, l'en-tête centré coûtait +9 points par
    // carte, resserrer les écarts internes en rend 8 par intervalle. Un blanc
    // de seize points sous un bandeau qui sépare déjà à l'œil ne sert plus à
    // rien — la séparation est faite par le trait, pas par le vide.
    <Card className="gap-2">
      <CardHeader className="-mt-(--card-spacing) border-b bg-muted/40 py-2.5">
        <CardTitle className="text-center font-semibold tracking-wide">{nom}</CardTitle>
      </CardHeader>
      {/* Un filet entre deux tâches, pas un cadre autour de chacune :
          c'est ce qui rend la liste compacte sans rétrécir le texte. */}
      <CardContent className="divide-y">
        {soldee ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{soldee}</p>
        ) : (
          aFaire.map(ligne)
        )}
      </CardContent>

      {/* LES TERMINÉES. Le dépliant ne s'affiche PAS quand il n'y en a aucune :
          « 0 terminées » est un contrôle mort, et la carte reste exactement
          aussi haute qu'avant pour une catégorie qu'il n'a pas encore
          entamée. */}
      {archivees.length > 0 && (
        <CardContent className="pt-0">
          <button
            type="button"
            aria-expanded={ouvert}
            onClick={() => setOuvert(!ouvert)}
            className="zone-tactile flex w-full items-center justify-center gap-1.5 border-t pt-2 text-xs text-muted-foreground"
          >
            {ouvert ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            )}
            {libelleArchive(archivees.length)}
          </button>
          {ouvert && <div className="divide-y">{archivees.map(ligne)}</div>}
        </CardContent>
      )}
    </Card>
  )
}
