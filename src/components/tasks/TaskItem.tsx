import { Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import type { Category, Task, TaskInput } from "@/types/database"

interface TaskItemProps {
  task: Task
  categories: Category[]
  onToggle: (task: Task) => Promise<void>
  onUpdate: (id: string, input: TaskInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TaskItem({
  task,
  categories,
  onToggle,
  onUpdate,
  onDelete,
}: TaskItemProps) {
  const isDone = task.status === "done"

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggle(task)}
        className="size-4"
        aria-label="Marquer comme faite"
      />
      <div className="flex-1">
        <p className={isDone ? "text-muted-foreground line-through" : ""}>
          {task.title}
        </p>
        {task.notes && (
          <p className="text-sm text-muted-foreground">{task.notes}</p>
        )}
      </div>
      {task.due_date && (
        <Badge variant="outline">{task.due_date}</Badge>
      )}
      <TaskFormDialog
        categories={categories}
        task={task}
        onSubmit={(input) => onUpdate(task.id, input)}
        trigger={
          <Button variant="ghost" size="icon" aria-label="Modifier">
            <Pencil className="size-4" />
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Supprimer"
        onClick={() => onDelete(task.id)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
