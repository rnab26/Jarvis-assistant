import { executerActionTelephone, type ActionTelephone } from "@/lib/actionsTelephoneVocales"
import { garderReponseEcran } from "@/lib/garderReponseEcran"
import { lireDocumentLien } from "@/lib/lireDocumentLien"
import { cleTheme } from "@/lib/themeChantier"
import { deciderDoublonVocal } from "@/lib/doublonChantierALaVoix"
import { ecrireReglage } from "@/lib/reglages"
import { listeReglagesVoix, trouverOptionReglageVoix, trouverReglageVoix } from "@/lib/reglagesVoix"
import {
  arreterEnregistrement,
  demarrerEnregistrement,
  enregistrementEnCours,
  phraseAucunEntrainementEnCours,
  phraseDebutEntrainement,
  phraseFinEntrainement,
  phraseRejeuIntrouvable,
  type EtapeEntrainement,
  type SequenceEntrainement,
} from "@/lib/entrainement"
import { suggererCategorie } from "@/lib/suggestionCategorie"
import {
  clauseSansDate,
  clauseSuggestionCategorie,
  completionExpiree,
  type TacheEnAttente,
} from "@/lib/tacheDateEtCategorie"
import {
  correctionApplicable,
  phraseDeplacement,
  phraseIntrouvable,
  phraseSupposition,
  suppositionDictee,
  type DerniereCreation,
  type Destination,
} from "@/lib/ouVaCetteDictee"
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
  /** « non, mets-le en chantier » : déplacer ce qui vient d'être créé, au
   * lieu d'en créer un second. Reconnue LOCALEMENT (commandeLocale.ts), donc
   * gratuite et instantanée — et elle doit l'être : c'est une reprise dite
   * dans la foulée, pas une nouvelle demande. */
  | { action: "move_last_entry"; vers: Destination }
  /** Complète la tâche créée sans date et/ou avec une catégorie supposée —
   * reconnue LOCALEMENT (commandeLocale.ts), résolue contre la dernière
   * tâche en attente (voir tacheDateEtCategorie.ts). */
  | {
      action: "complete_last_task"
      due_date?: string
      due_time?: string | null
      category_verdict?:
        | { verdict: "accepter" }
        | { verdict: "refuser" }
        | { verdict: "corriger"; category_id: string; category_name: string }
    }
  /** « garde ça », « retiens sa réponse » : reprendre à l'écran la réponse
   * d'une IA relayée, sans le menu Partager d'Android. Reconnue LOCALEMENT
   * (commandeLocale.ts), pour la même raison que `move_last_entry` : lire
   * l'écran est une décision qui vit sur l'appareil (chantier 7d7967b2). */
  | { action: "garder_reponse_ecran" }
  /** Mode entraînement (chantier 86df4f4a), reconnues LOCALEMENT pour la
   * même raison : regarder l'écran et retrouver une séquence déjà montrée
   * sont des décisions de l'appareil. */
  | { action: "start_training" }
  | { action: "stop_training"; nom: string }
  | { action: "replay_training"; sequence_id: string }
  /** « récupère ce document : https://… » : suivre un lien dicté (ou reçu par
   * le partage Android, voir useShareReceiver.ts) et enregistrer le PDF ou
   * l'image qu'il pointe. Reconnue LOCALEMENT (commandeLocale.ts) : une
   * adresse http(s) dans la phrase est sans ambiguïté, pas la peine d'un
   * aller-retour au modèle (chantier 13c39a9b). */
  | { action: "read_link"; url: string }
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
  /** Changer un réglage lui-même (chantier f7137b0c). `setting_cle` et
   * `setting_valeur` viennent de `src/lib/reglagesVoix.ts`, la seule liste
   * fermée de réglages qu'il sait toucher à la voix. */
  | { action: "set_setting"; setting_cle: string; setting_valeur: string }
  /** « Qu'est-ce que tu peux régler toi-même ? » — pas de lecture d'un
   * réglage précis : `_shared/branchements.ts` dit déjà l'état courant à
   * chaque phrase, ça ferait double emploi. */
  | { action: "list_settings" }
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
  addTask: (input: TaskInput) => Promise<{ id: string } | undefined>
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
  /** Le pendant binaire, pour un PDF ou une image récupéré au bout d'un lien
   * (chantier 13c39a9b) — `saveTextDocument` écrirait un fichier texte
   * illisible pour un vrai PDF. */
  saveBinaryDocument: (filename: string, base64: string, contentType: string | null) => Promise<void>
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

/**
 * Les DEUX réglages de `reglagesVoix.ts` dont l'effet réel dépend d'un état
 * React tenu par `JarvisDataContext` (`useWakeWordSetting`,
 * `useGeofenceSetting`), pas seulement du stockage local.
 *
 * POURQUOI ÇA NE PASSE PAS PAR `ecrireReglage` COMME LES AUTRES. Ces deux
 * hooks sont montés UNE FOIS à la racine de l'app et gardent leur propre
 * `enabled` en mémoire ; ils ne relisent le stockage local qu'au montage ou
 * quand les réglages reviennent de la base (`REGLAGES_RESTAURES`) — jamais
 * sur une simple écriture locale (`REGLAGE_MODIFIE`). Écrire directement
 * dans `localStorage` depuis ici persisterait bien la valeur, mais la boucle
 * de veille au mot-clé et les rappels de lieu, qui lisent `enabled` en
 * mémoire, continueraient de tourner sur l'ancienne jusqu'au prochain
 * redémarrage de l'app — Jarvis dirait « c'est fait » sur un réglage qui
 * n'aurait rien changé, exactement le défaut que la règle d'honnêteté du
 * projet interdit. Les deux setters ci-dessous appellent le VRAI hook, qui
 * met à jour son état ET persiste, comme le fait déjà l'écran Paramètres.
 */
export interface ReglagesVoixApi {
  setWakeWordEnabled: (v: boolean) => void
  setGeofenceEnabled: (v: boolean) => void
}

/**
 * Le mode entraînement (chantier 86df4f4a). `sequences` sert à retrouver le
 * nom pour l'annoncer et pour le rejeu ; `rejouer` exécute une séquence pas à
 * pas via `agirSurEcran` — passée en fonction plutôt qu'importée directement
 * ici pour ne pas alourdir ce module, déjà pur pour tout le reste, d'une
 * dépendance au service d'accessibilité.
 */
export interface EntrainementApi {
  sequences: SequenceEntrainement[]
  addSequence: (nom: string, etapes: EtapeEntrainement[]) => Promise<void>
  /** Exécute la séquence pas à pas et rend ce que Jarvis doit dire — soit la
   * confirmation finale, soit où et pourquoi ça s'est arrêté. */
  rejouer: (sequence: SequenceEntrainement) => Promise<string>
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

/**
 * Ce qui vient d'être créé, pour qu'une correction puisse le déplacer.
 *
 * En mémoire du module, et pas en base : la question est « qu'est-ce que je
 * viens de créer, à l'instant », et une valeur relue après un redémarrage
 * répondrait à propos d'hier soir. Même raison que `derniereParole` dans
 * journalEcoute.ts.
 */
let derniereCreation: DerniereCreation | null = null

/** Exportées pour les contrôles : rien d'autre ne doit y toucher. */
export function memoireDerniereCreation(): DerniereCreation | null {
  return derniereCreation
}
export function oublierDerniereCreation() {
  derniereCreation = null
}

/**
 * La tâche qui vient d'être créée sans date et/ou avec une catégorie
 * supposée, tant qu'une réponse peut encore la compléter (chantier
 * eeca8cca). Même raison que `derniereCreation` : en mémoire du module, pas
 * en base — une réponse relue après un redémarrage n'aurait plus de sens.
 */
let derniereTacheEnAttente: TacheEnAttente | null = null

/** Exportée pour que MicButton la joigne au contexte de commandeLocale.ts. */
export function memoireTacheEnAttente(): TacheEnAttente | null {
  return derniereTacheEnAttente
}
export function oublierTacheEnAttente() {
  derniereTacheEnAttente = null
}

/** « vendredi 12 septembre » — lu à voix haute, pas de format ISO. */
function formatDateCourte(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
}

export async function executeVoiceAction(
  action: VoiceAction,
  { tasks, categories, addTask, updateTask, deleteTask }: TasksApi,
  { devItems, addDevItem, updateDevItem, deleteDevItem, archiveDevItem }: DevItemsApi,
  { sections, addSection, renameSection }: DevSectionsVoiceApi,
  { documents, saveTextDocument, saveBinaryDocument }: DocumentsApi,
  { contacts, addContact, updateContact, deleteContact }: ContactsApi,
  { placeReminders, addPlaceReminder, deletePlaceReminder, geocodePlace }: PlaceRemindersApi,
  { pronunciations, addPronunciation, deletePronunciation }: PronunciationsApi,
  { muted, setMuted }: VoiceSettingApi,
  { setConfig }: WidgetApi,
  agenda: AgendaApi,
  { setWakeWordEnabled, setGeofenceEnabled }: ReglagesVoixApi,
  entrainementApi: EntrainementApi,
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
      // LA SUPPOSITION, au moment de la dictée. « R un chantier : … »,
      // « pour Claude Code … » : la commande vocale a compris « une tâche »
      // là où il annonçait une demande aux sessions. Jusqu'ici ça atterrissait
      // dans sa liste de courses et n'en ressortait que des jours plus tard,
      // par la carte de rattrapage de l'onglet Tâches. On range au mieux, on
      // le DIT, et il corrige d'un mot — rien n'attend sa réponse.
      const suppose = suppositionDictee(action.title, action.notes)
      if (suppose) {
        await addDevItem({
          title: suppose.titre,
          notes: action.notes ?? null,
          status: "todo",
          priority: "normal",
          theme: null,
        })
        derniereCreation = { vers: "chantier", titre: suppose.titre, quand: Date.now() }
        // Au passé SEULEMENT ici, une fois l'écriture aboutie.
        return phraseSupposition(suppose.titre, suppose.indice)
      }

      const resultat = await addTask({
        title: action.title,
        notes: action.notes ?? null,
        due_date: action.due_date ?? null,
        due_time: action.due_date ? (action.due_time ?? null) : null,
        category_id: action.category_id ?? null,
        status: "todo",
      })
      derniereCreation = { vers: "tache", titre: action.title, quand: Date.now() }
      const catName = categoryName(categories, action.category_id)
      const heure = action.due_date && action.due_time ? ` à ${action.due_time.slice(0, 5)}` : ""
      let reply = `Tâche "${action.title}" ajoutée${catName ? ` dans ${catName}` : ""}${heure}.`

      // Sans date, ou sans catégorie évidente : on le DIT, sans bloquer la
      // commande (chantier eeca8cca). `resultat` est absent quand rien n'a
      // pu être écrit (pas de session, ou partie dans la file d'attente hors
      // ligne) — il n'y a alors rien à compléter plus tard.
      const sansDate = !action.due_date
      const suggestion =
        !action.category_id && resultat?.id
          ? suggererCategorie(action.title, action.notes, tasks, categories)
          : null
      if (resultat?.id && (sansDate || suggestion)) {
        derniereTacheEnAttente = {
          taskId: resultat.id,
          titre: action.title,
          sansDate,
          suggestion: suggestion
            ? { categoryId: suggestion.categoryId, categoryName: suggestion.categoryName }
            : null,
          quand: Date.now(),
        }
      } else {
        derniereTacheEnAttente = null
      }
      if (sansDate) reply += clauseSansDate()
      if (suggestion) reply += clauseSuggestionCategorie(suggestion.categoryName)
      return reply
    }

    /**
     * Complète la tâche créée juste avant, sans qu'il ait eu à la redire
     * (chantier eeca8cca) — reconnue localement contre `derniereTacheEnAttente`.
     */
    case "complete_last_task": {
      const attente = derniereTacheEnAttente
      if (!attente || completionExpiree(attente, Date.now())) {
        return "Je ne sais plus quelle tâche compléter. Redis-moi ce qu'il faut changer, et sur laquelle."
      }

      if (action.due_date) {
        await updateTask(attente.taskId, {
          due_date: action.due_date,
          due_time: action.due_time ?? null,
        })
        // La catégorie, si elle attendait encore, reste en attente : ce
        // n'est pas parce qu'il vient de donner la date qu'il a répondu à
        // l'autre question.
        derniereTacheEnAttente = attente.suggestion ? { ...attente, sansDate: false } : null
        const heure = action.due_time ? ` à ${action.due_time.slice(0, 5)}` : ""
        return `D'accord, je te rappelle "${attente.titre}" ${formatDateCourte(action.due_date)}${heure}.`
      }

      if (action.category_verdict) {
        const verdict = action.category_verdict
        if (verdict.verdict === "refuser") {
          derniereTacheEnAttente = attente.sansDate ? { ...attente, suggestion: null } : null
          return `D'accord, "${attente.titre}" reste sans catégorie.`
        }
        const categoryId =
          verdict.verdict === "accepter" ? attente.suggestion?.categoryId : verdict.category_id
        const categoryLabel =
          verdict.verdict === "accepter" ? attente.suggestion?.categoryName : verdict.category_name
        if (!categoryId) {
          return "Je ne me souviens plus de la catégorie proposée. Redis-moi laquelle."
        }
        await updateTask(attente.taskId, { category_id: categoryId })
        derniereTacheEnAttente = attente.sansDate ? { ...attente, suggestion: null } : null
        return `C'est noté, "${attente.titre}" est dans ${categoryLabel}.`
      }

      return "Je n'ai pas compris ce qu'il faut compléter."
    }

    /**
     * « Non, mets-le en chantier » — on DÉPLACE, on ne recrée pas.
     *
     * Le 5 sept., deux phrases à une minute d'intervalle ont créé deux
     * chantiers jumeaux parce qu'il reformulait en croyant que ça n'avait pas
     * pris. Ici c'est pire : la ligne d'origine resterait dans la mauvaise
     * liste, invisible, pendant que la nouvelle apparaît ailleurs.
     */
    case "move_last_entry": {
      const derniere = derniereCreation
      if (!correctionApplicable(derniere, action.vers, Date.now())) {
        return "Je ne vois pas ce que tu veux déplacer. Redis-moi ce que je crée, et où."
      }
      const titre = derniere!.titre

      if (action.vers === "chantier") {
        const tache = tasks.find((t) => t.title === titre)
        if (!tache) return phraseIntrouvable(titre)
        await addDevItem({ title: titre, notes: tache.notes ?? null, status: "todo", priority: "normal", theme: null })
        // L'ordre compte : on n'efface l'ancienne qu'une fois la nouvelle
        // écrite. L'inverse perdrait sa dictée si la seconde écriture échoue.
        await deleteTask(tache.id)
      } else {
        const chantier = devItems.find((d) => d.title === titre)
        if (!chantier) return phraseIntrouvable(titre)
        await addTask({
          title: titre,
          notes: chantier.notes ?? null,
          due_date: null,
          due_time: null,
          category_id: null,
          status: "todo",
        })
        await deleteDevItem(chantier.id)
      }
      derniereCreation = { vers: action.vers, titre, quand: Date.now() }
      return phraseDeplacement(titre, action.vers)
    }

    case "garder_reponse_ecran":
      return await garderReponseEcran(saveTextDocument)

    case "start_training":
      demarrerEnregistrement()
      return phraseDebutEntrainement()

    case "stop_training": {
      if (!enregistrementEnCours()) return phraseAucunEntrainementEnCours()
      const etapes = arreterEnregistrement()
      if (etapes.length > 0) await entrainementApi.addSequence(action.nom, etapes)
      return phraseFinEntrainement(action.nom, etapes.length)
    }

    case "replay_training": {
      const sequence = entrainementApi.sequences.find((s) => s.id === action.sequence_id)
      if (!sequence) return phraseRejeuIntrouvable()
      return await entrainementApi.rejouer(sequence)
    }

    case "read_link":
      return (await lireDocumentLien(action.url, saveBinaryDocument)).message

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
      derniereCreation = { vers: "chantier", titre: action.title, quand: Date.now() }
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

    case "list_settings":
      return `Je peux régler moi-même : ${listeReglagesVoix()}. Pour le reste, ça se règle depuis Paramètres.`

    case "set_setting": {
      // Un `setting_cle` ou `setting_valeur` inventé ou mal compris ne doit
      // JAMAIS écrire n'importe quoi : on refuse plutôt que de deviner, la
      // même règle que pour un clic à l'écran ou une application introuvable.
      const reglage = trouverReglageVoix(action.setting_cle)
      if (!reglage) {
        return "Je ne sais pas régler ça moi-même. Dis-moi « qu'est-ce que tu peux régler ? » pour la liste, ou passe par Paramètres."
      }
      const option = trouverOptionReglageVoix(action.setting_cle, action.setting_valeur)
      if (!option) {
        return `Pour ${reglage.nom}, je ne connais que : ${reglage.options.map((o) => o.dit).join(", ")}.`
      }
      // Ces deux-là passent par le VRAI hook (React + persistance), pas par
      // une écriture locale toute seule — voir ReglagesVoixApi.
      if (reglage.cle === "jarvis_wake_word_enabled") setWakeWordEnabled(option.stocke === "1")
      else if (reglage.cle === "jarvis_geofence_enabled") setGeofenceEnabled(option.stocke === "1")
      else ecrireReglage(reglage.cle, option.stocke)
      return `C'est fait : ${reglage.nom} est maintenant ${option.dit}. Tu peux aussi le voir depuis ${reglage.ou}.`
    }

    case "open_app":
    case "send_message":
    case "call_contact":
    case "set_alarm":
    case "navigate_to":
    case "media_control":
    case "set_app_preference":
    case "ask_ai":
    case "screen_action":
    case "block_screen_app":
    case "read_notifications":
      return await executerActionTelephone(action, contacts)

    case "chat":
    case "clarify":
    case "unknown":
      return action.message
  }
}
