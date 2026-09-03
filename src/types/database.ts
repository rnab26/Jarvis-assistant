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
  /** Heure du rappel, format HH:MM ou HH:MM:SS. null si seule la date compte. */
  due_time: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

export interface TaskInput {
  title: string
  notes: string | null
  due_date: string | null
  due_time: string | null
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
  /** Coordonnées du lieu, renseignées seulement si la géolocalisation des
   * rappels est activée — null sinon (déclenchement conversationnel seul). */
  lat: number | null
  lng: number | null
  created_at: string
}

export interface PlaceReminderInput {
  place: string
  reminder: string
  lat?: number | null
  lng?: number | null
}

/** Une correction de transcription : ce que la dictée entend, et ce que
 * l'utilisateur dit en réalité. */
export interface Pronunciation {
  id: string
  user_id: string
  entendu: string
  veut_dire: string
  created_at: string
}

export interface PronunciationInput {
  entendu: string
  veut_dire: string
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

/** Le compte Google branché, tel que l'interface a le droit de le voir : ni
 * jeton d'accès ni jeton de rafraîchissement — ceux-là restent côté serveur,
 * dans une table sans aucune policy (migration 0013). */
export interface GoogleAccount {
  user_id: string
  email: string | null
  /** Les autorisations réellement accordées, séparées par des espaces. */
  scopes: string
  connected_at: string
}

/** Un événement d'agenda, tel que la fonction google-calendar le renvoie. */
export interface EvenementAgenda {
  id: string
  titre: string
  description: string | null
  lieu: string | null
  debut: string | null
  fin: string | null
  journee_entiere: boolean
  lien: string | null
}
