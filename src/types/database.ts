export type TaskStatus = "todo" | "done"

export interface Category {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Task {
  id: string
  user_id: string
  category_id: string | null
  title: string
  notes: string | null
  due_date: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

export interface TaskInput {
  title: string
  notes: string | null
  due_date: string | null
  category_id: string | null
  status: TaskStatus
}

export type DevStatus = "todo" | "in_progress" | "done"
export type DevPriority = "low" | "normal" | "high"

export interface DevItem {
  id: string
  user_id: string
  title: string
  notes: string | null
  status: DevStatus
  priority: DevPriority
  archived_at: string | null
  /** Session Claude Code qui travaille dessus (nom de sa branche), si réservé. */
  claimed_by: string | null
  claimed_at: string | null
  /** Passé cette date la réservation tombe : une session interrompue ne bloque rien. */
  claim_expires_at: string | null
  created_at: string
  updated_at: string
}

/** Message du journal de bord : entre sessions, ou écrit par Raphaël. */
export type DevLogKind = "question" | "reponse" | "info" | "blocage"

export interface DevLogEntry {
  id: string
  user_id: string
  item_id: string | null
  author: string
  kind: DevLogKind
  body: string
  answered_at: string | null
  created_at: string
}

export interface DevItemInput {
  title: string
  notes: string | null
  status: DevStatus
  priority: DevPriority
}

export interface Contact {
  id: string
  user_id: string
  name: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ContactInput {
  name: string
  notes: string | null
}

export interface PlaceReminder {
  id: string
  user_id: string
  place: string
  reminder: string
  created_at: string
}

export interface PlaceReminderInput {
  place: string
  reminder: string
}

export interface DocumentFile {
  name: string
  path: string
  size: number
  createdAt: string
  contentType: string | null
}

/** Ce que Jarvis retient durablement : des faits courts, jamais le texte
 * des conversations. Voir la migration 0006. */
export type SouvenirCategorie = "personne" | "dossier" | "engagement" | "preference" | "fait"

export interface Souvenir {
  id: string
  user_id: string
  contenu: string
  categorie: SouvenirCategorie
  /** La phrase d'origine, pour vérifier d'où sort un souvenir. */
  source: string | null
  /** Un fait remplacé est marqué périmé plutôt que supprimé. */
  perime_at: string | null
  created_at: string
  updated_at: string
}
