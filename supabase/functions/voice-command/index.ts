import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { memoriser, rappelerSouvenirs } from "./memoire.ts"
import { appelerGemini, phrasePourEchec } from "../_shared/gemini.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/**
 * Champs qu'une action de modification attend dans "changes" — et qui
 * existent AUSSI comme paramètres de premier niveau parce que les actions
 * de création (add_task, add_dev_item, add_contact) les utilisent.
 *
 * C'est précisément ce doublon qui cassait la modification de priorité à
 * l'oral : "monte ce chantier en priorité haute" produisait
 * { action: "update_dev_item", item_id: "...", priority: "high" } — le
 * champ était rempli, mais au premier niveau, donc "changes" restait vide,
 * l'app faisait une mise à jour sans aucun champ, et Jarvis annonçait
 * quand même "mis à jour". Le modèle est maintenant guidé par le schéma,
 * et on replie ici ce qui atterrit au mauvais endroit : une seule source
 * de vérité côté app, "changes".
 */
const CHAMPS_MODIFIABLES: Record<string, string[]> = {
  update_task: ["title", "notes", "status", "category_id", "due_date", "due_time"],
  update_dev_item: ["title", "notes", "status", "priority", "theme"],
  update_contact: ["name", "notes", "phone"],
}

/** Une suite de chiffres qui ressemble à un numéro dicté : « 07 88 99 00 11 ». */
const NUMERO_DICTE = /(?:\+?\d[\d .-]{7,}\d)/

function normaliserAction(
  input: Record<string, unknown>,
  contexte: { idsContacts: Set<string>; transcript: string },
): Record<string, unknown> {
  // Deux redressements nés du passage à un petit modèle (Flash-Lite), qui se
  // trompe de champ là où un grand ne se trompait pas. Déterministes et sans
  // risque : on ne devine rien, on déplace ce qui est identifiable.
  //
  // 1. send_message / call_contact : l'identifiant d'un contact connu posé
  //    dans phone_number au lieu de contact_id.
  if (
    (input.action === "send_message" || input.action === "call_contact") &&
    !input.contact_id &&
    typeof input.phone_number === "string" &&
    contexte.idsContacts.has(input.phone_number)
  ) {
    input = { ...input, contact_id: input.phone_number, phone_number: undefined }
  }

  const champs = CHAMPS_MODIFIABLES[String(input.action)]
  if (!champs) return input

  const changes: Record<string, unknown> = {
    ...(typeof input.changes === "object" && input.changes !== null
      ? (input.changes as Record<string, unknown>)
      : {}),
  }
  const normalise = { ...input }
  for (const champ of champs) {
    if (!(champ in normalise)) continue
    // Ce qui est déjà dans "changes" fait foi : c'est la place prévue.
    if (!(champ in changes)) changes[champ] = normalise[champ]
    delete normalise[champ]
  }
  // Les tâches n'ont que deux statuts en base ("todo"/"done") ; les chantiers
  // en ont trois. Le modèle, qui voit un seul champ "status", renvoie parfois
  // "in_progress" sur une tâche : la base refusait la ligne et l'utilisateur
  // n'avait qu'un message d'erreur générique. Une tâche "en cours" reste une
  // tâche à faire.
  if (input.action === "update_task" && changes.status === "in_progress") {
    changes.status = "todo"
  }

  // 2. update_contact : un numéro dicté dans la phrase, mais absent de
  //    "changes" — le modèle a recopié le nom et les notes à la place.
  if (input.action === "update_contact" && !changes.phone) {
    const numero = contexte.transcript.match(NUMERO_DICTE)?.[0]
    if (numero) changes.phone = numero.trim()
  }

  normalise.changes = changes
  return normalise
}

/**
 * Le schéma d'UNE action. Le modèle en renvoie une liste : une phrase dictée
 * contient souvent plusieurs demandes ("ajoute une tâche pour le plombier et
 * rappelle-moi d'appeler Yoni"), et n'en traiter qu'une en perdait l'autre
 * sans le dire.
 */
const ACTION_SCHEMA = {
  type: "object" as const,
  properties: {
    action: {
      type: "string",
      enum: [
        "list_tasks",
        "add_task",
        "update_task",
        "delete_task",
        "list_dev_items",
        "add_dev_item",
        "update_dev_item",
        "delete_dev_item",
        "archive_dev_item",
        "list_documents",
        "save_document",
        "configure_widget",
        "list_contacts",
        "add_contact",
        "update_contact",
        "delete_contact",
        "list_place_reminders",
        "add_place_reminder",
        "delete_place_reminder",
        "list_pronunciations",
        "add_pronunciation",
        "delete_pronunciation",
        "list_calendar_events",
        "add_calendar_event",
        "update_calendar_event",
        "delete_calendar_event",
        "set_voice",
        "open_app",
        "send_message",
        "call_contact",
        "set_alarm",
        "navigate_to",
        "media_control",
        "chat",
        "clarify",
        "unknown",
      ],
      description:
        "Tâches perso/clients : list_tasks, add_task, update_task (task_id + changes), delete_task (task_id). Chantiers de dev Jarvis (cockpit) : list_dev_items, add_dev_item, update_dev_item (item_id + changes), delete_dev_item (item_id), archive_dev_item (item_id) — marque le chantier comme fait et l'archive, utilisé quand l'utilisateur dit qu'un chantier est terminé/traité et veut l'archiver — utilisés quand l'utilisateur parle explicitement de 'chantier', de développement de Jarvis, du cockpit, ou d'une fonctionnalité à coder pour l'assistant lui-même. Documents : list_documents, save_document (filename + content) — utilisé quand l'utilisateur demande explicitement d'enregistrer/noter/sauvegarder un document ou un texte. configure_widget (max_tasks, urgent_only, category_id) — utilisé quand l'utilisateur parle du widget d'écran d'accueil (ex: 'montre-moi 5 tâches sur le widget', 'affiche que les urgentes sur le widget', 'widget catégorie perso'). Contacts : list_contacts, add_contact (name + notes + phone), update_contact (contact_id + changes), delete_contact (contact_id) — utilisé quand l'utilisateur présente quelqu'un, donne une consigne à son sujet, ou dicte son numéro de téléphone (ex: 'Dylan c'est le client de Melissa', 'pour Yoni toujours confirmer avant d'envoyer un message'). Rappels de lieu : list_place_reminders, add_place_reminder (place + reminder), delete_place_reminder (reminder_id) — utilisé quand l'utilisateur demande de lui rappeler quelque chose la prochaine fois qu'il parle d'un lieu précis (ex: 'quand je parle du chantier Dan, rappelle-moi de commander les carreaux'). Prononciations : list_pronunciations, add_pronunciation (entendu + veut_dire), delete_pronunciation (pronunciation_id) — utilisé quand l'utilisateur corrige la façon dont la dictée a écrit un mot ou un nom (ex: 'ce n'est pas Avirail, c'est Avihail, le h est muet', 'quand je dis Melissa tu écris Mélissa'). set_voice (voice_enabled) — utilisé quand l'utilisateur demande de couper ou de remettre la voix de Jarvis ('arrête de parler', 'coupe ta voix', 'réponds-moi juste à l'écrit', 'remets ta voix', 'reparle'). voice_enabled=false pour se taire, true pour reparler. Ne PAS l'utiliser pour un simple 'tais-toi' qui interrompt une phrase en cours : là il ne s'agit que d'arrêter la lecture, pas de couper la voix pour de bon. Agenda Google : list_calendar_events (event_depuis / event_jusqu_a / event_recherche), add_calendar_event (event_titre + event_debut), update_calendar_event (event_cible + le ou les champs event_* qui changent), delete_calendar_event (event_cible) — utilisé quand l'utilisateur parle de son agenda, de ses rendez-vous, de son planning, de sa journée ou de sa semaine (ex: 'qu'est-ce que j'ai demain ?', 'ajoute un rendez-vous avec Yoni mardi à 14h', 'décale mon rendez-vous de jeudi à 16h', 'annule le rendez-vous chez le dentiste'). À ne pas confondre avec add_task : une tâche est quelque chose à faire, un événement d'agenda occupe un créneau. Actions dans les autres applications du téléphone (uniquement quand il demande explicitement d'agir dans une app) : open_app (app_name, et music_query pour lancer une lecture — 'mets du Brassens sur Spotify', 'ouvre WhatsApp', 'lance la musique') ; send_message (message_channel 'whatsapp' ou 'sms', message_text, et contact_id si le destinataire est un contact connu — 'envoie un message à Dylan pour lui dire que je passe demain') ; call_contact (contact_id ou phone_number — 'appelle Yoni') ; set_alarm (alarm_time en HH:MM pour une heure précise, OU alarm_duration_seconds pour un minuteur, plus alarm_label — 'réveille-moi à 7h', 'minuteur de 10 minutes') ; navigate_to (destination — 'emmène-moi au chantier de la villa Dan') ; media_control (media_command 'play_pause', 'lecture', 'pause', 'suivant', 'precedent' ou 'stop') — pilote ce qui joue DÉJÀ, quelle que soit l'application : 'mets pause', 'reprends', 'chanson suivante', 'coupe la musique'. À distinguer d'open_app avec music_query, qui sert à LANCER quelque chose de précis. Ces actions PRÉPARENT le geste, elles ne l'accomplissent pas : le message s'affiche prêt à partir et l'appel est composé, mais c'est l'utilisateur qui appuie. Dis-le naturellement dans ta réponse, sans t'excuser. N'utilise JAMAIS ces actions pour quelque chose qui se fait dans Jarvis lui-même : une tâche reste add_task, un rappel reste add_place_reminder, un rendez-vous reste add_calendar_event. chat: toute question ou discussion qui ne concerne ni les tâches ni le cockpit ni les documents ni le widget ni les contacts ni les rappels de lieu (culture générale, conseil, actualité, calcul, etc.) — répondre directement et utilement via `message`. clarify: commande ambiguë (plusieurs éléments possibles, ou infos manquantes) — poser une question via `message`. unknown: audio incompréhensible/inaudible, pas une question hors-sujet (ça, c'est 'chat').",
    },
    title: {
      type: "string",
      description:
        "Titre court (add_task ou add_dev_item), quelques mots, synthétisé à partir de la phrase dictée par l'utilisateur — jamais la phrase brute complète si elle est longue.",
    },
    name: {
      type: "string",
      description: "add_contact uniquement : nom de la personne.",
    },
    phone: {
      type: "string",
      description: "add_contact uniquement : numéro de téléphone, si l'utilisateur l'a dicté (\"le numéro de Yoni c'est le 06 12 34 56 78\"). Garder les chiffres tels qu'il les a dits. Pour renseigner le numéro d'un contact déjà enregistré, utiliser update_contact avec { \"phone\": ... } dans \"changes\".",
    },
    place: {
      type: "string",
      description: "add_place_reminder uniquement : le lieu (ou mot-clé) qui doit déclencher le rappel quand l'utilisateur le mentionne en parlant à Jarvis.",
    },
    reminder: {
      type: "string",
      description: "add_place_reminder uniquement : ce que Jarvis doit rappeler à l'utilisateur, reformulé comme une phrase courte à dire.",
    },
    event_id: {
      type: "string",
      description: "Agenda : identifiant Google de l'événement, quand il est déjà connu. En pratique tu ne l'as jamais — utilise event_cible à la place.",
    },
    event_cible: {
      type: "string",
      description: "update_calendar_event / delete_calendar_event : de quel rendez-vous il s'agit, tel que l'utilisateur le désigne (quelques mots : 'dentiste', 'rendez-vous avec Yoni'). L'app le retrouvera dans l'agenda.",
    },
    event_titre: {
      type: "string",
      description: "Agenda : intitulé de l'événement, court (ex: 'Rendez-vous Yoni'). Pour update_calendar_event, ne le renseigne que si l'utilisateur change le titre.",
    },
    event_debut: {
      type: "string",
      description: "Agenda : début au format ISO local sans fuseau, YYYY-MM-DDTHH:MM:SS (ex: 2026-09-04T14:00:00). Pour un événement sur la journée entière, la date seule suffit. Déduis-le de 'demain', 'mardi prochain', 'ce soir' à partir de la date et de l'heure courantes fournies.",
    },
    event_fin: {
      type: "string",
      description: "Agenda : fin au même format que event_debut. Omets-le si l'utilisateur ne dit pas combien de temps ça dure — l'app comptera une heure.",
    },
    event_journee_entiere: {
      type: "boolean",
      description: "Agenda : true quand l'événement occupe toute la journée sans heure précise (ex: 'note mon anniversaire le 12').",
    },
    event_lieu: {
      type: "string",
      description: "Agenda : lieu de l'événement, si l'utilisateur le précise.",
    },
    event_recherche: {
      type: "string",
      description: "list_calendar_events : mot-clé quand l'utilisateur cherche un rendez-vous précis plutôt que son planning ('quand est-ce que je vois Yoni ?').",
    },
    event_depuis: {
      type: "string",
      description: "list_calendar_events : début de la période au format ISO. Pour 'demain', mets le début de la journée de demain. Absent = à partir de maintenant.",
    },
    event_jusqu_a: {
      type: "string",
      description: "list_calendar_events : fin de la période au format ISO. Pour 'demain', mets la fin de la journée de demain ; pour 'cette semaine', dimanche soir.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "add_task ou add_dev_item : si la phrase dictée par l'utilisateur contient des détails au-delà du simple titre (contexte, raison, précisions), reformule-les ici en note complète. null si le titre résume déjà tout. add_contact : la relation/le contexte et toute consigne donnée par l'utilisateur à son sujet (ex: 'client de Melissa, chantier villa Dan'), reformulés proprement. null si rien de plus que le nom.",
    },
    category_id: {
      type: ["string", "null"],
      description: "add_task : id de catégorie existant correspondant le mieux, ou null si aucune/pas de correspondance claire. configure_widget : id de catégorie pour filtrer le widget, ou null pour toutes les catégories — n'inclure que si l'utilisateur a précisé une catégorie.",
    },
    max_tasks: {
      type: "number",
      description: "configure_widget uniquement : nombre de tâches à afficher sur le widget (1 à 5), n'inclure que si précisé.",
    },
    urgent_only: {
      type: "boolean",
      description: "configure_widget uniquement : true pour n'afficher que les tâches en retard/dues aujourd'hui, n'inclure que si précisé.",
    },
    due_date: {
      type: ["string", "null"],
      description: "add_task uniquement : échéance au format YYYY-MM-DD, déduite si l'utilisateur dit 'demain', 'vendredi', etc. null si non précisée.",
    },
    due_time: {
      type: ["string", "null"],
      description: "add_task uniquement : heure du rappel au format HH:MM (24h), déduite si l'utilisateur dit 'à 14h', 'ce midi', 'à 9h30', etc. null si aucune heure n'est précisée (seule la date compte alors).",
    },
    priority: {
      type: "string",
      enum: ["low", "normal", "high"],
      description: "add_dev_item UNIQUEMENT : priorité du chantier à créer, 'normal' par défaut si non précisée. Pour MODIFIER la priorité d'un chantier existant, ne pas utiliser ce champ : mettre { \"priority\": ... } dans \"changes\" avec action=update_dev_item.",
    },
    status: {
      type: "string",
      enum: ["todo", "in_progress", "done"],
      description: "add_dev_item UNIQUEMENT : statut initial du chantier à créer, 'todo' par défaut. Pour MODIFIER le statut d'un chantier existant, ne pas utiliser ce champ : mettre { \"status\": ... } dans \"changes\" avec action=update_dev_item.",
    },
    theme: {
      type: ["string", "null"],
      description: "add_dev_item : sujet auquel rattacher le chantier. Reprends TEL QUEL un thème déjà utilisé dès qu'il convient — un thème presque identique en crée un doublon et éparpille le sujet. N'en invente un nouveau que si aucun ne va, en quelques mots. Aussi utilisable dans \"changes\" avec update_dev_item pour reclasser un chantier existant.",
    },
    task_id: {
      type: "string",
      description: "id de la tâche existante ciblée (update_task, delete_task), résolu depuis la liste de tâches fournie.",
    },
    item_id: {
      type: "string",
      description: "id du chantier existant ciblé (update_dev_item, delete_dev_item, archive_dev_item), résolu depuis la liste de chantiers fournie.",
    },
    contact_id: {
      type: "string",
      description: "id du contact existant ciblé (update_contact, delete_contact), résolu depuis la liste de contacts fournie (par nom approchant).",
    },
    voice_enabled: {
      type: "boolean",
      description: "set_voice uniquement : true pour que Jarvis reparle à voix haute, false pour qu'il ne réponde plus qu'à l'écrit.",
    },
    entendu: {
      type: "string",
      description: "add_pronunciation uniquement : le mot tel que la dictée vocale l'a écrit à tort, exactement comme il apparaît dans le transcript.",
    },
    veut_dire: {
      type: "string",
      description: "add_pronunciation uniquement : le mot réellement dit par l'utilisateur, correctement orthographié.",
    },
    pronunciation_id: {
      type: "string",
      description: "id de la prononciation existante ciblée (delete_pronunciation), résolu depuis la liste fournie.",
    },
    reminder_id: {
      type: "string",
      description: "id du rappel de lieu existant ciblé (delete_place_reminder), résolu depuis la liste de rappels de lieu fournie.",
    },
    changes: {
      type: "object",
      description: "OBLIGATOIRE et NON VIDE pour update_task, update_dev_item et update_contact : les champs à modifier, et eux seuls. update_task : title, notes, status ('todo'/'done'), category_id, due_date, due_time. update_dev_item : title, notes, status ('todo'/'in_progress'/'done'), priority ('low'/'normal'/'high'), theme. update_contact : name, notes. Exemples : { \"priority\": \"high\" } pour monter un chantier en priorité, { \"status\": \"in_progress\" } pour le passer en cours.",
      properties: {
        title: { type: "string" },
        notes: { type: ["string", "null"] },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "string", enum: ["low", "normal", "high"] },
        theme: { type: ["string", "null"] },
        category_id: { type: ["string", "null"] },
        due_date: { type: ["string", "null"] },
        due_time: { type: ["string", "null"] },
        name: { type: "string" },
      },
    },
    app_name: {
      type: "string",
      description: "open_app uniquement : le nom de l'application tel que l'utilisateur l'a dit (\"Spotify\", \"WhatsApp\", \"YouTube\"). L'app est retrouvée ensuite parmi celles réellement installées, la casse et les accents n'ont pas d'importance. Absent si l'utilisateur veut juste lancer de la musique sans préciser où.",
    },
    music_query: {
      type: "string",
      description: "open_app uniquement : ce qu'il faut jouer (\"du Brassens\", \"l'album Rumours\", \"ma playlist du matin\"). Ne le renseigner que si l'utilisateur demande d'écouter quelque chose — sinon on se contente d'ouvrir l'application.",
    },
    message_channel: {
      type: "string",
      enum: ["whatsapp", "sms"],
      description: "send_message uniquement : par où passe le message. WhatsApp par défaut si l'utilisateur ne précise pas, SMS s'il dit \"SMS\", \"texto\" ou \"message classique\".",
    },
    message_text: {
      type: "string",
      description: "send_message uniquement : le message rédigé proprement, prêt à être envoyé. L'utilisateur dicte une intention (\"dis-lui que je passe demain matin\"), pas un texte : rédige-le à sa place, à la première personne, court et naturel.",
    },
    phone_number: {
      type: "string",
      description: "send_message ou call_contact : le numéro, uniquement si l'utilisateur l'a dicté à voix haute. Sinon utiliser contact_id.",
    },
    alarm_time: {
      type: "string",
      description: "set_alarm : heure de l'alarme au format HH:MM (24h). Pour un minuteur, laisser vide et utiliser alarm_duration_seconds.",
    },
    alarm_duration_seconds: {
      type: "number",
      description: "set_alarm : durée d'un minuteur en secondes (\"minuteur de 10 minutes\" = 600). Pour une heure précise, utiliser alarm_time à la place.",
    },
    alarm_label: {
      type: "string",
      description: "set_alarm : à quoi sert l'alarme, en quelques mots (\"les pâtes\", \"rendez-vous dentiste\"). null si l'utilisateur n'a rien précisé.",
    },
    destination: {
      type: "string",
      description: "navigate_to uniquement : l'adresse ou le lieu, tel qu'une application de cartes peut le chercher.",
    },
    media_command: {
      type: "string",
      enum: ["play_pause", "lecture", "pause", "suivant", "precedent", "stop"],
      description: "media_control uniquement : ce qu'il faut faire de la musique en cours. 'play_pause' quand l'utilisateur dit juste 'pause' ou 'reprends' sans qu'on sache l'état, 'suivant'/'precedent' pour changer de morceau, 'stop' pour couper.",
    },
    filter_category_id: { type: "string", description: "list_tasks uniquement : filtre par catégorie." },
    filter_status: {
      type: "string",
      description: "Filtre par statut. Pour list_tasks : 'todo' ou 'done'. Pour list_dev_items : 'todo', 'in_progress' ou 'done'.",
    },
    message: {
      type: "string",
      description: "Phrase à dire à l'utilisateur : question de clarification (clarify) ou réponse (unknown).",
    },
    filename: {
      type: "string",
      description: "save_document uniquement : nom court du document (sans extension, '.txt' est ajouté automatiquement), synthétisé à partir de la demande.",
    },
    content: {
      type: "string",
      description: "save_document uniquement : contenu complet du document, reformulé proprement à partir de ce que l'utilisateur a dicté.",
    },
  },
  required: ["action"],
}

const VOICE_ACTION_TOOL = {
  name: "resolve_voice_command",
  description:
    "Résout une commande vocale en français en une ou plusieurs actions structurées. Sept domaines : les tâches perso/clients (avec catégories), les chantiers de développement de Jarvis lui-même (cockpit, avec statut à 3 valeurs + priorité, pas de catégories), les documents texte enregistrés par l'utilisateur ou dictés à Jarvis, la config du widget d'écran d'accueil, les contacts (qui est qui, et les consignes associées), les rappels liés à un lieu (déclenchés par la conversation), et la discussion généraliste (n'importe quel sujet, comme un assistant conversationnel classique).",
  input_schema: {
    type: "object" as const,
    properties: {
      actions: {
        type: "array",
        description:
          "Les actions à exécuter, dans l'ordre où l'utilisateur les a dites. UNE SEULE dans la plupart des cas. PLUSIEURS quand une même phrase contient plusieurs demandes distinctes : \"ajoute une tâche pour le plombier et marque la facture comme payée\" en donne deux, \"note que Dylan est le client de Melissa et rappelle-moi de l'appeler demain\" aussi. Ne découpe jamais une demande unique en plusieurs actions, et n'invente pas d'action que l'utilisateur n'a pas demandée. Si une demande dépend du résultat d'une autre (modifier une tâche qu'on vient à peine de créer dans la même phrase), n'en fais qu'une seule action et traite le reste dans son contenu. Si l'ensemble est ambigu, renvoie une seule action clarify.",
        items: ACTION_SCHEMA,
        minItems: 1,
      },
    },
    required: ["actions"],
  },
}

/**
 * Tout ce qui ne change JAMAIS d'un appel à l'autre : le rôle, les sept
 * domaines, et les règles de traduction d'une phrase en action.
 *
 * Sorti du gestionnaire et placé AVANT les données : avec le schéma de
 * l'outil, ce bloc fait près de 26 000 caractères renvoyés à chaque phrase,
 * identiques à l'octet près. Un préfixe stable est ce que les modèles
 * mettent en cache d'eux-mêmes (Gemini le fait implicitement sur Flash) ;
 * et sur l'offre gratuite, où la limite se compte en requêtes et en jetons
 * par minute, moins de jetons par phrase veut dire plus de phrases avant
 * de buter sur la limite. N'y insère jamais une donnée variable.
 */
/** Voir le commentaire sur `modele` dans l'appel, plus bas. */
const MODELE_PAR_DEFAUT = "gemini-3.5-flash-lite"

/** Essayés dans l'ordre si la minute du premier est saturée : le quota gratuit
 * est compté PAR MODÈLE, donc basculer rend la main tout de suite là où
 * attendre coûte plusieurs secondes. */
const SECOURS = ["gemini-flash-lite-latest", "gemini-3.1-flash-lite"]

const CONSIGNES = `Tu es l'assistant vocal de Jarvis, qui gère sept domaines pour l'utilisateur :
1. Ses tâches personnelles/clients, organisées par catégorie.
2. Le cockpit de développement de Jarvis lui-même (les chantiers/fonctionnalités à coder pour l'assistant) — utilise ce domaine quand l'utilisateur parle explicitement de "chantier", de développer/coder Jarvis, du "cockpit", ou d'une fonctionnalité de l'app elle-même.
3. Ses documents texte — utilise ce domaine quand l'utilisateur demande explicitement d'enregistrer, noter ou sauvegarder un document/texte (ex: "enregistre un document avec...", "note ça dans un fichier...").
4. La config du widget d'écran d'accueil Android (nombre de tâches affichées, urgentes uniquement, filtre catégorie) — utilise ce domaine quand l'utilisateur parle explicitement du widget.
5. Ses contacts : qui est qui, et ce qu'il attend pour chacun — utilise ce domaine quand l'utilisateur présente quelqu'un ou donne une consigne à son sujet (ex: "Dylan c'est le client de Melissa", "retiens que pour Yoni il faut toujours confirmer avant d'envoyer un message").
6. Ses rappels liés à un lieu — utilise ce domaine quand l'utilisateur demande explicitement d'être rappelé de quelque chose la prochaine fois qu'il mentionnera un lieu précis en lui parlant (ex: "quand je parle du chantier Dan, rappelle-moi de commander les carreaux"). Ce n'est PAS de la géolocalisation : le rappel se déclenche uniquement quand l'utilisateur reparle du lieu à voix haute.
7. La discussion généraliste : toute question ou échange qui ne concerne ni les tâches, ni le cockpit, ni les documents, ni le widget, ni les contacts, ni les rappels de lieu — culture générale, conseil, actualité, calcul, définition, etc. Réponds comme le ferait un assistant conversationnel normal (Claude), avec tes connaissances, sans te limiter aux tâches/chantiers.


AVANT TOUT : la phrase vient d'une dictée vocale. Si un mot du transcript correspond à une correction déjà apprise (liste "Corrections de transcription", plus bas ; champ "entendu"), lis-le comme le mot corrigé ("veut_dire") pour toute la suite du raisonnement — c'est ce que l'utilisateur a réellement dit. N'en parle pas, corrige silencieusement.
Quand l'utilisateur te reprend sur un mot mal transcrit ("ce n'est pas X, c'est Y", "quand je dis Y tu écris X"), enregistre-le avec add_pronunciation : "entendu" est la forme fausse telle qu'elle sort de la dictée, "veut_dire" la bonne. Fais-le en plus de la demande d'origine s'il y en avait une, et n'enregistre rien si la correction porte sur le fond plutôt que sur l'orthographe d'un mot.

Traduis la commande vocale de l'utilisateur en un appel à l'outil resolve_voice_command.
Pour update_task/delete_task, résous task_id depuis la liste de tâches fournie (par titre approchant). Pour update_dev_item/delete_dev_item, résous item_id depuis la liste de chantiers fournie. Pour update_contact/delete_contact, résous contact_id depuis la liste de contacts fournie (par nom approchant). Pour delete_place_reminder, résous reminder_id depuis la liste de rappels de lieu fournie (par lieu approchant). Si plusieurs éléments correspondent ou qu'aucun ne correspond clairement, utilise action="clarify" avec une question précise.
Pour update_task/update_dev_item/update_contact, tout ce qui change va dans "changes", jamais dans les champs de premier niveau : "passe ce chantier en priorité haute" donne changes={"priority":"high"}, "marque-le en cours" donne changes={"status":"in_progress"}. Ne renvoie jamais une action de modification avec un "changes" vide.
Pour add_task/add_dev_item : si l'utilisateur dicte une phrase longue avec des détails (contexte, raison, précisions), ne mets pas toute la phrase dans "title" — synthétise un titre court (quelques mots) et reformule le reste dans "notes". Si la phrase est déjà courte et ne contient rien de plus que le titre, laisse "notes" à null.
Pour add_task : si l'utilisateur précise une heure ("à 14h", "ce midi", "à 9h30 demain"), déduis-la dans "due_time" (HH:MM) en plus de "due_date" — jamais d'heure sans date. Sans heure précisée, laisse "due_time" à null.
Pour save_document : synthétise un nom de fichier court dans "filename", et reformule proprement tout ce que l'utilisateur a dicté comme contenu dans "content".
Pour configure_widget : ne renvoie que les champs (max_tasks, urgent_only, category_id) que l'utilisateur a explicitement mentionnés — laisse les autres absents plutôt que de les redéfinir à une valeur par défaut.
Pour add_contact : si le contact existe déjà dans la liste fournie (même nom ou très proche), utilise update_contact à la place pour ajouter l'information à ses notes existantes plutôt que de créer un doublon.
Pour add_dev_item : classe le chantier dans un thème. Reprends un thème existant à l'identique dès qu'il convient — c'est ce qui permet de traiter un sujet entier d'un coup au lieu de le rafistoler chantier par chantier. N'en crée un nouveau que si aucun ne colle.
Pour add_place_reminder : "place" doit être un mot-clé court et probable à être redit tel quel (nom de lieu, de chantier, de client) — pas une phrase entière. "reminder" est la phrase que Jarvis doit dire, reformulée proprement.
Une seule phrase peut contenir PLUSIEURS demandes ("ajoute une tâche pour le plombier et marque la facture comme payée") : renvoie alors autant d'actions que de demandes, dans l'ordre où elles ont été dites. N'en invente aucune, et ne découpe pas une demande unique.
Reprendre quelque chose d'existant : la liste fournie contient AUSSI les tâches déjà faites (status "done") et les chantiers terminés. Si l'utilisateur veut revenir sur une tâche déjà faite ("remets la tâche du plombier à faire", "finalement je dois refaire les carreaux", "rouvre celle que j'ai terminée hier"), n'en crée pas une nouvelle : utilise update_task sur la tâche existante avec changes={"status":"todo"} plus ce qu'il change d'autre. Une tâche n'a que deux statuts, "todo" et "done" — "en cours" pour une tâche vaut "todo".
Pour retrouver la bonne tâche ou le bon chantier, appuie-toi sur les notes autant que sur le titre : l'utilisateur redit souvent un détail de la note plutôt que le titre exact. À égalité de correspondance, préfère ce qui est encore à faire, sauf si l'utilisateur parle explicitement de quelque chose de terminé ou d'archivé.
Agenda : l'utilisateur a branché son compte Google, tu peux lire et écrire dans son agenda. Toutes les heures qu'il dicte sont des heures locales (Israël) — renvoie-les telles quelles dans event_debut/event_fin, sans conversion ni fuseau. Pour update_calendar_event et delete_calendar_event, tu ne connais pas l'identifiant des événements : renseigne event_cible avec la façon dont il les désigne, l'app se charge de retrouver le bon et de demander à l'utilisateur s'il y a une ambiguïté. Un rendez-vous, une réunion, un créneau qui occupe du temps va dans l'agenda ; quelque chose à faire sans créneau reste une tâche (add_task).
Quand la phrase COMMENCE par une demande de note ("ajoute une tâche", "rajoute un chantier", "note que…"), tout ce qui suit est le CONTENU de cette note, même si on y lit "appeler", "envoyer un message" ou "ouvrir" : tu enregistres UNE tâche ou UN chantier, et tu ne déclenches aucune action dans une application. "Ajoute une tâche : appeler le plombier et envoyer un message à Melissa" fait une seule action, add_task — le plombier ne doit pas être appelé maintenant.
Pour send_message et call_contact : résous contact_id depuis la liste de contacts fournie, par nom approchant. Si le contact existe mais n'a pas de numéro (champ phone vide) et que l'utilisateur n'en a pas dicté un, utilise quand même send_message : WhatsApp demandera à qui envoyer. Pour call_contact en revanche, sans numéro l'appel est impossible : renvoie une action clarify qui demande le numéro de la personne.
Ces actions préparent le geste sans l'accomplir : le message s'affiche prêt à partir, l'appel est composé, et c'est l'utilisateur qui appuie. Dis-le simplement dans ta réponse ("je te l'ai préparé, tu n'as plus qu'à envoyer"), sans t'en excuser ni t'étendre dessus.
Pour chat : réponds directement et utilement dans "message", de façon concise (c'est lu à voix haute) — ne renvoie jamais "unknown" juste parce que la question sort des tâches/chantiers/documents/contacts/rappels, "unknown" est réservé à l'audio vraiment incompréhensible.
Réponds toujours en français dans le champ message.`


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const {
      transcript,
      categories,
      tasks,
      devItems,
      themes,
      documents,
      contacts,
      placeReminders,
      pronunciations,
      widgetConfig,
      todayISO,
    } = await req.json()

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript manquant." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Pour l'agenda, l'heure compte autant que la date : "prends-moi un
    // rendez-vous à 14h" dicté à 15 h veut dire demain. Calculée ici dans le
    // fuseau de Raphaël plutôt que reçue du client — l'heure d'un téléphone
    // mal réglé ne doit pas se retrouver dans son agenda.
    const heureLocale = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Asia/Jerusalem",
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date())

    const cleGemini = Deno.env.get("GEMINI_API_KEY")
    if (!cleGemini) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY non configurée côté serveur." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Ce qui change à chaque appel, et seulement ça : placé APRÈS les
    // consignes pour ne pas invalider leur cache.
    const contexte = `Date du jour : ${todayISO}. Heure locale actuelle (Israël) : ${heureLocale}.
Catégories de tâches existantes : ${JSON.stringify(categories)}.
Tâches existantes de l'utilisateur : ${JSON.stringify(tasks)}.
Chantiers de dev Jarvis existants (cockpit) : ${JSON.stringify(devItems)}.
Thèmes de chantiers déjà utilisés : ${JSON.stringify(themes ?? [])}.
Documents existants de l'utilisateur : ${JSON.stringify(documents)}.
Contacts existants de l'utilisateur : ${JSON.stringify(contacts)}.
Rappels de lieu existants de l'utilisateur : ${JSON.stringify(placeReminders)}.
Corrections de transcription déjà apprises : ${JSON.stringify(pronunciations ?? [])}.
Config actuelle du widget : ${JSON.stringify(widgetConfig)}.${await rappelerSouvenirs(supabase, transcript)}`

    const { args, consommation, echec } = await appelerGemini({
      // Réglable par le secret GEMINI_MODELE, sans redéployer : les quotas de
      // l'offre gratuite ne sont publiés nulle part (visibles seulement dans
      // AI Studio) et diffèrent par modèle.
      //
      // Mesures du 3 sept. 2026, sur la vraie API :
      // - gemini-3.8-flash est plafonné à 20 requêtes PAR JOUR et renvoie 429
      //   dès le premier appel : le nommer en tête laissait Jarvis muet.
      // - gemini-3.5-flash-lite répond en ~640 ms et passe les vingt-cinq
      //   contrôles de scripts/verifier-commande-vocale.mjs, « appeler un
      //   contact » compris (rejoué sur la fonction déployée après la fusion).
      // - gemini-3.5-flash répond en ~3 s : la latence s'entend, et Raphaël
      //   la signale déjà comme une gêne.
      // D'où ce défaut. Une session avait mesuré cinq échecs sur le Lite au
      // moment de la bascule ; ce n'est pas reproductible ici, elle visait
      // probablement l'alias « gemini-flash-lite-latest » et non cette
      // version figée. Pas d'alias « latest » en tête, justement : un
      // changement de modèle doit être un choix, pas une surprise un matin.
      modele: Deno.env.get("GEMINI_MODELE") || MODELE_PAR_DEFAUT,
      secours: SECOURS,
      // Les consignes d'abord, le contexte ensuite : voir CONSIGNES.
      systeme: `${CONSIGNES}\n\n${contexte}`,
      texte: transcript,
      outil: VOICE_ACTION_TOOL,
      // Les modèles Gemini 3 réfléchissent avant de répondre et cette
      // réflexion compte dans le plafond : de la marge, sinon la réponse est
      // coupée avant l'appel d'outil. Mesuré le 3 sept. : à 2048, deux des
      // vingt-cinq contrôles tombaient — la réflexion mangeait la place de la
      // réponse sur les phrases qui demandent de croiser la liste de contacts.
      maxTokens: 4096,
      cle: cleGemini,
    })

    if (echec || !args) {
      // Le détail technique va dans les journaux de la fonction, pas à
      // l'écran : Raphaël se retrouvait devant le JSON brut de l'API, ce qui
      // ressemble à « Jarvis est cassé » quel que soit le vrai problème.
      // Lui, il entend une phrase qui lui dit quoi faire.
      console.error("Appel au modèle en échec", echec?.statut, echec?.texte ?? "réponse sans appel d'outil")
      const message = phrasePourEchec(echec)

      return new Response(
        JSON.stringify({
          action: { action: "unknown", message },
          actions: [{ action: "unknown", message }],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Ce que la phrase a réellement coûté en jetons, dans les journaux de la
    // fonction. Sur l'offre gratuite ce n'est pas une facture mais une jauge :
    // la limite est en jetons par minute, et c'est ici qu'on voit le contexte
    // grossir avant qu'il ne fasse buter dessus.
    console.log("coût", JSON.stringify(consommation ?? {}))

    // Le modèle renvoie une liste. On tolère l'ancienne forme (une action à
    // plat) pour ne rien casser si le schéma n'est pas suivi.
    const brutes: Record<string, unknown>[] = Array.isArray(args.actions)
      ? (args.actions as Record<string, unknown>[])
      : args.action
        ? [args]
        : []
    const actions = brutes
      .filter((a) => a && typeof a.action === "string")
      .map((a) =>
        normaliserAction(a, {
          idsContacts: new Set(
            (Array.isArray(contacts) ? contacts : []).map((c: { id?: unknown }) => String(c?.id ?? "")),
          ),
          transcript,
        }),
      )

    if (actions.length === 0) {
      return new Response(
        JSON.stringify({
          action: { action: "unknown", message: "Je n'ai pas compris." },
          actions: [{ action: "unknown", message: "Je n'ai pas compris." }],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Mémorisation silencieuse, après coup : la réponse part sans l'attendre.
    // waitUntil garde la fonction en vie le temps de finir, sans retarder
    // l'utilisateur — sans lui, l'Edge Function s'arrête dès la réponse rendue.
    const rangement = memoriser(
      supabase,
      user.id,
      transcript,
      (actions.find((a) => typeof a.message === "string")?.message as string) ?? null,
      cleGemini,
    )
    const runtime = globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }
    if (runtime.EdgeRuntime?.waitUntil) runtime.EdgeRuntime.waitUntil(rangement)
    else await rangement

    // "action" reste renseignée : l'app Android installée sur le téléphone
    // n'est pas mise à jour au même rythme que le web, et elle ne lit que ce
    // champ. Elle continue donc de traiter la première demande.
    return new Response(JSON.stringify({ action: actions[0], actions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
