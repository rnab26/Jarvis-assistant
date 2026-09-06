import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TaskItem } from "@/components/tasks/TaskItem"
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
      {orderedKeys.map((categoryId) => {
        const groupTasks = groups.get(categoryId)!
        return (
          <Card key={categoryId}>
            <CardHeader>
              <CardTitle className="text-base">
                {categoryById.get(categoryId) ?? NO_CATEGORY_LABEL}
              </CardTitle>
            </CardHeader>
            {/* Un filet entre deux tâches, pas un cadre autour de chacune :
                c'est ce qui rend la liste compacte sans rétrécir le texte. */}
            <CardContent className="divide-y">
              {groupTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  categories={categories}
                  onToggle={onToggle}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  prefsNotifs={prefsNotifs}
                  onEnFaireUnChantier={
                    onEnFaireUnChantier
                      ? (titre, notes) => onEnFaireUnChantier(task, titre, notes)
                      : undefined
                  }
                />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
