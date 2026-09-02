import type { Category, Task, TaskInput, TaskStatus } from "@/types/database"

export type VoiceAction =
  | { action: "list_tasks"; filter_category_id?: string; filter_status?: TaskStatus }
  | { action: "add_task"; title: string; category_id?: string | null; due_date?: string | null }
  | { action: "update_task"; task_id: string; changes: Partial<TaskInput> }
  | { action: "delete_task"; task_id: string }
  | { action: "clarify"; message: string }
  | { action: "unknown"; message: string }

export interface TasksApi {
  tasks: Task[]
  categories: Category[]
  addTask: (input: TaskInput) => Promise<void>
  updateTask: (id: string, input: Partial<TaskInput>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
}

function categoryName(categories: Category[], id: string | null | undefined) {
  return categories.find((c) => c.id === id)?.name
}

/** Exécute une VoiceAction résolue par la Edge Function et renvoie la phrase à énoncer. */
export async function executeVoiceAction(
  action: VoiceAction,
  { tasks, categories, addTask, updateTask, deleteTask }: TasksApi,
): Promise<string> {
  switch (action.action) {
    case "list_tasks": {
      const filtered = tasks.filter(
        (t) =>
          (!action.filter_category_id || t.category_id === action.filter_category_id) &&
          (!action.filter_status || t.status === action.filter_status),
      )
      if (filtered.length === 0) return "Aucune tâche trouvée."
      const titles = filtered.slice(0, 8).map((t) => t.title)
      return `Tu as ${filtered.length} tâche${filtered.length > 1 ? "s" : ""} : ${titles.join(", ")}.`
    }

    case "add_task": {
      await addTask({
        title: action.title,
        notes: null,
        due_date: action.due_date ?? null,
        category_id: action.category_id ?? null,
        status: "todo",
      })
      const catName = categoryName(categories, action.category_id)
      return `Tâche "${action.title}" ajoutée${catName ? ` dans ${catName}` : ""}.`
    }

    case "update_task": {
      const task = tasks.find((t) => t.id === action.task_id)
      await updateTask(action.task_id, action.changes)
      const label = task?.title ?? "la tâche"
      if (action.changes.status === "done") return `"${label}" marquée comme faite.`
      return `"${label}" mise à jour.`
    }

    case "delete_task": {
      const task = tasks.find((t) => t.id === action.task_id)
      await deleteTask(action.task_id)
      return `"${task?.title ?? "Tâche"}" supprimée.`
    }

    case "clarify":
    case "unknown":
      return action.message
  }
}
