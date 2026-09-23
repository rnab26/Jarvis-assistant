import {
  executerActionTelephone,
  transmettreFichier,
  type ActionTelephone,
} from "@/lib/actionsTelephoneVocales"
import { garderReponseEcran } from "@/lib/garderReponseEcran"
import { lireDocumentLien } from "@/lib/lireDocumentLien"
import { repondreDecisionVoix } from "@/lib/repondreDecisionVoix"
import { phraseHorsLigne } from "@/lib/fileEnAttente"
import type { Brouillon, MessageComplet, MessageResume, Recu } from "@/lib/googleGmail"
import { estDernierMessage, nomExpediteur } from "@/lib/gmailVoix"
import { cleTheme } from "@/lib/themeChantier"
import { deciderDoublonTache, deciderDoublonVocal } from "@/lib/doublonChantierALaVoix"
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
import { suggererSection } from "@/lib/suggestionTheme"
import { suggererTitreChantier } from "@/lib/titreChantier"
import {
  clauseSuggestionChantier,
  completionExpiree as completionExpireeChantier,
  type ChantierEnAttente,
} from "@/lib/chantierEnAttente"
import {
  correctionApplicable,
  phraseDeplacement,
  phraseIntrouvable,
  phraseSupposition,
  suppositionDictee,
  type DerniereCreation,
  type Destination,
} from "@/lib/ouVaCetteDictee"
import { titreLisible } from "@/lib/titreTache"
import { SECTIONS_PARAMETRES } from "@/lib/sectionsParametres"
import { momentLocal } from "@/lib/notifications/plan"
import { phraseLectureNote, phraseListeNotes } from "@/lib/notesVocales"
import { phraseMiseAJourChantier, phraseMiseAJourTache } from "@/lib/phraseMiseAJour"
import { proposerAnnulation } from "@/lib/annulation"
import type { MessageProgramme } from "@/lib/messagesProgrammes"
import { champsVerifies, nomDit, phraseProgrammation, verifierDestinataire } from "@/lib/destinataireProgramme"
import { lireRepertoire } from "@/lib/repertoire"
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
  Note,
  NoteInput,
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
  /** Valide, corrige ou refuse la suggestion de section et/ou de titre faite
   * juste après la création d'un chantier (chantiers 9369ad72 et 1be8988d) —
   * reconnue LOCALEMENT (commandeLocale.ts), résolue contre le dernier
   * chantier en attente (voir chantierEnAttente.ts). */
  | {
      action: "complete_last_chantier"
      verdict:
        | { verdict: "accepter" }
        | { verdict: "refuser" }
        | { verdict: "corriger_section"; section_nom: string }
        | { verdict: "illisible" }
    }
  /** « garde ça », « retiens sa réponse » : reprendre à l'écran la réponse
   * d'une IA relayée, sans le menu Partager d'Android. Reconnue LOCALEMENT
   * (commandeLocale.ts), pour la même raison que `move_last_entry` : lire
   * l'écran est une décision qui vit sur l'appareil (chantier 7d7967b2). */
  | { action: "garder_reponse_ecran" }
  /** « emmène-moi dans les notifications » : naviguer vers une section de
   * Paramètres. Reconnue LOCALEMENT (commandeLocale.ts), résolue par
   * `resoudreCibleParametres` (sectionsParametres.ts) — `cible` est déjà
   * la clé d'UNE section, jamais une phrase brute (chantier aac9a0dd). */
  | { action: "navigate_settings"; cible: string }
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
  /**
   * Répondre à voix haute, en phrase libre, à un point de « Ce qui attend ta
   * décision » (chantier 6044d8ad). Résolue par le SERVEUR (voice-command,
   * via `_shared/ceQuiLAttend.ts`), comme item_id pour update_dev_item :
   * `decision_id` est l'identifiant `dev_log` du point visé, jamais deviné
   * côté appareil — sa règle de sûreté (plusieurs points en attente et une
   * phrase ambiguë → clarify, jamais cette action) vit dans la consigne du
   * serveur, au même endroit que la liste qui porte les identifiants.
   */
  | { action: "repondre_decision"; decision_id: string; decision_reponse: string }
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
  // Gmail : lire, chercher, préparer une réponse SANS l'envoyer, et n'envoyer
  // qu'au tour suivant, validé à la voix (googleGmail.ts, google-gmail/).
  | { action: "list_emails"; mail_recherche?: string; mail_limite?: number }
  | { action: "read_email"; mail_cible: string }
  | { action: "prepare_email_reply"; mail_cible: string; mail_texte: string }
  | { action: "send_email" }
  | {
      action: "find_receipts"
      mail_recherche?: string
      mail_jours?: number
      mail_limite?: number
    }
  /** Transmettre un reçu déjà retrouvé (find_receipts/read_email) au contact
   * qu'il désigne, via le partage Android (chantier 4dabe586) — ce que
   * find_receipts ne pouvait QUE lister jusque-là. Mêmes champs destinataire
   * que send_message : contact_id si connu, sinon contact_name (résolu dans
   * le répertoire du téléphone), jamais un numéro deviné. */
  | {
      action: "transmettre_recu"
      mail_cible: string
      message_channel?: "whatsapp" | "whatsapp_business" | "sms"
      contact_id?: string
      contact_name?: string
      phone_number?: string
    }
  | { action: "set_voice"; voice_enabled: boolean }
  /** Changer un réglage lui-même (chantier f7137b0c). `setting_cle` et
   * `setting_valeur` viennent de `src/lib/reglagesVoix.ts`, la seule liste
   * fermée de réglages qu'il sait toucher à la voix. */
  | { action: "set_setting"; setting_cle: string; setting_valeur: string }
  /** « Qu'est-ce que tu peux régler toi-même ? » — pas de lecture d'un
   * réglage précis : `_shared/branchements.ts` dit déjà l'état courant à
   * chaque phrase, ça ferait double emploi. */
  | { action: "list_settings" }
  /**
   * Programmer l'envoi d'un message pour PLUS TARD — chantier ed32cbcc.
   * À LA DIFFÉRENCE de `send_message` (dans `ActionTelephone`, ci-dessous),
   * ceci n'ouvre RIEN tout de suite : ça écrit une intention dans
   * `messages_programmes` (src/lib/messagesProgrammes.ts). Décision de
   * Raphaël du 3 sept. 2026 : rien ne part sans qu'il valide — à l'heure
   * dite, Jarvis annonce le message à voix haute et attend sa réponse
   * (envoyer / modifier / reprogrammer / annuler), il ne l'envoie jamais
   * tout seul.
   */
  | {
      action: "schedule_message"
      message_channel?: "whatsapp" | "whatsapp_business" | "sms"
      message_text: string
      contact_id?: string
      contact_name?: string
      phone_number?: string
      /** Les deux obligatoires ici (contrairement à add_task) : un message
       * "programmé" sans date NI heure ne veut rien dire. */
      due_date: string
      due_time: string
    }
  // Actions qui sortent de Jarvis pour aller dans une autre application du
  // téléphone (ouvrir une app, préparer un message, composer un numéro,
  // poser une alarme, ouvrir un itinéraire). Leur exécution vit dans son
  // propre module : elle ne touche à aucune donnée de l'app.
  | ActionTelephone
  | { action: "chat"; message: string }
  | { action: "clarify"; message: string }
  /** Ses notes personnelles (onglet Notes), chantier 447560d1. Reconnues
   * LOCALEMENT (commandeLocale.ts → notesVocales.ts) : la cible est déjà
   * résolue en id, jamais une phrase brute. */
  | { action: "add_note"; title: string; content: string }
  | { action: "list_notes"; recherche?: string | null }
  | { action: "read_note"; note_id: string }
  | { action: "append_note"; note_id: string; ajout: string }
  | { action: "delete_note"; note_id: string }
  | { action: "unknown"; message: string }

export interface TasksApi {
  tasks: Task[]
  categories: Category[]
  /** `enAttente` : notée dans la file hors ligne, PAS enregistrée. Voir
   * useTasks.addTask — c'est cette distinction qui empêche Jarvis d'annoncer
   * « ajoutée » à voix haute pour une tâche qui n'est pas en base. */
  addTask: (input: TaskInput) => Promise<{ id: string; enAttente: boolean } | undefined>
  updateTask: (id: string, input: Partial<TaskInput>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
}

export interface DevItemsApi {
  devItems: DevItem[]
  // `undefined` = pas encore en base (échec réel, ou noté dans la file hors
  // ligne — useDevItems.ts ne distingue pas les deux, comme pour add_task).
  // L'id du chantier créé sert à la fois à ErreursJarvis.tsx (rattacher une
  // erreur au chantier qu'elle vient d'ouvrir) et à la suggestion de
  // section/titre en attente ci-dessous (chantiers 9369ad72, 1be8988d).
  addDevItem: (input: DevItemInput) => Promise<DevItem | undefined>
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

/**
 * L'envoi PROGRAMMÉ d'un message — chantier ed32cbcc.
 *
 * `programmerMessage` est la seule que le MODÈLE déclenche (schedule_message) :
 * il n'en lit ni n'en modifie jamais. Les trois autres servent à
 * `messageAnnonce.ts` / MicButton, côté appareil uniquement, pour annoncer à
 * l'heure dite et réagir à sa réponse (annuler / marquer envoyé) — jamais au
 * modèle, qui ne voit ni ne doit voir la liste des messages en attente.
 */
export interface MessagesProgrammesApi {
  programmerMessage: (entree: {
    destinataire: string
    texte: string
    envoyer_a: string
    canal?: "whatsapp" | "sms" | null
    contact_id?: string | null
    contact_nom?: string | null
    telephone?: string | null
  }) => Promise<MessageProgramme | null>
  messagesAAnnoncer: () => Promise<MessageProgramme[]>
  marquerAnnonce: (id: string) => Promise<void>
  annulerMessage: (id: string) => Promise<void>
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

export interface GmailApi {
  listerMessages: (options?: { recherche?: string; limite?: number }) => Promise<MessageResume[]>
  chercherRecus: (options?: {
    depuis_jours?: number
    limite?: number
    recherche?: string
  }) => Promise<Recu[]>
  lireMessage: (messageId: string, options?: { marquer_lu?: boolean }) => Promise<MessageComplet | null>
  /** Le contenu d'une pièce jointe (8 Mo max, refusé au-delà par le serveur)
   * — chantier 4dabe586, transmettre un reçu retrouvé. */
  recupererPieceJointe: (
    messageId: string,
    pieceJointeId: string,
  ) => Promise<{ taille: number | null; contenu_base64: string } | null>
  preparerReponse: (options: { texte: string; message_id?: string }) => Promise<Brouillon | null>
  // Une réponse dictée n'attache jamais de fichier : le vrai envoyerMessage de
  // googleGmail.ts accepte des pièces jointes EN PLUS, l'appelant fournit un
  // tableau vide pour rester compatible sans avoir à porter ce cas ici.
  envoyerMessage: (
    brouillon: Brouillon,
    confirme: boolean,
  ) => Promise<{ id: string; fil_id: string | null } | null>
  /**
   * Le dernier brouillon préparé, en attente d'un « envoie ».
   *
   * `resolveTranscript` envoie une phrase SEULE au serveur, sans le tour
   * précédent : le modèle ne peut donc jamais savoir qu'un mail vient
   * d'être préparé. La confirmation nue est reconnue AVANT d'arriver ici
   * (confirmationEnvoiMail.ts, comme confirmationEnvoi.ts pour WhatsApp),
   * avec cet état que seul l'appareil tient.
   */
  brouillonEnAttente: Brouillon | null
  retenirBrouillon: (brouillon: Brouillon | null) => void
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

/**
 * Retrouve le message dont parle l'utilisateur, comme retrouverEvenement pour
 * l'agenda. `mail_cible` est du langage courant ("le mail de Yoni", "le
 * dernier", "la facture d'électricité") : la recherche Gmail nue (sans
 * qualificatif in:/is:) porte déjà sur l'expéditeur, l'objet et le corps, donc
 * un terme libre suffit la plupart du temps.
 */
async function retrouverMessage(
  gmail: GmailApi,
  cible: string,
): Promise<{ message?: MessageResume; reponse?: string }> {
  const dernier = estDernierMessage(cible)
  // Chaîne vide et non `undefined` : le serveur ne retombe sur "in:inbox
  // is:unread" que si `recherche` est absente, et "le dernier" doit pouvoir
  // désigner un message déjà lu ou hors de la boîte de réception.
  const messages = await gmail.listerMessages({
    recherche: dernier ? "" : cible.trim(),
    limite: dernier ? 1 : 5,
  })
  if (messages.length === 0) {
    return { reponse: `Je ne trouve pas de message correspondant à « ${cible} ».` }
  }
  if (!dernier && messages.length > 1) {
    const liste = messages
      .slice(0, 4)
      .map((m) => `${nomExpediteur(m.de)} — ${m.objet ?? "(sans objet)"}`)
      .join(", ")
    return { reponse: `J'en trouve plusieurs : ${liste}. Lequel ?` }
  }
  return { message: messages[0] }
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
 * Naviguer vers une section de Paramètres (chantier aac9a0dd). Le format
 * d'URL (`/settings?section=<cible>`) est une affaire de routeur, pas de ce
 * module : c'est MicButton.tsx qui le sait, via `useNavigate`.
 */
/** Les notes personnelles (chantier 447560d1) — même hook que l'onglet
 * Notes, pas un second chemin d'écriture. */
export interface NotesApi {
  notes: Note[]
  addNote: (input: NoteInput) => Promise<Note | undefined>
  updateNote: (id: string, input: Partial<NoteInput>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
}

export interface NavigationApi {
  navigateVersParametres: (cible: string) => void
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

/**
 * Le chantier qui vient d'être créé sans section dite explicitement et/ou
 * avec un titre qui garde une amorce de dictée, tant qu'une réponse peut
 * encore le compléter (chantiers 9369ad72 et 1be8988d). Même raison que
 * `derniereTacheEnAttente` : en mémoire du module, pas en base.
 */
let derniereChantierEnAttente: ChantierEnAttente | null = null

/** Exportée pour que MicButton la joigne au contexte de commandeLocale.ts. */
export function memoireChantierEnAttente(): ChantierEnAttente | null {
  return derniereChantierEnAttente
}
export function oublierChantierEnAttente() {
  derniereChantierEnAttente = null
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
  gmail: GmailApi,
  { navigateVersParametres }: NavigationApi,
  { programmerMessage }: MessagesProgrammesApi,
  { notes, addNote, updateNote, deleteNote }: NotesApi,
): Promise<string> {
  switch (action.action) {
    case "add_note": {
      // Même honnêteté que pour les tâches : « ajoutée » seulement si la base
      // l'a vraiment écrite. `addNote` rend undefined sur un échec déjà
      // signalé par son toast.
      const cree = await addNote({ title: action.title, content: action.content })
      if (!cree) return `Je n'ai pas pu enregistrer la note « ${action.title} ».`
      return `Note « ${action.title} » enregistrée, dans l'onglet Notes.`
    }

    case "list_notes":
      return phraseListeNotes(notes, action.recherche ?? null)

    case "read_note": {
      const note = notes.find((n) => n.id === action.note_id)
      if (!note) return "Je ne retrouve plus cette note. Redis-moi laquelle."
      return phraseLectureNote(note)
    }

    case "append_note": {
      const note = notes.find((n) => n.id === action.note_id)
      if (!note) return "Je ne retrouve plus cette note. Redis-moi laquelle."
      const contenu = note.content.trim() ? `${note.content.trimEnd()}\n${action.ajout}` : action.ajout
      await updateNote(note.id, { content: contenu })
      return `Ajouté à la note « ${note.title} ».`
    }

    case "delete_note": {
      const note = notes.find((n) => n.id === action.note_id)
      if (!note) return "Je ne retrouve plus cette note. Redis-moi laquelle."
      await deleteNote(note.id)
      // Une note n'a pas d'archive : le « Annuler » du cockpit, huit
      // secondes, la recrée à l'identique (titre et texte) si c'était la
      // mauvaise — à la voix, il n'y a pas de fenêtre de confirmation.
      proposerAnnulation(`Note « ${note.title} » supprimée.`, [note], async ([n]) => {
        await addNote({ title: n.title, content: n.content })
      })
      return `Note « ${note.title} » supprimée. Tu as quelques secondes pour appuyer sur Annuler.`
    }

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
      // LE FILET SUR LE TITRE, sa décision du 15 sept. : « Les deux : le
      // modèle écrit, la règle rattrape ». La consigne du serveur demande déjà
      // un titre court ; elle a quand même produit « Un rappel comme quoi je
      // dois rappeler dan marciano matin » ce jour-là.
      //
      // Calculé UNE FOIS, en tête du cas, et c'est `titre` qui sert partout en
      // dessous — la supposition, le doublon, l'écriture et la phrase dite à
      // voix haute. Nettoyer plus bas en ferait cohabiter deux titres : celui
      // écrit en base et celui qu'il entend.
      const titre = titreLisible(action.title)
      // LA SUPPOSITION, au moment de la dictée. « R un chantier : … »,
      // « pour Claude Code … » : la commande vocale a compris « une tâche »
      // là où il annonçait une demande aux sessions. Jusqu'ici ça atterrissait
      // dans sa liste de courses et n'en ressortait que des jours plus tard,
      // par la carte de rattrapage de l'onglet Tâches. On range au mieux, on
      // le DIT, et il corrige d'un mot — rien n'attend sa réponse.
      const suppose = suppositionDictee(titre, action.notes)
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

      // « Ça existe déjà », côté tâches — trouvé le 15 sept. 2026 : en Live,
      // deux appels rapprochés de add_task pour la même demande avaient créé
      // deux tâches au titre identique, sans qu'aucun mot n'en avertisse.
      // Même garde-fou, même seuils que pour les chantiers (deciderDoublonVocal).
      const doublonTache = deciderDoublonTache(titre, action.notes, tasks)
      if (doublonTache.verdict === "refuser") return doublonTache.phrase

      const resultat = await addTask({
        title: titre,
        notes: action.notes ?? null,
        due_date: action.due_date ?? null,
        due_time: action.due_date ? (action.due_time ?? null) : null,
        category_id: action.category_id ?? null,
        status: "todo",
      })
      derniereCreation = { vers: "tache", titre: titre, quand: Date.now(), id: resultat?.id }

      // NOTÉE, PAS ENREGISTRÉE — et on le DIT (chantier 9476c7a0).
      //
      // Avant, une dictée partie dans la file d'attente hors ligne recevait
      // quand même « Tâche "…" ajoutée. » : un passé accompli, à voix haute,
      // pour quelque chose qui n'est pas en base. C'est précisément ce que
      // `_shared/honnetete.ts` interdit depuis le 6 sept., et le cas qui
      // motive toute la file d'attente est « il dicte en conduisant, dans un
      // tunnel » — donc le moment où il ne regarde PAS l'écran. La carte et
      // le toast disaient déjà la vérité ; seule la VOIX mentait.
      //
      // Rendre la phrase ici plutôt que d'ajouter un `parler()` ailleurs :
      // c'est MicButton qui lit la réponse en mode classique, et le modèle
      // qui la répète en mode Live (la consigne d'honnêteté lui dit de
      // reprendre le retour de l'outil TEL QUEL). Une seule correction, les
      // deux moteurs, et aucun risque de dire la phrase deux fois.
      if (resultat?.enAttente) {
        derniereTacheEnAttente = null
        return phraseHorsLigne(titre)
      }

      const catName = categoryName(categories, action.category_id)
      const heure = action.due_date && action.due_time ? ` à ${action.due_time.slice(0, 5)}` : ""
      let reply = `Tâche "${titre}" ajoutée${catName ? ` dans ${catName}` : ""}${heure}.`
      if (doublonTache.verdict === "creer_en_avertissant") reply = `${doublonTache.phrase} ${reply}`

      // Sans date, ou sans catégorie évidente : on le DIT, sans bloquer la
      // commande (chantier eeca8cca). `resultat` est absent quand rien n'a
      // pu être écrit (pas de session, ou partie dans la file d'attente hors
      // ligne) — il n'y a alors rien à compléter plus tard.
      const sansDate = !action.due_date
      const suggestion =
        !action.category_id && resultat?.id
          ? suggererCategorie(titre, action.notes, tasks, categories)
          : null
      if (resultat?.id && (sansDate || suggestion)) {
        derniereTacheEnAttente = {
          taskId: resultat.id,
          titre: titre,
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

    case "navigate_settings": {
      navigateVersParametres(action.cible)
      const section = SECTIONS_PARAMETRES[action.cible as keyof typeof SECTIONS_PARAMETRES]
      return section ? `Je t'emmène dans ${section.titre}.` : "C'est ouvert."
    }

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
      // Trouvé le 15 sept. 2026 : un task_id qui ne correspond à AUCUNE
      // tâche connue passait quand même — la confirmation disait « "la
      // tâche" mise à jour » (le label générique de repli), et l'écriture
      // partait dans le vide sans que rien ne le signale. Comme
      // screen_action, qui REFUSE plutôt que de cliquer au hasard : une
      // référence qu'on ne peut pas retrouver n'exécute rien.
      if (!task) return "Je ne retrouve pas cette tâche. Redis-moi laquelle, avec un détail de plus."
      if (riensAModifier(action.changes)) {
        return `Je n'ai pas compris ce qu'il faut changer sur "${task.title}". Redis-moi ce que je modifie.`
      }
      await updateTask(action.task_id, action.changes)
      // La NOUVELLE valeur, dite à voix haute — jamais « "<ancien titre>"
      // mise à jour », qui lui a fait redire sept fois la même modification
      // le 22 sept. (chantier 8b8b6d36, voir phraseMiseAJour.ts).
      return phraseMiseAJourTache(task, action.changes, (id) => categoryName(categories, id))
    }

    case "delete_task": {
      const task = tasks.find((t) => t.id === action.task_id)
      if (!task) return "Je ne retrouve pas cette tâche. Redis-moi laquelle, avec un détail de plus."
      await deleteTask(action.task_id)
      return `"${task.title}" supprimée.`
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

      const cree = await addDevItem({
        title: action.title,
        notes: action.notes ?? null,
        status: action.status ?? "todo",
        priority: action.priority ?? "normal",
        theme: action.theme ?? null,
      })
      derniereCreation = { vers: "chantier", titre: action.title, quand: Date.now() }

      // NOTÉ, PAS ENREGISTRÉ — même honnêteté que pour les tâches (chantier
      // 9476c7a0), trouvée en touchant ce code pour les chantiers 9369ad72 et
      // 1be8988d : `addDevItem` ne rend rien de distinct entre un échec réel
      // et une écriture partie dans la file hors ligne, donc les deux se
      // traitent pareil — jamais « ajouté » à voix haute pour quelque chose
      // qui n'est pas encore en base, et rien à proposer sur un chantier qui
      // n'a pas d'id.
      if (!cree) {
        derniereChantierEnAttente = null
        return phraseHorsLigne(action.title)
      }

      // AUCUNE SUGGESTION QUAND IL A DÉJÀ DIT LE THÈME. Réponse de Raphaël au
      // chantier 9369ad72, 17 sept. 2026 : « Proposer, je valide » — même
      // règle que suggestionTheme.ts pour la saisie manuelle du cockpit. Le
      // serveur classe encore un chantier quand la consigne le lui demande
      // explicitement ; côté appareil, on ne propose donc que ce qu'il n'a
      // PAS dit lui-même.
      const sectionSuggestion = action.theme
        ? null
        : suggererSection(`${action.title} ${action.notes ?? ""}`, devItems, sections)
      // Même règle pour le titre (chantier 1be8988d) : un titre qui garde une
      // amorce de dictée (« Comme quoi… ») se PROPOSE, il ne se réécrit
      // jamais tout seul — à la différence de titreLisible() pour les tâches,
      // appliquée en silence par une décision différente de Raphaël.
      const titreSuggere = suggererTitreChantier(action.title)

      derniereChantierEnAttente =
        sectionSuggestion || titreSuggere
          ? {
              itemId: cree.id,
              titre: action.title,
              sectionSuggeree: sectionSuggestion?.nom ?? null,
              titreSuggere,
              quand: Date.now(),
            }
          : null

      let reply = `Chantier "${action.title}" ajouté au cockpit${action.theme ? ` dans ${action.theme}` : ""}. Une session Claude Code le prendra à son prochain démarrage.`
      if (doublon.verdict === "creer_en_avertissant") reply = `${doublon.phrase} ${reply}`
      reply += clauseSuggestionChantier({
        sectionSuggeree: sectionSuggestion?.nom ?? null,
        titreSuggere,
      })
      return reply
    }

    /**
     * Valide, corrige ou refuse la suggestion de section et/ou de titre
     * faite juste après la création d'un chantier (chantiers 9369ad72 et
     * 1be8988d) — reconnue localement contre `derniereChantierEnAttente`.
     */
    case "complete_last_chantier": {
      const attente = derniereChantierEnAttente
      if (!attente || completionExpireeChantier(attente, Date.now())) {
        return "Je ne sais plus quel chantier compléter. Redis-moi lequel, et ce qu'il faut changer."
      }

      const verdict = action.verdict
      if (verdict.verdict === "refuser") {
        derniereChantierEnAttente = null
        return `D'accord, "${attente.titre}" reste comme il est.`
      }
      if (verdict.verdict === "illisible") {
        const noms = sections.map((s) => s.nom).join(", ")
        return noms
          ? `Dans quelle section je range "${attente.titre}" ? (${noms})`
          : `Dans quelle section je range "${attente.titre}" ?`
      }

      // La correction d'une section ne vaut QUE pour la section : il a
      // corrigé une chose précise, pas validé tout le reste en silence.
      const changes: Partial<DevItemInput> = {}
      const dits: string[] = []
      if (verdict.verdict === "corriger_section") {
        changes.theme = verdict.section_nom
        dits.push(`rangé dans ${verdict.section_nom}`)
      } else if (attente.sectionSuggeree) {
        changes.theme = attente.sectionSuggeree
        dits.push(`rangé dans ${attente.sectionSuggeree}`)
      }
      if (verdict.verdict === "accepter" && attente.titreSuggere) {
        changes.title = attente.titreSuggere
        dits.push(`renommé "${attente.titreSuggere}"`)
      }

      derniereChantierEnAttente = null
      if (Object.keys(changes).length === 0) return `D'accord, "${attente.titre}" reste comme il est.`
      await updateDevItem(attente.itemId, changes)
      return `C'est noté, "${attente.titre}" est ${dits.join(" et ")}.`
    }

    case "update_dev_item": {
      const item = devItems.find((i) => i.id === action.item_id)
      // Même garde-fou que update_task/delete_task ci-dessus, et pour la
      // même raison : un item_id introuvable ne doit exécuter aucune
      // écriture, jamais retomber sur un label générique qui masque un
      // no-op.
      if (!item) return "Je ne retrouve pas ce chantier. Redis-moi lequel, avec un détail de plus."
      if (riensAModifier(action.changes)) {
        return `Je n'ai pas compris ce qu'il faut changer sur "${item.title}". Redis-moi ce que je modifie.`
      }
      await updateDevItem(action.item_id, action.changes)
      // La confirmation nomme ce qui a vraiment changé, AVEC la nouvelle
      // valeur — le titre compris (chantier 8b8b6d36, même défaut que pour
      // les tâches).
      return phraseMiseAJourChantier(item, action.changes)
    }

    case "delete_dev_item": {
      const item = devItems.find((i) => i.id === action.item_id)
      if (!item) return "Je ne retrouve pas ce chantier. Redis-moi lequel, avec un détail de plus."
      await deleteDevItem(action.item_id)
      return `"${item.title}" supprimé du cockpit.`
    }

    case "archive_dev_item": {
      const item = devItems.find((i) => i.id === action.item_id)
      if (!item) return "Je ne retrouve pas ce chantier. Redis-moi lequel, avec un détail de plus."
      await archiveDevItem(action.item_id)
      return `"${item.title}" marqué fait et archivé.`
    }

    case "repondre_decision":
      return await repondreDecisionVoix(action.decision_id, action.decision_reponse)

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
      if (!reminder) return "Je ne retrouve pas ce rappel de lieu. Redis-moi lequel."
      await deletePlaceReminder(action.reminder_id)
      return `Rappel pour "${reminder.place}" supprimé.`
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
      if (!p) return "Je ne retrouve pas cette prononciation. Redis-moi laquelle."
      await deletePronunciation(action.pronunciation_id)
      return `Prononciation "${p.veut_dire}" oubliée.`
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

    case "list_emails": {
      const messages = await gmail.listerMessages({
        recherche: action.mail_recherche,
        limite: action.mail_limite ?? 10,
      })
      if (messages.length === 0) return "Aucun message trouvé."
      const liste = messages
        .slice(0, 6)
        .map((m) => `${nomExpediteur(m.de)} — ${m.objet ?? "(sans objet)"}`)
        .join(", ")
      return `Tu as ${messages.length} message${messages.length > 1 ? "s" : ""} : ${liste}.`
    }

    case "read_email": {
      const resolu = await retrouverMessage(gmail, action.mail_cible)
      if (!resolu.message) return resolu.reponse!
      const complet = await gmail.lireMessage(resolu.message.id)
      if (!complet) return "Je n'ai pas réussi à ouvrir ce message."
      const entete = `${complet.objet ? `${complet.objet}, ` : ""}de ${nomExpediteur(complet.de)}`
      return `${entete} : ${complet.corps.trim() || "il est vide."}`
    }

    case "prepare_email_reply": {
      // PRÉPARE sans envoyer, comme send_message pour WhatsApp : un mail
      // part vers l'extérieur en son nom, rien ne s'envoie sans qu'il l'ait
      // entendu et validé (send_email, au tour suivant).
      const resolu = await retrouverMessage(gmail, action.mail_cible)
      if (!resolu.message) return resolu.reponse!
      const brouillon = await gmail.preparerReponse({
        texte: action.mail_texte,
        message_id: resolu.message.id,
      })
      if (!brouillon) return "Je n'ai pas réussi à préparer la réponse."
      gmail.retenirBrouillon(brouillon)
      return `Voilà ce que je m'apprête à répondre à ${nomExpediteur(resolu.message.de)} : « ${brouillon.corps} ». Dis-moi si je l'envoie.`
    }

    case "send_email": {
      // Le garde-fou principal est côté serveur (confirme: true exigé avant
      // même de lire le jeton Google) : ici, pas de brouillon en mémoire veut
      // dire qu'on n'a rien à confirmer, jamais qu'on suppose lequel.
      const brouillon = gmail.brouillonEnAttente
      if (!brouillon) {
        return "Je n'ai pas de mail préparé à envoyer. Dicte-moi d'abord la réponse."
      }
      const envoye = await gmail.envoyerMessage(brouillon, true)
      gmail.retenirBrouillon(null)
      if (!envoye) return "L'envoi n'a pas abouti."
      return `E-mail envoyé à ${brouillon.destinataires}.`
    }

    case "find_receipts": {
      const recus = await gmail.chercherRecus({
        recherche: action.mail_recherche,
        depuis_jours: action.mail_jours,
        limite: action.mail_limite,
      })
      if (recus.length === 0) return "Je n'ai trouvé aucun reçu correspondant."
      const liste = recus
        .slice(0, 6)
        .map((r) => `${nomExpediteur(r.de)}${r.date ? ` (${r.date})` : ""}`)
        .join(", ")
      return `J'ai trouvé ${recus.length} reçu${recus.length > 1 ? "s" : ""} : ${liste}. Dis-moi à qui le transmettre.`
    }

    case "transmettre_recu": {
      // Même résolution que read_email/prepare_email_reply : "le dernier",
      // "la facture d'électricité"... — une seule source de vérité pour
      // désigner un message.
      const resolu = await retrouverMessage(gmail, action.mail_cible)
      if (!resolu.message) return resolu.reponse!
      const complet = await gmail.lireMessage(resolu.message.id)
      if (!complet) return "Je n'ai pas réussi à rouvrir ce message."
      if (complet.pieces_jointes.length === 0) {
        // Beaucoup de reçus arrivent par un LIEN plutôt qu'en pièce jointe
        // (google-gmail/lien.ts, chantier 13c39a9b) — on ne le devine pas
        // ici, on dit ce qui manque plutôt que d'échouer en silence.
        return "Ce message n'a pas de pièce jointe que je peux transmettre. S'il contient un lien vers le reçu, dis-moi de le récupérer d'abord."
      }
      // Plusieurs pièces jointes sur un même reçu, ça arrive (le PDF et son
      // aperçu) : on prend la première et on la NOMME, pour qu'une commande
      // mal comprise se repère tout de suite — jamais un choix silencieux.
      const piece = complet.pieces_jointes[0]
      const contenu = await gmail.recupererPieceJointe(resolu.message.id, piece.id)
      if (!contenu) return "Je n'ai pas réussi à récupérer cette pièce jointe."
      return await transmettreFichier(
        { nom: piece.nom, typeContenu: piece.type, base64: contenu.contenu_base64 },
        contacts,
        {
          contact_id: action.contact_id,
          contact_name: action.contact_name,
          phone_number: action.phone_number,
        },
        action.message_channel,
      )
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

    case "schedule_message": {
      // Décision de Raphaël du 3 sept. 2026 : rien ne part sans qu'il
      // valide. Contrairement à send_message, on n'ouvre RIEN maintenant —
      // on écrit une intention, que le téléphone annoncera à voix haute à
      // l'heure dite (src/lib/messagesProgrammes.ts).
      //
      // LE DESTINATAIRE EST VÉRIFIÉ ICI, pas à l'heure dite (chantier
      // a122a936, destinataireProgramme.ts) : le 22 sept., « Harry locataire
      // bureau » est arrivé ici SANS nom et a été enregistré « ce contact »,
      // avec un « C'est noté » qui laissait croire que tout allait bien.
      const contactConnu = contacts.find((c) => c.id === action.contact_id)
      const dit = nomDit({
        nomContactConnu: contactConnu?.name,
        contact_name: action.contact_name,
        contact_id: action.contact_id,
        phone_number: action.phone_number,
      })
      // Sans texte, il n'y a rien à programmer : le 22 sept. à 10h45, une
      // demande de MODIFICATION arrivée ici sans message_text finissait sur
      // « Cannot read properties of undefined (reading 'trim') ».
      const texte = typeof action.message_text === "string" ? action.message_text.trim() : ""
      if (!texte) {
        return "Qu'est-ce que je dois écrire dans ce message ? Pour modifier un message déjà programmé, passe par l'onglet Programmé."
      }
      // `?? ""` : le modèle peut omettre l'un des deux (c'est ce qui levait
      // l'exception du 22 sept., dans momentLocal) — ça se dit, ça ne plante pas.
      const moment = momentLocal(action.due_date ?? "", action.due_time ?? "")
      if (!moment) {
        return "Je n'ai pas compris la date ou l'heure d'envoi, dis-le-moi autrement."
      }
      if (moment.getTime() <= Date.now()) {
        return "Cette heure est déjà passée, dis-moi un autre moment."
      }
      // "whatsapp_business" n'est pas un canal distinct dans messages_programmes
      // (juste 'whatsapp'/'sms'/null) : le choix entre les deux WhatsApp se
      // tranche à l'heure dite, comme pour send_message.
      const canal: "whatsapp" | "sms" | null =
        action.message_channel === "sms" ? "sms" : action.message_channel ? "whatsapp" : null
      const verification = verifierDestinataire(dit, dit ? await lireRepertoire() : { etat: "indisponible" })
      try {
        await programmerMessage({
          // Ce qu'il a DIT, ou rien : jamais un « ce contact » inventé.
          destinataire: dit ?? "",
          texte,
          envoyer_a: moment.toISOString(),
          canal,
          contact_id: contactConnu?.id ?? null,
          ...champsVerifies(verification),
        })
      } catch {
        return "Je n'ai pas réussi à programmer ce message, réessaie."
      }
      const heure = action.due_time ? ` à ${action.due_time.slice(0, 5)}` : ""
      return phraseProgrammation(dit, verification, `${formatDateCourte(action.due_date)}${heure}`)
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
