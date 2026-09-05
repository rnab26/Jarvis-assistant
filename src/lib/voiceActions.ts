import { executerActionTelephone, type ActionTelephone } from "@/lib/actionsTelephoneVocales"
import { cleTheme } from "@/lib/themeChantier"
import { deciderDoublonVocal } from "@/lib/doublonChantierALaVoix"
import type {
  Category,
  Contact,
  ContactInput,
  DevItem,
  DevItemInput,
  DevPriority,
  DevSection,
  DevStatus,
  DocumentFile,
  EvenementAgenda,
  PlaceReminder,
  PlaceReminderInput,
  Pronunciation,
  PronunciationInput,
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
      due_time?: string | null
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
      theme?: string | null
    }
  | { action: "update_dev_item"; item_id: string; changes: Partial<DevItemInput> }
  | { action: "delete_dev_item"; item_id: string }
  | { action: "archive_dev_item"; item_id: string }
  | { action: "add_dev_section"; section_nom: string }
  | { action: "rename_dev_section"; section_id: string; section_nom: string }
  | { action: "list_documents" }
  | { action: "save_document"; filename: string; content: string }
  | {
      action: "configure_widget"
      max_tasks?: number
      urgent_only?: boolean
      category_id?: string | null
    }
  | { action: "list_contacts" }
  | { action: "add_contact"; name: string; notes?: string | null; phone?: string | null }
  | { action: "update_contact"; contact_id: string; changes: Partial<ContactInput> }
  | { action: "delete_contact"; contact_id: string }
  | { action: "list_place_reminders" }
  | { action: "add_place_reminder"; place: string; reminder: string }
  | { action: "delete_place_reminder"; reminder_id: string }
  | { action: "list_pronunciations" }
  | { action: "add_pronunciation"; entendu: string; veut_dire: string }
  | { action: "delete_pronunciation"; pronunciation_id: string }
  | {
      action: "list_calendar_events"
      event_depuis?: string
      event_jusqu_a?: string
      event_recherche?: string
    }
  | {
      action: "add_calendar_event"
      event_titre: string
      event_debut: string
      event_fin?: string
      event_journee_entiere?: boolean
      event_lieu?: string
    }
  | {
      action: "update_calendar_event"
      event_id?: string
      event_cible?: string
      event_titre?: string
      event_debut?: string
      event_fin?: string
      event_journee_entiere?: boolean
      event_lieu?: string
    }
  | { action: "delete_calendar_event"; event_id?: string; event_cible?: string }
  | { action: "set_voice"; voice_enabled: boolean }
  // Actions qui sortent de Jarvis pour aller dans une autre application du
  // téléphone (ouvrir une app, préparer un message, composer un numéro,
  // poser une alarme, ouvrir un itinéraire). Leur exécution vit dans son
  // propre module : elle ne touche à aucune donnée de l'app.
  | ActionTelephone
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
  // Le retour n'est pas utilisé ici (le cockpit, lui, s'en sert pour
  // rattacher une erreur au chantier qu'elle vient d'ouvrir).
  addDevItem: (input: DevItemInput) => Promise<unknown>
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
  /** Non-null seulement si la géolocalisation des rappels est activée dans
   * Paramètres : géocode le lieu pour aussi créer une géofence native. */
  geocodePlace: ((place: string) => Promise<{ lat: number; lng: number } | null>) | null
}

export interface PronunciationsApi {
  pronunciations: Pronunciation[]
  addPronunciation: (input: PronunciationInput) => Promise<void>
  deletePronunciation: (id: string) => Promise<void>
}

export interface AgendaApi {
  listerEvenements: (options: {
    depuis?: string
    jusqu_a?: string
    limite?: number
    recherche?: string
  }) => Promise<EvenementAgenda[]>
  creerEvenement: (options: {
    titre: string
    debut: string
    fin?: string | null
    journee_entiere?: boolean
    lieu?: string | null
  }) => Promise<EvenementAgenda | null>
  modifierEvenement: (options: {
    event_id: string
    titre?: string
    debut?: string
    fin?: string | null
    journee_entiere?: boolean
    lieu?: string | null
  }) => Promise<EvenementAgenda | null>
  supprimerEvenement: (eventId: string) => Promise<void>
}

export interface VoiceSettingApi {
  muted: boolean
  setMuted: (muted: boolean) => void
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

const PRIORITY_LABEL: Record<DevPriority, string> = {
  low: "priorité basse",
  normal: "priorité normale",
  high: "priorité haute",
}

/** Une modification sans aucun champ passerait en base sans rien changer, et
 * Jarvis annoncerait quand même "mis à jour" — c'est ce silence qui faisait
 * croire que la commande de priorité à l'oral n'était pas prise en compte.
 * On ne prétend plus avoir fait ce qu'on n'a pas fait. */
function riensAModifier(changes: object | undefined | null): boolean {
  return !changes || Object.keys(changes).length === 0
}


/** "jeudi 4 septembre à 14 h" — lu à voix haute, donc pas de format ISO. */
function direQuand(evenement: EvenementAgenda): string {
  if (!evenement.debut) return "sans date"
  const date = new Date(evenement.debut)
  if (Number.isNaN(date.getTime())) return evenement.debut
  const jour = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  if (evenement.journee_entiere) return `${jour}, toute la journée`
  const heure = date
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .replace(":", " h ")
    .replace(" 00", "")
  return `${jour} à ${heure}`
}

/** Sans accents ni casse : "Rendez-vous Dentiste" doit répondre à "dentiste". */
function sansAccents(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Retrouve l'événement dont parle l'utilisateur. Il ne connaît pas les
 * identifiants Google et n'a aucune raison de les connaître : il dit "le
 * rendez-vous chez le dentiste". On cherche donc dans son agenda à venir.
 *
 * Trois issues, et aucune ne ment : rien trouvé, plusieurs candidats (on lui
 * demande lequel), ou un seul (on agit).
 */
async function retrouverEvenement(
  agenda: AgendaApi,
  cible: string,
): Promise<{ evenement?: EvenementAgenda; reponse?: string }> {
  const mots = sansAccents(cible)
  const evenements = await agenda.listerEvenements({ limite: 50 })
  const candidats = evenements.filter((e) => {
    const titre = sansAccents(e.titre)
    return titre.includes(mots) || mots.includes(titre)
  })

  if (candidats.length === 0) {
    return { reponse: `Je ne trouve pas « ${cible} » dans ton agenda à venir.` }
  }
  if (candidats.length > 1) {
    const liste = candidats
      .slice(0, 4)
      .map((e) => `${e.titre} ${direQuand(e)}`)
      .join(", ")
    return { reponse: `J'en trouve plusieurs : ${liste}. Lequel ?` }
  }
  return { evenement: candidats[0] }
}

/** Exécute une VoiceAction résolue par la Edge Function et renvoie la phrase à énoncer. */
/**
 * Ce dont les actions de section ont besoin. Volontairement réduit à trois
 * champs : supprimer et fusionner une section restent au cockpit, où Raphaël
 * a une confirmation et un bouton Annuler — à la voix il n'aurait ni l'une ni
 * l'autre, et une section supprimée déplace tous ses chantiers.
 */
export interface DevSectionsVoiceApi {
  sections: DevSection[]
  addSection: (nom: string, description?: string | null) => Promise<void>
  /** Rend le nombre de chantiers dont le thème a suivi. */
  renameSection: (id: string, nom: string) => Promise<number>
}

export async function executeVoiceAction(
  action: VoiceAction,
  { tasks, categories, addTask, updateTask, deleteTask }: TasksApi,
  { devItems, addDevItem, updateDevItem, deleteDevItem, archiveDevItem }: DevItemsApi,
  { sections, addSection, renameSection }: DevSectionsVoiceApi,
  { documents, saveTextDocument }: DocumentsApi,
  { contacts, addContact, updateContact, deleteContact }: ContactsApi,
  { placeReminders, addPlaceReminder, deletePlaceReminder, geocodePlace }: PlaceRemindersApi,
  { pronunciations, addPronunciation, deletePronunciation }: PronunciationsApi,
  { muted, setMuted }: VoiceSettingApi,
  { setConfig }: WidgetApi,
  agenda: AgendaApi,
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
        due_time: action.due_date ? (action.due_time ?? null) : null,
        category_id: action.category_id ?? null,
        status: "todo",
      })
      const catName = categoryName(categories, action.category_id)
      const heure = action.due_date && action.due_time ? ` à ${action.due_time.slice(0, 5)}` : ""
      return `Tâche "${action.title}" ajoutée${catName ? ` dans ${catName}` : ""}${heure}.`
    }

    case "update_task": {
      const task = tasks.find((t) => t.id === action.task_id)
      const label = task?.title ?? "la tâche"
      if (riensAModifier(action.changes)) {
        return `Je n'ai pas compris ce qu'il faut changer sur "${label}". Redis-moi ce que je modifie.`
      }
      await updateTask(action.task_id, action.changes)
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
      // « Ça existe déjà », à la voix. Il dicte, ne voit pas le résultat, et
      // reformule en croyant que ça n'a pas pris : le 5 sept. deux phrases à
      // une minute d'intervalle ont créé deux chantiers jumeaux. La
      // comparaison est locale et gratuite ; elle ne pose aucune question —
      // elle dit, et ne recrée pas une redite littérale.
      const doublon = deciderDoublonVocal(action.title, action.notes, devItems)
      if (doublon.verdict === "refuser") return doublon.phrase

      await addDevItem({
        title: action.title,
        notes: action.notes ?? null,
        status: action.status ?? "todo",
        priority: action.priority ?? "normal",
        theme: action.theme ?? null,
      })
      // Le thème est dit à voix haute : c'est le seul moment où Raphaël peut
      // corriger un classement qui part de travers. Et sans la deuxième
      // phrase, il pouvait croire qu'une session allait s'en saisir tout de
      // suite — c'est le même malentendu que corrige le bandeau permanent
      // de la fenêtre d'envoi du cockpit.
      const ajoute = `Chantier "${action.title}" ajouté au cockpit${action.theme ? ` dans ${action.theme}` : ""}. Une session Claude Code le prendra à son prochain démarrage.`
      return doublon.verdict === "creer_en_avertissant"
        ? `${doublon.phrase} ${ajoute}`
        : ajoute
    }

    case "update_dev_item": {
      const item = devItems.find((i) => i.id === action.item_id)
      const label = item?.title ?? "le chantier"
      if (riensAModifier(action.changes)) {
        return `Je n'ai pas compris ce qu'il faut changer sur "${label}". Redis-moi ce que je modifie.`
      }
      await updateDevItem(action.item_id, action.changes)
      // La confirmation nomme ce qui a vraiment changé : sans ça, un
      // "mis à jour" générique ne permet pas de savoir si la priorité
      // demandée a été prise en compte.
      const dits: string[] = []
      if (action.changes.status) dits.push(STATUS_LABEL[action.changes.status])
      if (action.changes.priority) dits.push(PRIORITY_LABEL[action.changes.priority])
      if (action.changes.theme) dits.push(`thème ${action.changes.theme}`)
      if (dits.length > 0) return `"${label}" passé en ${dits.join(", ")}.`
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

    case "add_dev_section": {
      const nom = action.section_nom?.trim()
      if (!nom) return "Je n'ai pas compris le nom de la section."
      // Une section « Entrainement » quand « Entraînement » existe déjà ne doit
      // pas en créer une seconde : la base a le même garde-fou (index unique
      // sur cle_section), on évite juste de lui faire lever une erreur.
      const existante = sections.find((s) => cleTheme(s.nom) === cleTheme(nom))
      if (existante) return `La section "${existante.nom}" existe déjà.`
      await addSection(nom)
      return `Section "${nom}" créée. Elle est vide pour l'instant : tu peux y ranger un chantier en le disant.`
    }

    case "rename_dev_section": {
      const nom = action.section_nom?.trim()
      const section = sections.find((s) => s.id === action.section_id)
      if (!section) return "Je n'ai pas trouvé cette section."
      if (!nom) return `Je n'ai pas compris le nouveau nom de "${section.nom}".`
      // renommer_section renomme la section ET le thème de tous ses chantiers,
      // en une seule fonction SQL : deux écritures séparées laisseraient une
      // section vide à côté de chantiers orphelins.
      const suivis = await renameSection(section.id, nom)
      // Le nombre de chantiers déplacés est dit à voix haute : renommer une
      // section renomme aussi le thème de tout ce qu'elle contient, et c'est
      // le seul moment où Raphaël peut s'apercevoir qu'il visait la mauvaise.
      return suivis > 0
        ? `Section "${section.nom}" renommée en "${nom}". ${suivis} chantier${suivis > 1 ? "s ont" : " a"} suivi.`
        : `Section "${section.nom}" renommée en "${nom}". Elle était vide.`
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
      await addContact({ name: action.name, notes: action.notes ?? null, phone: action.phone ?? null })
      return `Contact "${action.name}" ajouté.`
    }

    case "update_contact": {
      const contact = contacts.find((c) => c.id === action.contact_id)
      const nom = contact?.name ?? "inconnu"
      if (riensAModifier(action.changes)) {
        return `Je n'ai pas compris ce qu'il faut changer sur "${nom}". Redis-moi ce que je modifie.`
      }
      await updateContact(action.contact_id, action.changes)
      return `Contact "${nom}" mis à jour.`
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
      const coords = geocodePlace ? await geocodePlace(action.place) : null
      await addPlaceReminder({
        place: action.place,
        reminder: action.reminder,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      })
      const geoNote = geocodePlace && !coords ? " Je n'ai pas réussi à localiser ce lieu, ça restera basé sur ce que tu me dis." : ""
      return `Compris, je te le rappellerai quand tu parleras de ${action.place}.${geoNote}`
    }

    case "delete_place_reminder": {
      const reminder = placeReminders.find((p) => p.id === action.reminder_id)
      await deletePlaceReminder(action.reminder_id)
      return `Rappel pour "${reminder?.place ?? "ce lieu"}" supprimé.`
    }

    case "list_pronunciations": {
      if (pronunciations.length === 0) return "Je n'ai aucune prononciation particulière en mémoire."
      const items = pronunciations.slice(0, 8).map((p) => `${p.entendu} pour ${p.veut_dire}`)
      return `J'ai retenu ${pronunciations.length} prononciation${pronunciations.length > 1 ? "s" : ""} : ${items.join(", ")}.`
    }

    case "add_pronunciation": {
      await addPronunciation({ entendu: action.entendu, veut_dire: action.veut_dire })
      return `Compris, quand j'entends "${action.entendu}" tu dis "${action.veut_dire}".`
    }

    case "delete_pronunciation": {
      const p = pronunciations.find((x) => x.id === action.pronunciation_id)
      await deletePronunciation(action.pronunciation_id)
      return `Prononciation "${p?.veut_dire ?? "supprimée"}" oubliée.`
    }

    case "list_calendar_events": {
      const evenements = await agenda.listerEvenements({
        depuis: action.event_depuis,
        jusqu_a: action.event_jusqu_a,
        recherche: action.event_recherche,
        limite: 10,
      })
      if (evenements.length === 0) {
        return action.event_depuis || action.event_jusqu_a
          ? "Rien dans ton agenda sur cette période."
          : "Rien de prévu dans ton agenda."
      }
      const liste = evenements
        .slice(0, 6)
        .map((e) => `${e.titre} ${direQuand(e)}`)
        .join(", ")
      return `Tu as ${evenements.length} rendez-vous : ${liste}.`
    }

    case "add_calendar_event": {
      const evenement = await agenda.creerEvenement({
        titre: action.event_titre,
        debut: action.event_debut,
        fin: action.event_fin ?? null,
        journee_entiere: action.event_journee_entiere,
        lieu: action.event_lieu ?? null,
      })
      if (!evenement) return "L'événement n'a pas pu être créé."
      return `C'est noté dans ton agenda : ${evenement.titre} ${direQuand(evenement)}.`
    }

    case "update_calendar_event": {
      let eventId = action.event_id
      if (!eventId) {
        if (!action.event_cible) return "Je ne sais pas quel rendez-vous modifier."
        const { evenement, reponse } = await retrouverEvenement(agenda, action.event_cible)
        if (!evenement) return reponse!
        eventId = evenement.id
      }
      const modifie = await agenda.modifierEvenement({
        event_id: eventId,
        titre: action.event_titre,
        debut: action.event_debut,
        fin: action.event_fin ?? null,
        journee_entiere: action.event_journee_entiere,
        lieu: action.event_lieu ?? null,
      })
      if (!modifie) return "La modification n'a pas abouti."
      return `C'est modifié : ${modifie.titre} ${direQuand(modifie)}.`
    }

    case "delete_calendar_event": {
      let eventId = action.event_id
      let titre = "Le rendez-vous"
      if (!eventId) {
        if (!action.event_cible) return "Je ne sais pas quel rendez-vous annuler."
        const { evenement, reponse } = await retrouverEvenement(agenda, action.event_cible)
        if (!evenement) return reponse!
        eventId = evenement.id
        titre = evenement.titre
      }
      await agenda.supprimerEvenement(eventId)
      return `${titre} est supprimé de ton agenda.`
    }

    case "set_voice": {
      // Écrit avant que la réponse ne soit prononcée : "coupe ta voix" est
      // donc la dernière phrase qu'on n'entend pas, et "remets ta voix" la
      // première qu'on entend à nouveau. La réponse reste affichée dans les
      // deux cas.
      if (action.voice_enabled === muted) setMuted(!action.voice_enabled)
      return action.voice_enabled
        ? "Voix rallumée, tu m'entends à nouveau."
        : "D'accord, je me tais. Je continue de te répondre à l'écrit."
    }

    case "open_app":
    case "send_message":
    case "call_contact":
    case "set_alarm":
    case "navigate_to":
    case "media_control":
    case "set_app_preference":
    case "ask_ai":
      return await executerActionTelephone(action, contacts)

    case "chat":
    case "clarify":
    case "unknown":
      return action.message
  }
}
