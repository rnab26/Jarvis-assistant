import type {
  Category,
  Contact,
  ContactInput,
  DevItem,
  DevItemInput,
  DevPriority,
  DevStatus,
  DocumentFile,
  PlaceReminder,
  PlaceReminderInput,
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
  | {
      action: "configure_widget"
      max_tasks?: number
      urgent_only?: boolean
      category_id?: string | null
    }
  | { action: "list_contacts" }
  | { action: "add_contact"; name: string; notes?: string | null }
  | { action: "update_contact"; contact_id: string; changes: Partial<ContactInput> }
  | { action: "delete_contact"; contact_id: string }
  | { action: "list_place_reminders" }
  | { action: "add_place_reminder"; place: string; reminder: string }
  | { action: "delete_place_reminder"; reminder_id: string }
  | { action: "chat"; message: string }
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

export interface ContactsApi {
  contacts: Contact[]
  addContact: (input: ContactInput) => Promise<void>
  updateContact: (id: string, input: Partial<ContactInput>) => Promise<void>
  deleteContact: (id: string) => Promise<void>
}

export interface PlaceRemindersApi {
  placeReminders: PlaceReminder[]
  addPlaceReminder: (input: PlaceReminderInput) => Promise<void>
  deletePlaceReminder: (id: string) => Promise<void>
}

export interface WidgetApi {
  config: { maxTasks: number; urgentOnly: boolean; categoryId: string | null }
  setConfig: (config: { maxTasks?: number; urgentOnly?: boolean; categoryId?: string | null }) => void
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
  { contacts, addContact, updateContact, deleteContact }: ContactsApi,
  { placeReminders, addPlaceReminder, deletePlaceReminder }: PlaceRemindersApi,
  { setConfig }: WidgetApi,
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

    case "configure_widget": {
      setConfig({
        maxTasks: action.max_tasks,
        urgentOnly: action.urgent_only,
        categoryId: action.category_id,
      })
      const catName = categoryName(categories, action.category_id ?? undefined)
      const parts: string[] = []
      if (action.max_tasks !== undefined) parts.push(`${action.max_tasks} tâche(s) affichées`)
      if (action.urgent_only !== undefined) {
        parts.push(action.urgent_only ? "urgentes uniquement" : "toutes les tâches")
      }
      if (action.category_id !== undefined) parts.push(catName ? `catégorie ${catName}` : "toutes catégories")
      return `Widget mis à jour${parts.length ? " : " + parts.join(", ") : ""}.`
    }

    case "list_contacts": {
      if (contacts.length === 0) return "Aucun contact enregistré."
      const names = contacts.slice(0, 8).map((c) => c.name)
      return `Tu as ${contacts.length} contact${contacts.length > 1 ? "s" : ""} : ${names.join(", ")}.`
    }

    case "add_contact": {
      await addContact({ name: action.name, notes: action.notes ?? null })
      return `Contact "${action.name}" ajouté.`
    }

    case "update_contact": {
      const contact = contacts.find((c) => c.id === action.contact_id)
      await updateContact(action.contact_id, action.changes)
      return `Contact "${contact?.name ?? "inconnu"}" mis à jour.`
    }

    case "delete_contact": {
      const contact = contacts.find((c) => c.id === action.contact_id)
      await deleteContact(action.contact_id)
      return `Contact "${contact?.name ?? "inconnu"}" supprimé.`
    }

    case "list_place_reminders": {
      if (placeReminders.length === 0) return "Aucun rappel de lieu enregistré."
      const items = placeReminders.slice(0, 8).map((p) => `${p.place} : ${p.reminder}`)
      return `Tu as ${placeReminders.length} rappel${placeReminders.length > 1 ? "s" : ""} de lieu : ${items.join(", ")}.`
    }

    case "add_place_reminder": {
      await addPlaceReminder({ place: action.place, reminder: action.reminder })
      return `Compris, je te le rappellerai quand tu parleras de ${action.place}.`
    }

    case "delete_place_reminder": {
      const reminder = placeReminders.find((p) => p.id === action.reminder_id)
      await deletePlaceReminder(action.reminder_id)
      return `Rappel pour "${reminder?.place ?? "ce lieu"}" supprimé.`
    }

    case "chat":
    case "clarify":
    case "unknown":
      return action.message
  }
}
