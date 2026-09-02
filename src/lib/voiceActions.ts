import type {
  Category,
  DevItem,
  DevItemInput,
  DevPriority,
  DevStatus,
  DocumentFile,
  Task,
  TaskInput,
  TaskStatus,
} from "@/types/database"

export type VoiceAction =
  | { action: "list_tasks"; filter_category_id?: string; filter_status?: TaskStatus }
  | {
      action: "add_task"
      title: string
      notes?: string | null
      category_id?: string | null
      due_date?: string | null
    }
  | { action: "update_task"; task_id: string; changes: Partial<TaskInput> }
  | { action: "delete_task"; task_id: string }
  | { action: "list_dev_items"; filter_status?: DevStatus }
  | {
      action: "add_dev_item"
      title: string
      notes?: string | null
      priority?: DevPriority
      status?: DevStatus
    }
  | { action: "update_dev_item"; item_id: string; changes: Partial<DevItemInput> }
  | { action: "delete_dev_item"; item_id: string }
  | { action: "archive_dev_item"; item_id: string }
  | { action: "list_documents" }
  | { action: "save_document"; filename: string; content: string }
  | { action: "clarify"; message: string }
  | { action: "unknown"; message: string }

export interface TasksApi {
  tasks: Task[]
  categories: Category[]
  addTask: (input: TaskInput) => Promise<void>
  updateTask: (id: string, input: Partial<TaskInput>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
}

export interface DevItemsApi {
  devItems: DevItem[]
  addDevItem: (input: DevItemInput) => Promise<void>
  updateDevItem: (id: string, input: Partial<DevItemInput>) => Promise<void>
  deleteDevItem: (id: string) => Promise<void>
  archiveDevItem: (id: string) => Promise<void>
}

export interface DocumentsApi {
  documents: DocumentFile[]
  saveTextDocument: (filename: string, content: string) => Promise<void>
}

function categoryName(categories: Category[], id: string | null | undefined) {
  return categories.find((c) => c.id === id)?.name
}

const STATUS_LABEL: Record<DevStatus, string> = {
  todo: "à faire",
  in_progress: "en cours",
  done: "terminé",
}

/** Exécute une VoiceAction résolue par la Edge Function et renvoie la phrase à énoncer. */
export async function executeVoiceAction(
  action: VoiceAction,
  { tasks, categories, addTask, updateTask, deleteTask }: TasksApi,
  { devItems, addDevItem, updateDevItem, deleteDevItem, archiveDevItem }: DevItemsApi,
  { documents, saveTextDocument }: DocumentsApi,
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
        notes: action.notes ?? null,
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

    case "list_dev_items": {
      const filtered = devItems.filter(
        (i) => !action.filter_status || i.status === action.filter_status,
      )
      if (filtered.length === 0) return "Aucun chantier trouvé."
      const titles = filtered.slice(0, 8).map((i) => i.title)
      return `Tu as ${filtered.length} chantier${filtered.length > 1 ? "s" : ""} : ${titles.join(", ")}.`
    }

    case "add_dev_item": {
      await addDevItem({
        title: action.title,
        notes: action.notes ?? null,
        status: action.status ?? "todo",
        priority: action.priority ?? "normal",
      })
      return `Chantier "${action.title}" ajouté au cockpit.`
    }

    case "update_dev_item": {
      const item = devItems.find((i) => i.id === action.item_id)
      await updateDevItem(action.item_id, action.changes)
      const label = item?.title ?? "le chantier"
      if (action.changes.status) {
        return `"${label}" passé en ${STATUS_LABEL[action.changes.status]}.`
      }
      return `"${label}" mis à jour.`
    }

    case "delete_dev_item": {
      const item = devItems.find((i) => i.id === action.item_id)
      await deleteDevItem(action.item_id)
      return `"${item?.title ?? "Chantier"}" supprimé du cockpit.`
    }

    case "archive_dev_item": {
      const item = devItems.find((i) => i.id === action.item_id)
      await archiveDevItem(action.item_id)
      return `"${item?.title ?? "Chantier"}" marqué fait et archivé.`
    }

    case "list_documents": {
      if (documents.length === 0) return "Aucun document."
      const names = documents.slice(0, 8).map((d) => d.name)
      return `Tu as ${documents.length} document${documents.length > 1 ? "s" : ""} : ${names.join(", ")}.`
    }

    case "save_document": {
      await saveTextDocument(action.filename, action.content)
      return `Document "${action.filename}" enregistré.`
    }

    case "clarify":
    case "unknown":
      return action.message
  }
}
