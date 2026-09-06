import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { memoriser, rappelerSouvenirs } from "./memoire.ts"
import { CONSIGNE_ENVIRONNEMENT } from "../_shared/environnement.ts"
import { CONSIGNE_HONNETETE } from "../_shared/honnetete.ts"
import { rappelerBranchements } from "../_shared/branchements.ts"
import { rappelerCorrections } from "../_shared/corrections.ts"
import { appelerModele, moteurNonConfigure, phrasePourEchec } from "../_shared/modele.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jarvis-essai",
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

/** Pour comparer sans se soucier des accents ni de la casse. */
function plat(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function normaliserAction(
  input: Record<string, unknown>,
  contexte: { idsContacts: Set<string>; transcript: string },
): Record<string, unknown> {
  // Redressements nés du passage à un petit modèle (Flash-Lite), qui se
  // trompe de champ là où un grand ne se trompait pas. Déterministes et sans
  // risque : on ne devine rien, on déplace ou on retire ce qui est
  // identifiable.
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

  // 1b. open_app + music_query, ou ask_ai, sans application dictée : malgré
  //     la consigne de laisser app_name absent, Flash-Lite invente parfois un
  //     nom "typique" (Spotify, ChatGPT) — constaté à plusieurs reprises le
  //     3 sept. 2026, sur des phrases qui ne nomment aucune application. On ne
  //     garde app_name que si son nom apparaît vraiment dans ce qui a été
  //     dicté ; sinon c'est une invention, pas une extraction.
  if (
    (input.action === "open_app" && input.music_query) || input.action === "ask_ai"
  ) {
    if (
      typeof input.app_name === "string" &&
      input.app_name &&
      !plat(contexte.transcript).includes(plat(input.app_name))
    ) {
      input = { ...input, app_name: undefined }
    }
  }

  // 1c. send_message : même défaut pour message_channel, qui retombe parfois
  //     sur "whatsapp" sans qu'il ait été question de canal. Le canal
  //     appartient à ce qui a été dit, pas à un réflexe du modèle.
  if (
    input.action === "send_message" &&
    typeof input.message_channel === "string" &&
    !/whatsapp|\bsms\b|texto/.test(plat(contexte.transcript))
  ) {
    input = { ...input, message_channel: undefined }
  }

  // 1d. Et le pendant exact, dans l'autre sens : « envoie un SMS à Dylan » et
  //     le champ reste vide. Le canal appartient à ce qui a été dit — s'il a
  //     été dit, il n'a pas à dépendre de l'attention du modèle. Constaté le
  //     4 sept. 2026 en changeant de modèle par force (Google avait retiré le
  //     précédent) : gemini-3.1-flash-lite oubliait ce champ là où son
  //     prédécesseur le remplissait. Un garde-fou qui ne vaut que dans un sens
  //     laisse la moitié du cas à la chance.
  if (input.action === "send_message" && input.message_channel === undefined) {
    const dit = plat(contexte.transcript)
    const iWhatsapp = dit.search(/whatsapp/)
    const iSms = dit.search(/\bsms\b|texto/)
    if (iWhatsapp !== -1 || iSms !== -1) {
      // Les deux cités : on suit l'ordre de la phrase, pas un ordre à nous.
      const canal =
        iSms === -1 || (iWhatsapp !== -1 && iWhatsapp < iSms) ? "whatsapp" : "sms"
      input = { ...input, message_channel: canal }
    }
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
        "add_dev_section",
        "rename_dev_section",
        "list_documents",
        "save_document",
        "configure_widget",
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
        "list_emails",
        "read_email",
        "prepare_email_reply",
        "send_email",
        "find_receipts",
        "set_voice",
        "open_app",
        "send_message",
        "call_contact",
        "set_alarm",
        "navigate_to",
        "media_control",
        "set_app_preference",
        "ask_ai",
        "chat",
        "clarify",
        "unknown",
      ],
      description:
        "Tâches perso/clients : list_tasks, add_task, update_task (task_id + changes), delete_task (task_id). Chantiers de dev Jarvis (cockpit) : list_dev_items, add_dev_item, update_dev_item (item_id + changes), delete_dev_item (item_id), add_dev_section (section_nom) et rename_dev_section (section_id + section_nom) — les SECTIONS qui rangent les chantiers du cockpit ('crée une section Entraînement', 'renomme la section Entraînement en Formation'). Une section peut être déclarée AVANT d'avoir le moindre chantier : c'est fait exprès, et c'est pour ça qu'elle apparaît dans la liste des sections déclarées même quand aucun chantier ne la porte. Pour RANGER un chantier dans une section, ce n'est pas une action de section : c'est update_dev_item avec changes.theme = le nom exact de la section. Pour SUPPRIMER ou FUSIONNER une section, dis à l'utilisateur que ça se fait depuis le cockpit, où il a une confirmation et un bouton Annuler — ne le fais pas à la voix. OUVRIR ou CRÉER une section est TOUJOURS add_dev_section, y compris quand la phrase demande autre chose EN PLUS : « ouvrir une nouvelle section de chantier pour l'intégration d'application IA et lancer une nouvelle session » contient DEUX demandes, et la première est add_dev_section (section_nom « Intégration IA ») — ne retiens jamais la seconde en laissant tomber la première, et ne remplace jamais une section demandée par un chantier qui porterait son nom en thème. Et LANCER UNE SESSION Claude Code n'est pas quelque chose que tu sais faire : ajoute alors une action `chat` DE PLUS, dont le `message` dit que tu ne sais pas lancer de session (elles se lancent depuis l'ordinateur, et elles prennent les chantiers du cockpit toutes seules au démarrage) — plutôt que de l'ignorer en silence ou d'en faire un chantier. archive_dev_item (item_id) — marque le chantier comme fait et l'archive, utilisé quand l'utilisateur dit qu'un chantier est terminé/traité et veut l'archiver — utilisés quand l'utilisateur parle explicitement de 'chantier', de développement de Jarvis, du cockpit, ou d'une fonctionnalité à coder pour l'assistant lui-même. Documents : list_documents, save_document (filename + content) — utilisé quand l'utilisateur demande explicitement d'enregistrer/noter/sauvegarder un document ou un texte. configure_widget (max_tasks, urgent_only, category_id) — utilisé quand l'utilisateur parle du widget d'écran d'accueil (ex: 'montre-moi 5 tâches sur le widget', 'affiche que les urgentes sur le widget', 'widget catégorie perso'). LES CONTACTS NE SONT PLUS UNE ACTION, et c'est une décision de l'utilisateur du 5 sept. 2026 : « ça ne sert à rien, tu as déjà une mémoire active qui retient tout ce qu'on dit, et il est connecté à mes contacts du téléphone ». Donc : ce qu'il dit d'une PERSONNE ('Dylan c'est le client de Melissa', 'pour Yoni toujours confirmer avant d'envoyer') se retient TOUT SEUL par la mémoire longue durée — tu réponds simplement, sans action. Et un NUMÉRO ne se demande jamais : le téléphone a le vrai répertoire, tu ne le vois pas, tu passes contact_name et il cherche dedans. Rappels de lieu : list_place_reminders, add_place_reminder (place + reminder), delete_place_reminder (reminder_id) — utilisé quand l'utilisateur demande de lui rappeler quelque chose la prochaine fois qu'il parle d'un lieu précis (ex: 'quand je parle du chantier Dan, rappelle-moi de commander les carreaux'). Prononciations : list_pronunciations, add_pronunciation (entendu + veut_dire), delete_pronunciation (pronunciation_id) — utilisé quand l'utilisateur corrige la façon dont la dictée a écrit un mot ou un nom (ex: 'ce n'est pas Avirail, c'est Avihail, le h est muet', 'quand je dis Melissa tu écris Mélissa'). set_voice (voice_enabled) — utilisé quand l'utilisateur demande de couper ou de remettre la voix de Jarvis ('arrête de parler', 'coupe ta voix', 'réponds-moi juste à l'écrit', 'remets ta voix', 'reparle'). voice_enabled=false pour se taire, true pour reparler. Ne PAS l'utiliser pour un simple 'tais-toi' qui interrompt une phrase en cours : là il ne s'agit que d'arrêter la lecture, pas de couper la voix pour de bon. Agenda Google : list_calendar_events (event_depuis / event_jusqu_a / event_recherche), add_calendar_event (event_titre + event_debut), update_calendar_event (event_cible + le ou les champs event_* qui changent), delete_calendar_event (event_cible) — utilisé quand l'utilisateur parle de son agenda, de ses rendez-vous, de son planning, de sa journée ou de sa semaine (ex: 'qu'est-ce que j'ai demain ?', 'ajoute un rendez-vous avec Yoni mardi à 14h', 'décale mon rendez-vous de jeudi à 16h', 'annule le rendez-vous chez le dentiste'). À ne pas confondre avec add_task : une tâche est quelque chose à faire, un événement d'agenda occupe un créneau.  Gmail : list_emails (mail_recherche / mail_limite) pour voir ce qu'il a reçu ('qu'est-ce que j'ai reçu ?', 'des mails de Yoni ?') ; read_email (mail_cible) quand il demande de LIRE un message ('lis-moi le mail de Yoni', 'qu'est-ce qu'il dit ?') ; prepare_email_reply (mail_cible + mail_texte) quand il dicte une réponse à un message — cette action PRÉPARE le mail et le lui fait relire, elle ne l'envoie pas ; send_email (aucun autre paramètre) UNIQUEMENT quand il valide un brouillon qui vient de lui être relu ('envoie', 'c'est bon', 'vas-y') — jamais depuis une phrase isolée, jamais dans la même réponse que prepare_email_reply ; find_receipts (mail_jours / mail_limite, et mail_recherche pour un fournisseur précis) quand il parle de ses reçus, factures ou justificatifs ('retrouve mes reçus', 'la facture de la station essence'). Actions dans les autres applications du téléphone (uniquement quand il demande explicitement d'agir dans une app) : open_app (app_name, et music_query pour lancer une lecture — 'mets du Brassens sur Spotify', 'ouvre WhatsApp', 'lance la musique') ; send_message (message_channel 'whatsapp' ou 'sms' UNIQUEMENT s'il le précise ('en SMS', 'par whatsapp') — sinon laisse absent, le choix par défaut vient du téléphone, pas de toi ; message_text, et contact_id si le destinataire est un contact connu, sinon contact_name avec le nom tel qu'il l'a dit — 'envoie un message à Dylan pour lui dire que je passe demain'). UN NOM DE PERSONNE N'EST JAMAIS UN MOT-CLÉ D'ACTION, et c'est une classe d'erreur, pas un cas particulier : dans « envoie un message à X », « écris à X », « appelle X », ce qui suit « à » est le DESTINATAIRE, même quand ce nom ressemble à un mot du vocabulaire de l'app — Mel/mail, Sam/SMS, Al/appel, Alex/alerte, Mika/micro. Le moyen (mail, SMS, WhatsApp) ne se choisit que sur un mot placé AVANT le destinataire (« envoie un MAIL à X ») ou introduit par « par » / « en » (« en SMS »). Sur « envoie un message à Mel », l'action est donc send_message avec contact_name « Mel » (et contact_id en plus si cette personne est dans la liste de contacts fournie), jamais une action Gmail. Dans le doute entre une personne et un moyen, préfère la personne : se tromper de destinataire se voit tout de suite, se tromper de domaine fait perdre la demande ; call_contact (contact_id si le contact est dans la liste fournie, SINON contact_name avec le nom tel qu'il l'a dit — 'appelle Yoni', 'rappelle ma femme' — ou phone_number s'il l'a dicté) ; set_alarm (alarm_time en HH:MM pour une heure précise, OU alarm_duration_seconds pour un minuteur, plus alarm_label — 'réveille-moi à 7h', 'minuteur de 10 minutes') ; navigate_to (destination — 'emmène-moi au chantier de la villa Dan') ; media_control (media_command 'play_pause', 'lecture', 'pause', 'suivant', 'precedent' ou 'stop') — pilote ce qui joue DÉJÀ, quelle que soit l'application : 'mets pause', 'reprends', 'chanson suivante', 'coupe la musique'. À distinguer d'open_app avec music_query, qui sert à LANCER quelque chose de précis. set_app_preference (category 'musique', 'navigation', 'messages', 'ia' ou 'appels', + app_name) — UNIQUEMENT quand l'utilisateur dit explicitement quelle application utiliser pour une catégorie SANS rien demander d'autre en même temps ('utilise Waze pour la navigation', 'préfère les SMS pour mes messages', 'utilise Deezer pour la musique', 'utilise Perplexity pour l'IA', 'utilise le téléphone pour mes appels') : mémorise son choix côté téléphone, ne l'utilise jamais pour deviner ou pour répondre à une question posée par le téléphone lui-même ; ask_ai (question, et app_name UNIQUEMENT si l'utilisateur nomme l'IA — sinon absent, comme pour open_app) — quand l'utilisateur demande explicitement de relayer une question à une IA installée sur son téléphone ('demande à Perplexity ce que vaut le grès cérame', 'demande à ChatGPT') : Jarvis ne répond pas lui-même, il prépare la question dans l'app visée. Ne PAS confondre avec chat (une question que TU peux traiter toi-même sans relais). Ces actions PRÉPARENT le geste, elles ne l'accomplissent pas : le message s'affiche prêt à partir et l'appel est composé, mais c'est l'utilisateur qui appuie. Dis-le naturellement dans ta réponse, sans t'excuser. N'utilise JAMAIS ces actions pour quelque chose qui se fait dans Jarvis lui-même : une tâche reste add_task, un rappel reste add_place_reminder, un rendez-vous reste add_calendar_event. chat: toute question ou discussion qui ne concerne ni les tâches ni le cockpit ni les documents ni le widget ni les rappels de lieu (culture générale, conseil, actualité, calcul, etc.) — répondre directement et utilement via `message`. clarify: commande ambiguë (plusieurs éléments possibles, ou infos manquantes) — poser une question via `message`. unknown: audio incompréhensible/inaudible, pas une question hors-sujet (ça, c'est 'chat').",
    },
    title: {
      type: "string",
      description:
        "Titre court (add_task ou add_dev_item), quelques mots, synthétisé à partir de la phrase dictée par l'utilisateur — jamais la phrase brute complète si elle est longue.",
    },
    name: {
      type: "string",
      description: "Nom d'une personne, quand une action en demande un.",
    },
    phone: {
      type: "string",
      description: "Numéro de téléphone, UNIQUEMENT si l'utilisateur vient de le dicter à voix haute. Sinon jamais : le téléphone a le vrai répertoire.",
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
    mail_cible: {
      type: "string",
      description: "read_email / prepare_email_reply / get_email_attachment : de quel message il s'agit, tel que l'utilisateur le désigne (quelques mots : 'le mail de Yoni', 'le dernier', 'la facture d'électricité'). L'app le retrouvera dans la boîte.",
    },
    mail_recherche: {
      type: "string",
      description: "list_emails : ce qu'il cherche, en langage courant ('les mails de Yoni', 'ceux avec une pièce jointe'). Traduis-le en syntaxe de recherche Gmail (from:, has:attachment, is:unread, subject:). Absent = ses messages non lus.",
    },
    mail_texte: {
      type: "string",
      description: "prepare_email_reply : la réponse que l'utilisateur dicte, mise en forme comme un e-mail (pas comme une transcription brute) mais SANS rien inventer qu'il n'ait dit.",
    },
    mail_limite: {
      type: "number",
      description: "list_emails / find_receipts : combien de messages au plus. Absent = 10.",
    },
    mail_jours: {
      type: "number",
      description: "find_receipts : sur combien de jours en arrière chercher. Absent = 30.",
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
        "add_task ou add_dev_item : si la phrase dictée par l'utilisateur contient des détails au-delà du simple titre (contexte, raison, précisions), reformule-les ici en note complète. null si le titre résume déjà tout.",
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
    section_id: {
      type: "string",
      description: "id de la section de chantiers existante ciblée (rename_dev_section), résolu depuis la liste des sections déclarées (par nom approchant).",
    },
    section_nom: {
      type: "string",
      description: "add_dev_section : le nom de la section à créer. rename_dev_section : le NOUVEAU nom. Un nom court, tel que l'utilisateur le dit (« Entraînement », « Facturation »).",
    },
    contact_id: {
      type: "string",
      description: "id d'un contact déjà enregistré, quand la liste fournie en contient un qui correspond. Sinon utiliser contact_name.",
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
      description: "OBLIGATOIRE et NON VIDE pour update_task et update_dev_item : les champs à modifier, et eux seuls. update_task : title, notes, status ('todo'/'done'), category_id, due_date, due_time. update_dev_item : title, notes, status ('todo'/'in_progress'/'done'), priority ('low'/'normal'/'high'), theme. Exemples : { \"priority\": \"high\" } pour monter un chantier en priorité, { \"status\": \"in_progress\" } pour le passer en cours.",
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
      description: "open_app ou ask_ai : le nom de l'application tel que l'utilisateur l'a dit (\"WhatsApp\", \"YouTube\", \"Waze\", \"Perplexity\"...). L'app est retrouvée ensuite parmi celles réellement installées, la casse et les accents n'ont pas d'importance. LAISSE CE CHAMP ABSENT s'il ne la nomme pas (\"mets de la musique\", \"demande à une IA\") : NE DEVINE JAMAIS un nom d'application, même un exemple courant vu ailleurs dans ces instructions — le téléphone se charge lui-même de retrouver ou de demander la bonne. set_app_preference : l'application qu'il vient de choisir pour la catégorie donnée.",
    },
    music_query: {
      type: "string",
      description: "open_app uniquement : ce qu'il faut jouer (\"du Brassens\", \"l'album Rumours\", \"ma playlist du matin\"). Ne le renseigner que si l'utilisateur demande d'écouter quelque chose — sinon on se contente d'ouvrir l'application.",
    },
    message_channel: {
      type: "string",
      enum: ["whatsapp", "sms"],
      description: "send_message uniquement : par où passe le message, UNIQUEMENT si l'utilisateur le dit explicitement (\"SMS\", \"texto\", \"whatsapp\"). Absent sinon — le choix par défaut se fait côté téléphone (déjà retenu, ou demandé directement), pas ici.",
    },
    category: {
      type: "string",
      enum: ["musique", "navigation", "messages", "ia", "appels"],
      description: "set_app_preference uniquement : la catégorie dont l'utilisateur vient de nommer l'application.",
    },
    question: {
      type: "string",
      description: "ask_ai uniquement : la question rédigée proprement, prête à envoyer, comme message_text pour send_message — pas la phrase brute de l'utilisateur si elle contient des mots de commande (\"demande à Perplexity\").",
    },
    message_text: {
      type: "string",
      description: "send_message uniquement : le message rédigé proprement, prêt à être envoyé. L'utilisateur dicte une intention (\"dis-lui que je passe demain matin\"), pas un texte : rédige-le à sa place, à la première personne, court et naturel.",
    },
    contact_name: {
      type: "string",
      description:
        "send_message ou call_contact : le nom de la personne TEL QUE L'UTILISATEUR L'A DIT (« ma femme », « Yoni », « le plombier »), à renseigner DÈS QUE le destinataire n'est pas dans la liste de contacts fournie. Le téléphone cherchera ce nom dans le vrai répertoire, que tu ne vois pas. Ne demande donc JAMAIS un numéro avant d'avoir essayé ça.",
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

// Les noms de modèles ne vivent plus ici : ils sont propres au fournisseur, et
// c'est lui qui les porte (supabase/functions/_shared/gemini.ts), avec les
// mesures et les pièges qui les ont fait choisir. On demande un RÔLE
// (« commande »), pas un modèle — c'est ce qui permet de changer de moteur en
// posant un secret, sans redéployer et sans toucher à ce fichier.

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
const CONSIGNES = `Tu es l'assistant vocal de Jarvis, qui gère huit domaines pour l'utilisateur :
1. Ses tâches personnelles/clients, organisées par catégorie.
2. Le cockpit de développement de Jarvis lui-même (les chantiers/fonctionnalités à coder pour l'assistant) — utilise ce domaine quand l'utilisateur parle explicitement de "chantier", de développer/coder Jarvis, du "cockpit", ou d'une fonctionnalité de l'app elle-même.
3. Ses documents texte — utilise ce domaine quand l'utilisateur demande explicitement d'enregistrer, noter ou sauvegarder un document/texte (ex: "enregistre un document avec...", "note ça dans un fichier...").
4. La config du widget d'écran d'accueil Android (nombre de tâches affichées, urgentes uniquement, filtre catégorie) — utilise ce domaine quand l'utilisateur parle explicitement du widget.
5. Ses contacts : qui est qui, et ce qu'il attend pour chacun — utilise ce domaine quand l'utilisateur présente quelqu'un ou donne une consigne à son sujet (ex: "Dylan c'est le client de Melissa", "retiens que pour Yoni il faut toujours confirmer avant d'envoyer un message").
6. Ses rappels liés à un lieu — utilise ce domaine quand l'utilisateur demande explicitement d'être rappelé de quelque chose la prochaine fois qu'il mentionnera un lieu précis en lui parlant (ex: "quand je parle du chantier Dan, rappelle-moi de commander les carreaux"). Ce n'est PAS de la géolocalisation : le rappel se déclenche uniquement quand l'utilisateur reparle du lieu à voix haute.
7. Son agenda Google et sa messagerie Gmail : son compte est branché, tu peux lire et écrire dans les deux. Utilise ce domaine dès qu'il parle de ses rendez-vous, de son planning, de sa journée — ou de ses mails, de ce qu'il a reçu, d'une réponse à faire, d'une facture ou d'un reçu. NE DIS JAMAIS que tu n'as pas accès à ses mails ou à son agenda : c'est faux, et c'est la première chose qu'il a branchée.
8. La discussion généraliste : toute question ou échange qui ne concerne ni les tâches, ni le cockpit, ni les documents, ni le widget, ni les contacts, ni les rappels de lieu, ni son agenda, ni ses mails — culture générale, conseil, actualité, calcul, définition, etc. Réponds comme le ferait un assistant conversationnel normal (Claude), avec tes connaissances, sans te limiter aux tâches/chantiers.


AVANT TOUT : la phrase vient d'une dictée vocale. Si un mot du transcript correspond à une correction déjà apprise (liste "Corrections de transcription", plus bas ; champ "entendu"), lis-le comme le mot corrigé ("veut_dire") pour toute la suite du raisonnement — c'est ce que l'utilisateur a réellement dit. N'en parle pas, corrige silencieusement.
Quand l'utilisateur te reprend sur un mot mal transcrit ("ce n'est pas X, c'est Y", "quand je dis Y tu écris X"), enregistre-le avec add_pronunciation : "entendu" est la forme fausse telle qu'elle sort de la dictée, "veut_dire" la bonne. Fais-le en plus de la demande d'origine s'il y en avait une, et n'enregistre rien si la correction porte sur le fond plutôt que sur l'orthographe d'un mot.

Traduis la commande vocale de l'utilisateur en un appel à l'outil resolve_voice_command.
Pour update_task/delete_task, résous task_id depuis la liste de tâches fournie (par titre approchant). Pour update_dev_item/delete_dev_item, résous item_id depuis la liste de chantiers fournie. Pour delete_place_reminder, résous reminder_id depuis la liste de rappels de lieu fournie (par lieu approchant). Si plusieurs éléments correspondent ou qu'aucun ne correspond clairement, utilise action="clarify" avec une question précise.
Pour update_task/update_dev_item, tout ce qui change va dans "changes", jamais dans les champs de premier niveau : "passe ce chantier en priorité haute" donne changes={"priority":"high"}, "marque-le en cours" donne changes={"status":"in_progress"}. Ne renvoie jamais une action de modification avec un "changes" vide.
Pour add_task/add_dev_item : si l'utilisateur dicte une phrase longue avec des détails (contexte, raison, précisions), ne mets pas toute la phrase dans "title" — synthétise un titre court (quelques mots) et reformule le reste dans "notes". Si la phrase est déjà courte et ne contient rien de plus que le titre, laisse "notes" à null.
Pour add_task : si l'utilisateur précise une heure ("à 14h", "ce midi", "à 9h30 demain"), déduis-la dans "due_time" (HH:MM) en plus de "due_date" — jamais d'heure sans date. Sans heure précisée, laisse "due_time" à null.
Pour save_document : synthétise un nom de fichier court dans "filename", et reformule proprement tout ce que l'utilisateur a dicté comme contenu dans "content".
Pour configure_widget : ne renvoie que les champs (max_tasks, urgent_only, category_id) que l'utilisateur a explicitement mentionnés — laisse les autres absents plutôt que de les redéfinir à une valeur par défaut.
Pour add_dev_item : classe le chantier dans un thème. Reprends un thème existant à l'identique dès qu'il convient — c'est ce qui permet de traiter un sujet entier d'un coup au lieu de le rafistoler chantier par chantier. N'en crée un nouveau que si aucun ne colle.
Pour add_place_reminder : "place" doit être un mot-clé court et probable à être redit tel quel (nom de lieu, de chantier, de client) — pas une phrase entière. "reminder" est la phrase que Jarvis doit dire, reformulée proprement.
Une seule phrase peut contenir PLUSIEURS demandes ("ajoute une tâche pour le plombier et marque la facture comme payée") : renvoie alors autant d'actions que de demandes, dans l'ordre où elles ont été dites. N'en invente aucune, et ne découpe pas une demande unique.
Reprendre quelque chose d'existant : la liste fournie contient AUSSI les tâches déjà faites (status "done") et les chantiers terminés. Si l'utilisateur veut revenir sur une tâche déjà faite ("remets la tâche du plombier à faire", "finalement je dois refaire les carreaux", "rouvre celle que j'ai terminée hier"), n'en crée pas une nouvelle : utilise update_task sur la tâche existante avec changes={"status":"todo"} plus ce qu'il change d'autre. Une tâche n'a que deux statuts, "todo" et "done" — "en cours" pour une tâche vaut "todo".
Pour retrouver la bonne tâche ou le bon chantier, appuie-toi sur les notes autant que sur le titre : l'utilisateur redit souvent un détail de la note plutôt que le titre exact. À égalité de correspondance, préfère ce qui est encore à faire, sauf si l'utilisateur parle explicitement de quelque chose de terminé ou d'archivé.
Agenda : l'utilisateur a branché son compte Google, tu peux lire et écrire dans son agenda. Toutes les heures qu'il dicte sont des heures locales (Israël) — renvoie-les telles quelles dans event_debut/event_fin, sans conversion ni fuseau. Pour update_calendar_event et delete_calendar_event, tu ne connais pas l'identifiant des événements : renseigne event_cible avec la façon dont il les désigne, l'app se charge de retrouver le bon et de demander à l'utilisateur s'il y a une ambiguïté. Un rendez-vous, une réunion, un créneau qui occupe du temps va dans l'agenda ; quelque chose à faire sans créneau reste une tâche (add_task).

GMAIL. Son compte Gmail EST BRANCHÉ et tu sais t'en servir. Ne réponds JAMAIS "je n'ai pas accès à tes e-mails" : c'est faux. Dès qu'une phrase parle d'un mail, d'un message reçu, d'une réponse à écrire, d'une facture ou d'un reçu, choisis une de ces quatre actions et jamais chat :
— "qu'est-ce que j'ai reçu ?", "des mails de Yoni ?", "j'ai des mails non lus ?" → list_emails
— "lis-moi le mail de Yoni", "qu'est-ce qu'il dit ?", "ouvre ce mail" → read_email, avec mail_cible = la façon dont il désigne le message ("Yoni", "le dernier", "la facture d'électricité")
— "réponds-lui que...", "réponds au mail de X que...", "dis-lui que je passe demain" quand il s'agit d'un MAIL → prepare_email_reply, avec mail_cible et mail_texte
— "retrouve mes reçus", "les factures de ce mois", "le justificatif de la station essence" → find_receipts
Attention à deux confusions : chercher une FACTURE se fait avec find_receipts, jamais avec list_calendar_events (l'agenda ne contient pas de factures) ; et répondre à un MAIL se fait avec prepare_email_reply, alors que send_message sert aux SMS et à WhatsApp. S'il ne précise pas le canal et que le contexte ne dit rien, demande-lui avec clarify plutôt que de deviner.
UN E-MAIL PART VERS L'EXTÉRIEUR EN SON NOM, et c'est la règle la plus importante de tout ce document : prepare_email_reply et send_email sont DEUX TOURS DE PAROLE SÉPARÉS. Quand il dicte une réponse, tu renvoies prepare_email_reply et tu lui dis que tu la lui relis avant d'envoyer. Tu n'émets send_email qu'au tour SUIVANT, quand il a dit oui. Ne les mets jamais tous les deux dans la même réponse, et n'annonce jamais qu'un mail est parti si tu n'as pas émis send_email — le serveur refuse d'envoyer sans sa confirmation, donc un mail annoncé sans elle serait un mensonge.
Quand la phrase COMMENCE par une demande de note ("ajoute une tâche", "rajoute un chantier", "note que…"), tout ce qui suit est le CONTENU de cette note, même si on y lit "appeler", "envoyer un message" ou "ouvrir" : tu enregistres UNE tâche ou UN chantier, et tu ne déclenches aucune action dans une application. "Ajoute une tâche : appeler le plombier et envoyer un message à Melissa" fait une seule action, add_task — le plombier ne doit pas être appelé maintenant.
Pour send_message et call_contact : mets TOUJOURS contact_name = le nom de la personne tel qu'il l'a dit (« ma femme », « Yoni », « le plombier »), ET EN PLUS contact_id si la liste de contacts fournie contient cette personne. Les deux ensemble, jamais l'un à la place de l'autre : contact_id porte un numéro déjà connu, contact_name permet au téléphone de chercher dans son répertoire quand il n'y en a pas. Tu ne vois PAS ce répertoire. Ne réclame donc JAMAIS un numéro de téléphone : ni en clarify, ni autrement. Si personne ne correspond, c'est le téléphone qui te le fera dire, pas toi qui le devines.

Tu ne tiens PLUS de fiches contacts, et tu n'as aucune action pour en créer ou en modifier. Donc si l'utilisateur te dicte un numéro (« le numéro de Dylan c'est le 06 12 34 56 78 »), réponds simplement que tu le retiens — c'est vrai, ta mémoire longue durée l'enregistre toute seule. Ne dis JAMAIS que tu l'as « ajouté à sa fiche » ou « enregistré dans ses contacts » : ces fiches n'existent plus, et prétendre avoir fait quelque chose qu'on n'a pas fait est pire que de ne rien faire.
Ces actions préparent le geste sans l'accomplir : le message s'affiche prêt à partir, l'appel est composé, et c'est l'utilisateur qui appuie. Dis-le simplement dans ta réponse ("je te l'ai préparé, tu n'as plus qu'à envoyer"), sans t'en excuser ni t'étendre dessus.
${CONSIGNE_HONNETETE}
Pour chat : réponds directement et utilement dans "message", de façon concise (c'est lu à voix haute) — ne renvoie jamais "unknown" juste parce que la question sort des tâches/chantiers/documents/contacts/rappels, "unknown" est réservé à l'audio vraiment incompréhensible.
${CONSIGNE_ENVIRONNEMENT}
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
      sections,
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

    // Une clé pour Raphaël, une autre pour nos vérifications.
    //
    // POURQUOI : le plafond de l'offre gratuite Gemini se compte PAR PROJET
    // Google. Le 3 sept. 2026 à 21h28, les contrôles lancés dans la journée
    // par quatre sessions Claude Code avaient vidé le quota du jour, et
    // Raphaël s'est retrouvé devant « J'ai atteint la limite de l'offre
    // gratuite » en pleine conversation. Il a demandé de ne PAS réduire les
    // vérifications — ce sont elles qui font avancer le moteur — donc c'est
    // le seau qu'on sépare, pas le nombre de tests.
    //
    // scripts/verifier-commande-vocale.mjs pose l'en-tête ci-dessous ; la clé
    // de test vit sur un second projet Google AI Studio. Si le secret manque,
    // on retombe sur la clé normale : mieux vaut un contrôle qui puise dans
    // son quota qu'un contrôle qui ne tourne pas.
    //
    // L'en-tête est fourni par l'appelant, donc à ne jamais considérer comme
    // une preuve d'identité : il ne fait que choisir entre deux clés
    // également gratuites, sur une fonction qui exige déjà d'être connecté.
    // Il n'ouvre aucun accès et ne change rien à la réponse rendue.
    const essai = req.headers.get("x-jarvis-essai") === "1"
    // Quel secret porte la clé dépend du fournisseur choisi : c'est lui qui le
    // dit, pas ce fichier. On échoue ici, avant tout appel HTTP, et en NOMMANT
    // le secret manquant — une panne qui ne se nomme pas se cherche pendant des
    // heures. La trace « clé test / normale » est posée par `appelerModele`.
    const moteurManquant = await moteurNonConfigure(essai)
    if (moteurManquant) {
      return new Response(
        JSON.stringify({ error: moteurManquant }),
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
Sections de chantiers DÉCLARÉES, avec leur identifiant : ${JSON.stringify(sections ?? [])}. Une section peut exister sans contenir encore aucun chantier — c'est même le cas le plus utile, une section créée d'avance pour y ranger ce qui vient. Quand l'utilisateur range un chantier « dans » une section, utilise le nom EXACT de cette liste comme thème, même si aucun chantier ne la porte encore : n'en crée jamais une jumelle avec une orthographe différente.
Documents existants de l'utilisateur : ${JSON.stringify(documents)}.
Contacts existants de l'utilisateur : ${JSON.stringify(contacts)}.
Rappels de lieu existants de l'utilisateur : ${JSON.stringify(placeReminders)}.
Corrections de transcription déjà apprises : ${JSON.stringify(pronunciations ?? [])}.
Config actuelle du widget : ${JSON.stringify(widgetConfig)}.${await rappelerBranchements(supabase)}${await rappelerCorrections(supabase)}${await rappelerSouvenirs(supabase, transcript)}`

    const {
      args,
      consommation,
      echec,
      modele: modeleUtilise,
    } = await appelerModele({
      // Un RÔLE, pas un nom de modèle : le fournisseur choisi traduit
      // « commande » vers son propre modèle et ses propres secours, réglables
      // par secrets. La commande et la mémoire gardent ainsi des seaux de
      // quota séparés — c'est ce partage qui a rendu Jarvis muet le 3 sept.
      role: "commande",
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
      essai,
      // Ce que la phrase coûte est noté en base (chantier 5ac4d12c) : les
      // journaux de la fonction ne se lisent pas depuis son téléphone, ne se
      // totalisent pas, et s'effacent.
      journal: { supabase, userId: user.id },
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
    // On journalise aussi QUEL modèle a répondu : un basculement sur un
    // secours est sinon invisible, et on ne découvre que le seau principal est
    // vide qu'au moment où le dernier secours lâche à son tour.
    console.log("coût", JSON.stringify({ ...(consommation ?? {}), modele: modeleUtilise }))

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
      essai,
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
