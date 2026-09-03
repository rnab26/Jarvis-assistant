import { Pencil, Trash2 } from "lucide-react"
import { alreadyNotified } from "@/lib/notifyError"
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
        onChange={() => onToggle(task).catch(alreadyNotified)}
        className="size-4"
        aria-label="Marquer comme faite"
      />
      <div className="flex-1">
        <p className={isDone ? "text-muted-foreground line-through" : ""}>
          {task.title}
        </p>
        {task.notes && (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{task.notes}</p>
        )}
      </div>
      {task.due_date && (
        <Badge variant="outline">
          {task.due_date}
          {task.due_time && ` ${task.due_time.slice(0, 5)}`}
        </Badge>
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
        onClick={() => onDelete(task.id).catch(alreadyNotified)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
