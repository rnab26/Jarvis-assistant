/**
 * Vérifie l'interprétation LOCALE des commandes vocales.
 *
 *   node --experimental-strip-types scripts/verifier-commande-locale.ts
 *
 * Aucun réseau, aucun modèle, aucun centime : c'est justement le sujet.
 * Ce que ce module reconnaît, Jarvis le fait sans appeler personne — donc
 * même sans crédit chez un fournisseur d'IA, et même hors ligne.
 *
 * Les deux moitiés comptent autant. Ce qu'il DOIT comprendre : les tournures
 * que Raphaël emploie tous les jours. Ce qu'il doit LAISSER PASSER : tout ce
 * qui demande un vrai raisonnement — mal deviné, ça crée une tâche fausse
 * qu'il faut ensuite retrouver et corriger.
 */
import { interpreterLocalement, type ContexteLocal } from "../src/lib/commandeLocale.ts"

// Jeudi 3 septembre 2026, 15 h 30 — figé pour que les dates soient vérifiables.
const MAINTENANT = new Date("2026-09-03T15:30:00")

const CTX: ContexteLocal = {
  taches: [
    { id: "t-plombier", title: "Appeler le plombier", notes: "fuite sous l'évier" },
    { id: "t-facture", title: "Payer la facture d'électricité", notes: null },
    { id: "t-carreaux", title: "Commander les carreaux", notes: "chantier villa Dan" },
  ],
  chantiers: [{ id: "c-micro", title: "Micro", notes: "se coupe entre les phrases" }],
  contacts: [
    { id: "ct-yoni", name: "Yoni", phone: "0612345678" },
    { id: "ct-dylan", name: "Dylan", phone: null },
  ],
  maintenant: MAINTENANT,
}

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

type Attendu = Record<string, unknown>

function doitDonner(phrase: string, attendu: Attendu) {
  const actions = interpreterLocalement(phrase, CTX)
  if (!actions || actions.length === 0) {
    verifier(`« ${phrase} »`, false, "non reconnu (retombe sur le serveur)")
    return
  }
  const a = actions[0] as unknown as Record<string, unknown>
  const manque = Object.entries(attendu).filter(([k, v]) => a[k] !== v)
  verifier(
    `« ${phrase} »`,
    manque.length === 0,
    manque.map(([k, v]) => `${k} = ${JSON.stringify(a[k])}, attendu ${JSON.stringify(v)}`).join(" ; "),
  )
}

function doitLaisserPasser(phrase: string, pourquoi: string) {
  const actions = interpreterLocalement(phrase, CTX)
  verifier(
    `laisse passer « ${phrase} » (${pourquoi})`,
    actions === null,
    `interprété comme ${JSON.stringify(actions)}`,
  )
}

console.log("— Ce qu'il doit comprendre tout seul —")

doitDonner("Jarvis, ajoute une tâche : appeler le carreleur", {
  action: "add_task",
  title: "Appeler le carreleur",
  due_date: null,
})
doitDonner("ajoute une tâche pour demain : sortir les poubelles", {
  action: "add_task",
  title: "Sortir les poubelles",
  due_date: "2026-09-04",
})
doitDonner("rappelle-moi d'appeler Yoni demain à 14h", {
  action: "add_task",
  title: "Appeler yoni",
  due_date: "2026-09-04",
  due_time: "14:00",
})
doitDonner("note d'acheter du pain", { action: "add_task", title: "Acheter du pain" })
doitDonner("liste mes tâches", { action: "list_tasks" })
doitDonner("qu'est-ce que j'ai à faire", { action: "list_tasks" })
doitDonner("marque la tâche appeler le plombier comme faite", {
  action: "update_task",
  task_id: "t-plombier",
})
doitDonner("marque le plombier comme terminé", {
  action: "update_task",
  task_id: "t-plombier",
})
doitDonner("supprime la tâche des carreaux", {
  action: "delete_task",
  task_id: "t-carreaux",
})
doitDonner("ajoute un chantier : le widget ne se met pas à jour", {
  action: "add_dev_item",
  title: "Le widget ne se met pas a jour",
})
doitDonner("liste mes chantiers", { action: "list_dev_items" })
doitDonner("coupe ta voix", { action: "set_voice", voice_enabled: false })
doitDonner("remets ta voix", { action: "set_voice", voice_enabled: true })
doitDonner("réponds-moi juste à l'écrit", { action: "set_voice", voice_enabled: false })

console.log("\n— L'agenda —")

doitDonner("qu'est-ce que j'ai dans mon agenda demain", {
  action: "list_calendar_events",
  event_depuis: "2026-09-04T00:00:00",
})
doitDonner("montre-moi mon planning", { action: "list_calendar_events" })
doitDonner("ajoute un rendez-vous avec Yoni mardi à 14h", {
  action: "add_calendar_event",
  event_debut: "2026-09-08T14:00:00",
})
doitDonner("prends un rendez-vous demain à 9h30 chez le dentiste", {
  action: "add_calendar_event",
  event_debut: "2026-09-04T09:30:00",
})

console.log("\n— Ses tournures réelles, relevées dans la table `echanges` —")

// Ces phrases ne sont pas inventées : ce sont celles que Raphaël a réellement
// dictées, telles que la table les a enregistrées. Elles disent deux choses
// qu'aucune supposition n'aurait données : il dit « rajoute », pas « ajoute »,
// et ses demandes sont longues et descriptives.
doitDonner("Jarvis rajoute un chantier pour un problème de micro", {
  action: "add_dev_item",
  title: "Un probleme de micro",
})
doitDonner(
  "rajoute un chantier pour un problème de micro à chaque fois qu'on termine une phrase il faut que je réappuie sur le bouton",
  {
    action: "add_dev_item",
    title: "Un probleme de micro a chaque fois",
  },
)
doitDonner("rajoute une tâche : vérifier le devis de la boutique", {
  action: "add_task",
  title: "Verifier le devis de la boutique",
})
doitDonner("dans les tâches de développement ajoute un chantier à traiter en priorité", {
  action: "add_dev_item",
})
doitDonner("mets le chantier micro en priorité haute", {
  action: "update_dev_item",
  item_id: "c-micro",
})
doitDonner("modifie la priorité du chantier micro en très élevé", {
  action: "update_dev_item",
  item_id: "c-micro",
})
doitDonner("archive le chantier micro", { action: "archive_dev_item", item_id: "c-micro" })

// La note garde tout ce qu'il a dit — c'est ce qui rend acceptable un titre
// tronqué : rien n'est perdu, seul le titre est à retoucher.
{
  const longue =
    "rajoute une tâche comme quoi le micro doit avoir la capacité d'être en écoute constante à chaque fois il se coupe"
  const actions = interpreterLocalement(longue, CTX)
  const a = actions?.[0] as unknown as Record<string, unknown> | undefined
  verifier(
    "une dictée longue garde tout son contenu dans la note",
    typeof a?.notes === "string" && (a.notes as string).includes("ecoute constante"),
    `notes = ${JSON.stringify(a?.notes)}`,
  )
}

console.log("\n— Musique, appels, messages, alarmes, itinéraires —")
// Formulations calquées sur celles déjà vérifiées côté Edge Function
// (scripts/verifier-commande-vocale.mjs) : personne ne les a encore dictées
// pour de vrai, la fonctionnalité n'a jamais tourné faute de crédit. À
// corriger avec de vraies tournures dès qu'il en dicte.

doitDonner("mets du Brassens sur Spotify", {
  action: "open_app",
  app_name: "Spotify",
  music_query: "Du brassens",
})
// Signalé par Raphaël le 3 sept. : sans "sur", l'app n'est jamais nommée ici
// — c'est executerActionTelephone/open_app qui vise l'app retenue ou la
// demande, pour ne jamais laisser Android ouvrir son sélecteur.
doitDonner("mets-moi la musique Maes la planque", {
  action: "open_app",
  music_query: "Maes la planque",
  app_name: undefined,
})
doitDonner("ouvre WhatsApp", { action: "open_app", app_name: "Whatsapp" })
// Apprentissage direct : mêmes catégories que ci-dessus (musique, navigation,
// messages), sans attendre une commande ambiguë pour poser la question.
doitDonner("utilise Spotify pour la musique", {
  action: "set_app_preference",
  category: "musique",
  app_name: "Spotify",
})
doitDonner("utilise Waze pour la navigation", {
  action: "set_app_preference",
  category: "navigation",
  app_name: "Waze",
})
doitDonner("utilise WhatsApp pour les messages", {
  action: "set_app_preference",
  category: "messages",
  app_name: "Whatsapp",
})
doitDonner("utilise Perplexity pour l'IA", {
  action: "set_app_preference",
  category: "ia",
  app_name: "Perplexity",
})
// Relayer une question à une IA installée (3de0e08a étendu à 54928a6c) :
// vocabulaire fini (ChatGPT, Perplexity, Claude, Grok, Gemini, Copilot),
// sinon la question retombe sur le serveur plutôt que de deviner où
// s'arrête le nom de l'app.
// Comme le reste du module, la question reconstruite perd ses accents (le
// module entier travaille sur le texte normalisé — limitation existante,
// pas propre à cette règle : voir "verifier le devis" plus haut).
doitDonner("demande à Perplexity ce que vaut le grès cérame", {
  action: "ask_ai",
  app_name: "Perplexity",
  question: "Ce que vaut le gres cerame",
})
doitDonner("demande à une IA combien coûte un plombier à Paris", {
  action: "ask_ai",
  app_name: undefined,
  question: "Combien coute un plombier a paris",
})
doitDonner("mets en pause", { action: "media_control", media_command: "pause" })
doitDonner("reprends la musique", { action: "media_control", media_command: "lecture" })
doitDonner("chanson suivante", { action: "media_control", media_command: "suivant" })
doitDonner("morceau précédent", { action: "media_control", media_command: "precedent" })
doitDonner("lance la musique", { action: "media_control", media_command: "lecture" })

doitDonner("appelle Yoni", { action: "call_contact", contact_id: "ct-yoni" })
doitDonner("envoie un message à Dylan pour lui dire que je passe demain matin sur le chantier", {
  action: "send_message",
  contact_id: "ct-dylan",
  // "message" ne dit pas le canal : send_message tranche à l'exécution
  // (canal retenu, ou "whatsapp" par défaut) — voir actionsTelephoneVocales.
  message_channel: undefined,
  message_text: "Je passe demain matin sur le chantier",
})
doitDonner("envoie un whatsapp à Dylan pour lui dire que je passe demain matin sur le chantier", {
  action: "send_message",
  contact_id: "ct-dylan",
  message_channel: "whatsapp",
})
doitDonner("envoie un sms à Dylan pour dire que je suis en retard", {
  action: "send_message",
  contact_id: "ct-dylan",
  message_channel: "sms",
})
doitDonner("réveille-moi à 7h", { action: "set_alarm", alarm_time: "07:00" })
doitDonner("mets un minuteur de 10 minutes pour les pâtes", {
  action: "set_alarm",
  alarm_duration_seconds: 600,
  alarm_label: "Les pates",
})
doitDonner("minuteur de 2 heures", {
  action: "set_alarm",
  alarm_duration_seconds: 7200,
})

doitDonner("emmène-moi au 12 rue de la Paix", {
  action: "navigate_to",
  destination: "12 rue de la paix",
})

console.log("\n— Ce qui ne doit JAMAIS déclencher une action dans une app —")

doitLaisserPasser(
  "appelle le truc bidule",
  "aucun contact ne correspond, mieux vaut redemander que composer au hasard",
)
doitDonner("ajoute une tâche : appeler le plombier", {
  action: "add_task",
  title: "Appeler le plombier",
})

console.log("\n— Créer un chantier à la voix : ses phrases réelles du 5 sept. —")

// Les trois phrases ci-dessous ne sont pas inventées : elles sont copiées de
// `journal_ecoute`, le 5 sept. 2026 entre 17 h 59 et 18 h 00. Les trois ont
// échoué, chacune autrement — deux ont ouvert une application israélienne au
// hasard, la troisième a créé une TÂCHE intitulée « R un chantier ».
doitDonner("Lance un chantier et ajoute-le : savoir combien il me reste de crédit", {
  action: "add_dev_item",
  title: "Savoir combien il me reste de credit",
})
doitDonner("Lance un chantier et vas-y ajoute-le. J'aimerais savoir combien il me reste de crédit", {
  action: "add_dev_item",
  title: "Savoir combien il me reste de credit",
})
// Le piège était un `\\s*` au lieu d'un `\\s+` : « creer » se lisait « cree »
// suivi de « r », et le « r » restait collé en tête du titre.
doitDonner("Créer un chantier : savoir combien il reste de crédit", {
  action: "add_dev_item",
  title: "Savoir combien il reste de credit",
})
doitDonner("créer une tâche : appeler le plombier", {
  action: "add_task",
  title: "Appeler le plombier",
})
doitDonner("ajouter une tâche : commander les carreaux", {
  action: "add_task",
  title: "Commander les carreaux",
})
// Ce qui doit continuer de marcher : « lance » suivi d'une vraie application.
doitDonner("lance Spotify", { action: "open_app", app_name: "Spotify" })
doitDonner("ouvre Apple Music", { action: "open_app", app_name: "Apple music" })

console.log("\n— Une phrase n'est pas un nom d'application —")

// `executerActionTelephone` rapproche le texte des apps installées de façon
// floue : il trouve TOUJOURS quelque chose. Une phrase doit donc être
// arrêtée ici, pas plus loin.
doitLaisserPasser(
  "lance la procédure de sauvegarde du serveur avant ce soir",
  "dix mots ne sont pas un nom d'application",
)
doitLaisserPasser(
  "ouvre le dossier, prends la facture et envoie-la",
  "une phrase ponctuée n'est pas un nom d'application",
)

console.log("\n— Ce qu'il doit laisser au serveur, plutôt que de deviner —")

doitLaisserPasser("c'est quoi la capitale de l'Australie", "question de culture générale")
doitLaisserPasser(
  "note que Dylan est le client de Melissa et qu'il faut toujours le rappeler avant midi",
  "une information sur quelqu'un, pas une tâche",
)
doitLaisserPasser("marque le truc bidule comme fait", "aucune tâche ne correspond")
doitLaisserPasser("ajoute un rendez-vous avec Yoni", "un rendez-vous sans date n'a pas de sens")
doitLaisserPasser("", "phrase vide")
doitLaisserPasser("euh", "un mot isolé qui ne veut rien dire")

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
