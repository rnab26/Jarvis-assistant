import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TaskItem } from "@/components/tasks/TaskItem"
import type { Category, Task, TaskInput } from "@/types/database"

interface TaskListProps {
  tasks: Task[]
  categories: Category[]
  onToggle: (task: Task) => Promise<void>
  onUpdate: (id: string, input: TaskInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const NO_CATEGORY_LABEL = "Sans catégorie"

export function TaskList({
  tasks,
  categories,
  onToggle,
  onUpdate,
  onDelete,
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
            <CardContent className="flex flex-col gap-2">
              {groupTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  categories={categories}
                  onToggle={onToggle}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
