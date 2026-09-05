/**
 * Vérification bout-en-bout de la Edge Function voice-command.
 *
 *   ANON_KEY=... node scripts/verifier-commande-vocale.mjs
 *
 * Interroge la fonction RÉELLEMENT DÉPLOYÉE avec un utilisateur de test
 * éphémère, créé puis supprimé : rien ne touche aux données de Raphaël. Les
 * tâches et chantiers envoyés sont fictifs, la fonction ne fait que les lire.
 *
 * À relancer après tout changement de la Edge Function — c'est le seul moyen
 * de savoir si le modèle suit encore la consigne, un typecheck ne dit rien
 * là-dessus.
 *
 * ANON_KEY est la clé publique du projet (celle qui part déjà dans le bundle
 * du site) — jamais la clé de service. Pour la retrouver : outil MCP Supabase
 * get_publishable_keys, ou la variable VITE_SUPABASE_ANON_KEY du déploiement.
 * SUPABASE_SERVICE_ROLE_KEY vient de l'environnement, elle sert uniquement à
 * créer et supprimer l'utilisateur de test.
 *
 * FONCTION=voice-command-essai permet de viser une autre fonction déployée.
 * PAUSE_MS=4000 espace les contrôles : l'offre gratuite de Gemini limite les
 * requêtes par minute, et 25 phrases en rafale mesurent ce quota au lieu du
 * comportement de Jarvis. Raphaël, lui, ne dicte pas 25 phrases par minute.
 */
const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const FONCTION = process.env.FONCTION ?? "voice-command"
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 4000)

if (!ANON || !SERVICE) {
  console.error("Il manque ANON_KEY et/ou SUPABASE_SERVICE_ROLE_KEY (voir l'en-tête du fichier).")
  process.exit(2)
}

const email = `essai-${Date.now()}@jarvis-test.local`
const motDePasse = crypto.randomUUID()

async function admin(chemin, options = {}) {
  const r = await fetch(`${URL_PROJET}${chemin}`, {
    ...options,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...options.headers },
  })
  return { statut: r.status, corps: await r.json().catch(() => null) }
}

const cree = await admin("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email, password: motDePasse, email_confirm: true }),
})
if (!cree.corps?.id) { console.error("création impossible", cree); process.exit(1) }
const userId = cree.corps.id

const connexion = await fetch(`${URL_PROJET}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: motDePasse }),
})
const jeton = (await connexion.json()).access_token
if (!jeton) { console.error("connexion impossible"); process.exit(1) }

// Données de contexte plausibles, dans le format que l'app envoie.
const TACHES = [
  { id: "t-plombier", title: "Appeler le plombier", notes: "Pour la fuite sous l'évier de la cuisine", category_id: null, status: "todo", due_date: null, due_time: null },
  { id: "t-facture", title: "Payer la facture d'électricité", notes: null, category_id: null, status: "todo", due_date: "2026-09-10", due_time: null },
  { id: "t-carreaux", title: "Commander les carreaux", notes: "Chantier villa Dan, 40 m2 de gres cerame", category_id: null, status: "done", due_date: null, due_time: null },
]
const CHANTIERS = [
  { id: "c-micro", title: "Micro", notes: "Le micro se coupe entre les phrases", status: "todo", priority: "normal", theme: "Voix et écoute" },
  { id: "c-widget", title: "Widget", notes: null, status: "todo", priority: "low", theme: "L'app elle-même" },
]
const THEMES = ["Voix et écoute", "L'app elle-même"]
// « Entraînement » est DÉCLARÉE et ne porte aucun chantier : c'est le cas qui
// a motivé le chantier a4348872. Elle n'apparaît donc pas dans THEMES.
const SECTIONS = [
  { id: "sec-entrainement", nom: "Entraînement" },
  { id: "sec-app", nom: "L'app elle-même" },
]
const CONTACTS = [
  { id: "ct-yoni", name: "Yoni", notes: "Chef de chantier", phone: "0612345678" },
  { id: "ct-dylan", name: "Dylan", notes: "Client de Melissa, villa Dan", phone: null },
]

let PRONONCIATIONS = []

// Cet en-tete dit a voice-command d utiliser GEMINI_API_KEY_TEST, la cle d un
// SECOND projet Google AI Studio. Le plafond de l offre gratuite Gemini se
// compte par projet : sans lui, les dix controles ci-dessous puisent dans le
// quota du jour de Raphael, et c est ce qui l a laisse sans Jarvis le 3 sept.
// 2026 a 21h28. Ne l enleve pas.
async function demander(phrase) {
  const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jeton}`,
      "Content-Type": "application/json",
      "x-jarvis-essai": "1",
    },
    body: JSON.stringify({
      transcript: phrase,
      categories: [], tasks: TACHES, devItems: CHANTIERS, themes: THEMES, sections: SECTIONS, documents: [], contacts: CONTACTS,
      placeReminders: [], pronunciations: PRONONCIATIONS,
      widgetConfig: { maxTasks: 3, urgentOnly: false, categoryId: null },
      todayISO: new Date().toISOString().slice(0, 10),
    }),
  })
  return await r.json()
}

let echecs = 0
const verifier = (nom, ok, detail) => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const cas = [
  {
    nom: "deux demandes dans une phrase",
    phrase: "Ajoute une tâche pour rappeler le carreleur, et marque la facture d'électricité comme payée.",
    controle: (r) => {
      const a = r.actions ?? []
      if (a.length !== 2) return [false, `${a.length} action(s) au lieu de 2 : ${JSON.stringify(a.map((x) => x.action))}`]
      const types = a.map((x) => x.action)
      if (!types.includes("add_task")) return [false, `pas d'ajout : ${types}`]
      if (!types.includes("update_task")) return [false, `pas de mise à jour : ${types}`]
      const maj = a.find((x) => x.action === "update_task")
      if (maj.task_id !== "t-facture") return [false, `mauvaise tâche visée : ${maj.task_id}`]
      if (maj.changes?.status !== "done") return [false, `changes inattendu : ${JSON.stringify(maj.changes)}`]
      return [true]
    },
  },
  {
    nom: "une seule demande reste une seule action",
    phrase: "Ajoute une tâche : acheter du pain demain matin.",
    controle: (r) => {
      const a = r.actions ?? []
      if (a.length !== 1) return [false, `${a.length} actions : ${JSON.stringify(a.map((x) => x.action))}`]
      if (a[0].action !== "add_task") return [false, `action ${a[0].action}`]
      return [true]
    },
  },
  {
    nom: "reprise d'une tâche déjà faite (retrouvée par sa note)",
    phrase: "Finalement il faut recommander du grès cérame pour la villa Dan, remets ça à faire.",
    controle: (r) => {
      const a = r.actions ?? []
      const maj = a.find((x) => x.action === "update_task")
      if (!maj) return [false, `aucune mise à jour : ${JSON.stringify(a.map((x) => x.action))}`]
      if (maj.task_id !== "t-carreaux") return [false, `mauvaise tâche : ${maj.task_id}`]
      if (maj.changes?.status !== "todo") return [false, `changes : ${JSON.stringify(maj.changes)}`]
      return [true]
    },
  },
  {
    nom: "compatibilité : le champ action reste renseigné",
    phrase: "Liste mes tâches.",
    controle: (r) => (r.action?.action ? [true] : [false, JSON.stringify(r).slice(0, 200)]),
  },
]

cas.push(
  {
    nom: "il retient une correction de prononciation",
    phrase: "Non, ce n'est pas Avirail, c'est Avihail, le h est muet.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "add_pronunciation")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/avirail/i.test(a.entendu ?? "")) return [false, `entendu = ${a.entendu}`]
      if (!/avihail/i.test(a.veut_dire ?? "")) return [false, `veut_dire = ${a.veut_dire}`]
      return [true]
    },
  },
  {
    nom: "il applique la correction apprise sans qu'on lui redise",
    avant: () => { PRONONCIATIONS = [{ id: "p1", entendu: "Avirail", veut_dire: "Avihail" }] },
    phrase: "Ajoute une tâche : appeler Avirail pour le devis.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "add_task")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      const texte = `${a.title ?? ""} ${a.notes ?? ""}`
      if (/avirail/i.test(texte)) return [false, `la forme fautive est restée : "${texte}"`]
      if (!/avihail/i.test(texte)) return [false, `nom corrigé absent : "${texte}"`]
      return [true]
    },
  },
)

// Le bug le plus sournois rencontré sur cette fonction : le modèle plaçait
// "priority" au premier niveau au lieu de "changes", l'app envoyait une
// modification sans aucun champ, et Jarvis confirmait quand même. Rien en
// base, rien à l'écran, et une confirmation à l'oral par-dessus. La fonction
// replie maintenant ces champs dans "changes" — ces deux contrôles sont là
// pour que ça ne reparte jamais en silence.
cas.push(
  {
    nom: "modifier la priorité d'un chantier à l'oral",
    phrase: "Passe le chantier du micro en priorité haute.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "update_dev_item")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.item_id !== "c-micro") return [false, `mauvais chantier : ${a.item_id}`]
      if (a.priority !== undefined) return [false, `priority est resté au premier niveau : ${a.priority}`]
      if (a.changes?.priority !== "high") return [false, `changes : ${JSON.stringify(a.changes)}`]
      return [true]
    },
  },
  {
    nom: "modifier le statut d'un chantier à l'oral",
    phrase: "Marque le chantier du widget comme en cours.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "update_dev_item")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.item_id !== "c-widget") return [false, `mauvais chantier : ${a.item_id}`]
      if (a.status !== undefined) return [false, `status est resté au premier niveau : ${a.status}`]
      if (a.changes?.status !== "in_progress") return [false, `changes : ${JSON.stringify(a.changes)}`]
      return [true]
    },
  },
  {
    nom: "une modification n'arrive jamais avec un changes vide",
    phrase: "Le chantier du micro, mets-le en priorité basse.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "update_dev_item")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!a.changes || Object.keys(a.changes).length === 0) {
        return [false, "changes vide : l'app ferait une mise à jour sans aucun champ"]
      }
      return [true]
    },
  },
)

// Agenda Google. Ces cas ne touchent PAS à l'agenda réel : ils vérifient
// seulement que le modèle range la demande dans le bon domaine et en extrait
// les bons champs. L'exécution, elle, passe par la fonction google-calendar.
cas.push(
  {
    nom: "agenda : consulter une journée",
    phrase: "Qu'est-ce que j'ai demain dans mon agenda ?",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "list_calendar_events")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!a.event_depuis) return [false, "aucune période de début pour « demain »"]
      return [true]
    },
  },
  {
    nom: "agenda : créer un rendez-vous à une heure dite",
    phrase: "Ajoute un rendez-vous avec Yoni mardi prochain à 14 heures.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "add_calendar_event")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/yoni/i.test(a.event_titre ?? "")) return [false, `titre = ${a.event_titre}`]
      if (!/T14:00/.test(a.event_debut ?? "")) return [false, `debut = ${a.event_debut} (14:00 attendu, en heure locale)`]
      return [true]
    },
  },
  {
    nom: "agenda : annuler en désignant le rendez-vous",
    phrase: "Annule mon rendez-vous chez le dentiste.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "delete_calendar_event")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/dentiste/i.test(a.event_cible ?? "")) return [false, `cible = ${a.event_cible}`]
      return [true]
    },
  },
  {
    nom: "agenda : une chose à faire reste une tâche, pas un événement",
    phrase: "Rappelle-moi d'appeler l'assurance, c'est à faire cette semaine.",
    controle: (r) => {
      const types = (r.actions ?? []).map((x) => x.action)
      if (types.includes("add_calendar_event")) return [false, `parti dans l'agenda : ${types}`]
      if (!types.includes("add_task")) return [false, `aucune tâche créée : ${types}`]
      return [true]
    },
  },
)

cas.push({
  nom: "un nouveau chantier est rangé dans un thème existant",
  phrase: "Ajoute un chantier : quand je chuchote, Jarvis n'entend rien du tout.",
  controle: (r) => {
    const a = (r.actions ?? []).find((x) => x.action === "add_dev_item")
    if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
    if (a.theme !== "Voix et écoute") return [false, `thème = ${JSON.stringify(a.theme)}`]
    return [true]
  },
})

cas.push(
  {
    nom: "couper la voix à l'oral",
    phrase: "Arrête de parler, réponds-moi juste à l'écrit.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "set_voice")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.voice_enabled !== false) return [false, `voice_enabled = ${a.voice_enabled}`]
      return [true]
    },
  },
  {
    nom: "remettre la voix à l'oral",
    phrase: "Tu peux reparler maintenant, remets ta voix.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "set_voice")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.voice_enabled !== true) return [false, `voice_enabled = ${a.voice_enabled}`]
      return [true]
    },
  },
)

// Actions dans les autres applications du téléphone. Le risque n'est pas
// qu'elles ne marchent pas — c'est qu'elles se déclenchent à tort : "ajoute
// une tâche : appeler le plombier" ne doit surtout pas composer un numéro.
// Le dernier cas est là pour ça.
cas.push(
  {
    nom: "mettre de la musique dans une app",
    phrase: "Mets du Brassens sur Spotify.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "open_app")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/spotify/i.test(a.app_name ?? "")) return [false, `app_name = ${a.app_name}`]
      if (!/brassens/i.test(a.music_query ?? "")) return [false, `music_query = ${a.music_query}`]
      return [true]
    },
  },
  {
    // Signalé par Raphaël le 3 sept. (capture) : sans "sur", Android ouvrait
    // son sélecteur ("Terminer l'action avec…") au lieu de jouer le morceau.
    // Le correctif vit côté app (executerActionTelephone/open_app) : ici on
    // vérifie seulement que le modèle continue de laisser app_name absent
    // quand aucune application n'est nommée, comme le décrit son schéma.
    nom: "mettre de la musique sans nommer d'application",
    phrase: "Mets-moi la musique Maes la planque.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "open_app")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.app_name) return [false, `app_name renseigné à tort : ${a.app_name}`]
      if (!/maes/i.test(a.music_query ?? "")) return [false, `music_query = ${a.music_query}`]
      return [true]
    },
  },
  {
    nom: "ouvrir une app sans rien jouer",
    phrase: "Ouvre WhatsApp.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "open_app")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/whatsapp/i.test(a.app_name ?? "")) return [false, `app_name = ${a.app_name}`]
      if (a.music_query) return [false, `music_query renseigné à tort : ${a.music_query}`]
      return [true]
    },
  },
  {
    nom: "préparer un message pour un contact connu",
    phrase: "Envoie un message à Dylan pour lui dire que je passe demain matin sur le chantier.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "send_message")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.contact_id !== "ct-dylan") return [false, `contact_id = ${a.contact_id}`]
      if (!a.message_text || a.message_text.length < 10) return [false, `message_text = ${a.message_text}`]
      return [true]
    },
  },
  {
    nom: "appeler un contact dont on a le numéro",
    phrase: "Appelle Yoni.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "call_contact")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.contact_id !== "ct-yoni" && !/0612345678/.test(a.phone_number ?? "")) {
        return [false, `ni contact_id ni numéro : ${JSON.stringify(a)}`]
      }
      return [true]
    },
  },
  {
    // Réécrit le 5 sept. 2026, après le retrait des fiches contacts. Il
    // vérifiait update_contact, une action qui n'existe plus : les numéros
    // viennent du répertoire du téléphone. Ce qui compte maintenant, c'est que
    // Jarvis NE MENTE PAS — sa première réponse après le retrait était « j'ai
    // ajouté le numéro de Dylan à sa fiche contact », alors qu'il n'avait rien
    // fait et qu'aucune fiche n'existe. Prétendre avoir enregistré quelque
    // chose est pire que de ne rien enregistrer : Raphaël s'y fie.
    nom: "un numéro dicté : il le retient sans prétendre l'avoir fiché",
    phrase: "Le numéro de Dylan c'est le 07 88 99 00 11.",
    controle: (r) => {
      const actions = (r.actions ?? []).map((x) => x.action)
      const interdites = actions.filter((a) => /contact/.test(a) && a !== "call_contact")
      if (interdites.length > 0) {
        return [false, `action de fiche contact renvoyée : ${JSON.stringify(interdites)}`]
      }
      const dit = (r.message ?? "").toLowerCase()
      if (/fiche|dans (?:tes|ses) contacts|carnet/.test(dit)) {
        return [false, `il prétend avoir fiché le numéro : « ${r.message} »`]
      }
      return [true]
    },
  },
  {
    nom: "régler une alarme à une heure précise",
    phrase: "Réveille-moi demain à 7h.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "set_alarm")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.alarm_time !== "07:00") return [false, `alarm_time = ${a.alarm_time}`]
      return [true]
    },
  },
  {
    nom: "lancer un minuteur",
    phrase: "Mets un minuteur de 10 minutes pour les pâtes.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "set_alarm")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.alarm_duration_seconds !== 600) return [false, `durée = ${a.alarm_duration_seconds}`]
      return [true]
    },
  },
  {
    nom: "ouvrir un itinéraire",
    phrase: "Emmène-moi au 12 rue de la Paix à Paris.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "navigate_to")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/rue de la paix/i.test(a.destination ?? "")) return [false, `destination = ${a.destination}`]
      return [true]
    },
  },
  {
    nom: "une tâche à faire ne déclenche AUCUNE action dans une app",
    phrase: "Ajoute une tâche : appeler le plombier et envoyer un message à Melissa.",
    controle: (r) => {
      const types = (r.actions ?? []).map((x) => x.action)
      const debordements = types.filter((t) =>
        ["call_contact", "send_message", "open_app", "navigate_to", "set_alarm"].includes(t))
      if (debordements.length > 0) return [false, `a déclenché ${debordements.join(", ")} au lieu de noter une tâche`]
      if (!types.includes("add_task")) return [false, `aucune tâche créée : ${types}`]
      return [true]
    },
  },
  {
    // Le canal n'est renseigné QUE si l'utilisateur le dit — sinon c'est le
    // téléphone qui tranche (préférence retenue, ou question posée), pas le
    // modèle qui ne doit plus se rabattre sur "whatsapp" par défaut de son
    // propre chef.
    nom: "message sans canal précisé : le modèle ne choisit pas à sa place",
    phrase: "Envoie un message à Dylan pour lui dire que je passe demain matin sur le chantier.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "send_message")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.message_channel) return [false, `message_channel renseigné à tort : ${a.message_channel}`]
      return [true]
    },
  },
  {
    nom: "message avec canal précisé : SMS explicite respecté",
    phrase: "Envoie un SMS à Dylan pour lui dire que je suis en retard.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "send_message")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.message_channel !== "sms") return [false, `message_channel = ${a.message_channel}`]
      return [true]
    },
  },
  {
    nom: "apprentissage direct : quelle app pour la navigation",
    phrase: "Utilise Waze pour la navigation.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "set_app_preference")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.category !== "navigation") return [false, `category = ${a.category}`]
      if (!/waze/i.test(a.app_name ?? "")) return [false, `app_name = ${a.app_name}`]
      return [true]
    },
  },
  {
    nom: "apprentissage direct : quel canal pour les messages",
    phrase: "Préfère les SMS pour mes messages.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "set_app_preference")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.category !== "messages") return [false, `category = ${a.category}`]
      if (!/sms/i.test(a.app_name ?? "")) return [false, `app_name = ${a.app_name}`]
      return [true]
    },
  },
  {
    nom: "relayer une question à une IA nommée",
    phrase: "Demande à Perplexity ce que vaut le grès cérame en ce moment.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "ask_ai")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/perplexity/i.test(a.app_name ?? "")) return [false, `app_name = ${a.app_name}`]
      if (!a.question || a.question.length < 5) return [false, `question = ${a.question}`]
      return [true]
    },
  },
  {
    // Même défaut potentiel que pour la musique (app_name halluciné) : ici on
    // vérifie que le modèle le laisse absent quand l'IA n'est pas nommée.
    nom: "relayer une question sans nommer l'IA",
    phrase: "Demande à une IA combien coûte un plombier à Paris.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "ask_ai")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.app_name) return [false, `app_name renseigné à tort : ${a.app_name}`]
      if (!a.question || a.question.length < 5) return [false, `question = ${a.question}`]
      return [true]
    },
  },
)

// ── Gmail. Ajoutés par la session « Messagerie et agenda ». En bloc séparé
//    volontairement : les cas de deux sessions se retrouvaient au même endroit
//    du fichier et la fusion en supprimait un jeu sur deux, sans bruit.
cas.push(
  {
    nom: "gmail : consulter ce qu'il a reçu",
    phrase: "Qu'est-ce que j'ai reçu comme mails aujourd'hui ?",
    controle: (r) => {
      const types = (r.actions ?? []).map((x) => x.action)
      if (!types.includes("list_emails")) return [false, `actions : ${JSON.stringify(types)}`]
      return [true]
    },
  },
  {
    nom: "gmail : se faire lire un message",
    phrase: "Lis-moi le mail de Yoni.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "read_email")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/yoni/i.test(a.mail_cible ?? "")) return [false, `mail_cible = ${a.mail_cible}`]
      return [true]
    },
  },
  {
    // LE contrôle qui compte : une réponse dictée se PRÉPARE. Si send_email
    // apparaît ici, Jarvis annoncerait à Raphaël un envoi en son nom qu'il n'a
    // pas relu. Le serveur le refuserait (confirme:true absent), mais la
    // promesse, elle, aurait été faite.
    nom: "gmail : une réponse dictée est préparée, JAMAIS envoyée dans le même tour",
    phrase: "Réponds au mail de Yoni que je passe sur le chantier demain matin vers neuf heures.",
    controle: (r) => {
      const types = (r.actions ?? []).map((x) => x.action)
      if (types.includes("send_email")) return [false, `ENVOI DIRECT, garde-fou franchi : ${JSON.stringify(types)}`]
      const a = (r.actions ?? []).find((x) => x.action === "prepare_email_reply")
      if (!a) return [false, `aucune préparation : ${JSON.stringify(types)}`]
      if (!a.mail_texte) return [false, "mail_texte vide : rien à lui relire"]
      return [true]
    },
  },
  {
    nom: "gmail : retrouver ses reçus",
    phrase: "Retrouve-moi les factures que j'ai reçues ce mois-ci.",
    controle: (r) => {
      const types = (r.actions ?? []).map((x) => x.action)
      if (!types.includes("find_receipts")) return [false, `actions : ${JSON.stringify(types)}`]
      return [true]
    },
  },
  {
    // Sa correction du 3 sept. : « va récupérer la facture chez ma femme ».
    // Le nom doit arriver jusqu'au serveur, qui le traduit en from:.
    nom: "gmail : un reçu cherché chez une personne précise",
    phrase: "Va me récupérer la facture que Melissa m'a envoyée.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "find_receipts")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/melissa/i.test(a.mail_recherche ?? "")) return [false, `mail_recherche = ${a.mail_recherche}`]
      return [true]
    },
  },
)

// ── Jarvis connaît sa propre application. Ajoutés par la session « Mémoire et
//    connaissance de soi ». Le 4 sept. 2026, Raphaël demande en pleine
//    conversation « où est la fenêtre de question où je dois répondre ? » et
//    Jarvis répond « je n'ai pas accès à l'interface de l'application ». Le
//    texte vit dans supabase/functions/_shared/environnement.ts, partagé avec
//    le mode Live : ces contrôles disent s'il arrive bien jusqu'au modèle.
const SANS_ACCES = /(je n'?ai pas|aucun) acc[eè]s|je ne (peux pas|sais pas) (voir|acc[eé]der)|je n'?ai pas la possibilit[eé]/i

cas.push(
  {
    nom: "il sait où Raphaël répond aux questions des sessions de développement",
    phrase: "Où est-ce que je réponds aux questions que vous me posez pendant le développement ?",
    controle: (r) => {
      const message = (r.actions ?? []).map((x) => x.message ?? "").join(" ")
      if (SANS_ACCES.test(message)) return [false, `il se dit sans accès à l'interface : "${message}"`]
      if (!/cockpit|journal/i.test(message)) return [false, `ni cockpit ni journal de bord : "${message}"`]
      return [true]
    },
  },
  {
    nom: "il sait citer les onglets de l'application",
    phrase: "Rappelle-moi les onglets de l'application.",
    controle: (r) => {
      const message = (r.actions ?? []).map((x) => x.message ?? "").join(" ")
      if (SANS_ACCES.test(message)) return [false, `il se dit sans accès à l'interface : "${message}"`]
      const onglets = ["param", "tâche|tache", "cockpit", "document", "contact", "mémoire|memoire"]
      const cites = onglets.filter((o) => new RegExp(o, "i").test(message))
      if (cites.length < 4) return [false, `${cites.length} onglet(s) sur 6 cités : "${message}"`]
      return [true]
    },
  },
  {
    nom: "il sait où se règle sa voix",
    phrase: "Où est-ce que je change ta voix ?",
    controle: (r) => {
      const message = (r.actions ?? []).map((x) => x.message ?? "").join(" ")
      if (SANS_ACCES.test(message)) return [false, `il se dit sans accès à l'interface : "${message}"`]
      if (!/param[eè]tre/i.test(message)) return [false, `l'onglet Paramètres n'est pas cité : "${message}"`]
      return [true]
    },
  },
  {
    nom: "il sait où retrouver ce qu'il a mémorisé",
    phrase: "Où je peux relire ce que tu as retenu sur moi ?",
    controle: (r) => {
      const message = (r.actions ?? []).map((x) => x.message ?? "").join(" ")
      if (SANS_ACCES.test(message)) return [false, `il se dit sans accès à l'interface : "${message}"`]
      if (!/m[eé]moire/i.test(message)) return [false, `l'onglet Mémoire n'est pas cité : "${message}"`]
      return [true]
    },
  },
)

// sature le quota et fait échouer la vérification pour une raison étrangère
// au code : d'où la pause entre deux cas, réglable par PAUSE_MS.
// ── Les sections de chantiers. Ajoutés par la session « Mémoire et
//    connaissance de soi ». Une section créée d'avance et encore vide était
//    invisible pour Jarvis : dicter « ajoute un chantier dans Entraînement »
//    en fabriquait une jumelle au lieu d'y ranger (chantier a4348872).
cas.push(
  {
    nom: "un chantier se range dans une section DÉCLARÉE mais encore vide",
    phrase: "Ajoute un chantier dans Entraînement : apprendre à Jarvis à lire mes plans.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "add_dev_item")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.theme !== "Entraînement") {
        return [false, `thème = ${JSON.stringify(a.theme)} — une section jumelle serait créée à côté de la vraie`]
      }
      return [true]
    },
  },
  {
    nom: "créer une section à la voix",
    phrase: "Crée une section Facturation clients.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "add_dev_section")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (!/facturation/i.test(a.section_nom ?? "")) return [false, `section_nom = ${a.section_nom}`]
      return [true]
    },
  },
  {
    nom: "renommer une section, en visant la bonne",
    phrase: "Renomme la section Entraînement en Formation.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "rename_dev_section")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.section_id !== "sec-entrainement") return [false, `section_id = ${a.section_id}`]
      if (!/formation/i.test(a.section_nom ?? "")) return [false, `section_nom = ${a.section_nom}`]
      return [true]
    },
  },
  {
    // SA PHRASE EXACTE du 5 sept. à 19 h 34. Résultat à l'époque : un
    // chantier « Lancer une nouvelle session pour l'intégration IA » avec le
    // thème « Intégration IA », et AUCUNE ligne dans dev_sections. La section
    // n'existait donc que comme texte libre porté par un chantier, et elle
    // aurait disparu du cockpit le jour où ce chantier serait archivé.
    nom: "« ouvre une section pour X et lance une session » crée bien la SECTION",
    phrase:
      "Ouvrir une nouvelle section de chantier pour l'intégration d'application IA et lancer une nouvelle session.",
    controle: (r) => {
      const actions = r.actions ?? []
      const a = actions.find((x) => x.action === "add_dev_section")
      if (!a) return [false, `aucune section créée : ${JSON.stringify(actions.map((x) => x.action))}`]
      if (!/ia|intelligence/i.test(a.section_nom ?? "")) return [false, `section_nom = ${a.section_nom}`]
      return [true]
    },
  },
  {
    // Jarvis ne peut pas lancer une session Claude Code. L'ignorer laissait
    // croire que c'était fait ; en faire un chantier ajoutait du bruit.
    nom: "et il dit qu'il ne sait pas lancer une session Claude Code",
    phrase:
      "Ouvrir une nouvelle section de chantier pour l'intégration d'application IA et lancer une nouvelle session.",
    controle: (r) => {
      const message = (r.actions ?? []).map((x) => x.message ?? "").join(" ")
      if (!/session/i.test(message)) return [false, `il n'en dit rien : "${message}"`]
      return [true]
    },
  },
  {
    // Supprimer une section déplace TOUS ses chantiers. À la voix il n'y a ni
    // confirmation ni bouton Annuler ; le cockpit a les deux. Jarvis doit donc
    // y renvoyer, pas le faire.
    nom: "supprimer une section n'est PAS fait à la voix, mais renvoyé au cockpit",
    phrase: "Supprime la section Entraînement.",
    controle: (r) => {
      const types = (r.actions ?? []).map((x) => x.action)
      if (types.some((t) => `${t}`.includes("section") && t !== "add_dev_section")) {
        return [false, `il a tenté une action de section : ${JSON.stringify(types)}`]
      }
      const message = (r.actions ?? []).map((x) => x.message ?? "").join(" ")
      if (!/cockpit/i.test(message)) return [false, `il ne renvoie pas au cockpit : "${message}"`]
      return [true]
    },
  },
)

// « envoie un message à Mel » (sa femme) compris comme une demande Gmail, le
// 4 sept. : « Mel » sonne comme « mail ». Sa consigne est explicite — ne pas
// coder en dur « Mel n'est pas mail », c'est une CLASSE de bug (Sam/SMS,
// Al/appel), pas un cas particulier. On vérifie donc la règle générale sur
// deux prénoms différents, dont un qui n'est dans aucune liste de contacts.
cas.push(
  {
    nom: "« envoie un message à Mel » va aux messages, pas à Gmail",
    phrase: "Envoie un message à Mel.",
    controle: (r) => {
      const types = (r.actions ?? []).map((x) => x.action)
      if (types.some((t) => `${t}`.includes("email"))) {
        return [false, `il est parti sur Gmail : ${JSON.stringify(types)}`]
      }
      if (!types.includes("send_message") && !types.includes("clarify")) {
        return [false, `ni message ni clarification : ${JSON.stringify(types)}`]
      }
      return [true]
    },
  },
  {
    nom: "et « appelle Al » reste un appel",
    phrase: "Appelle Al.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "call_contact")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      return [true]
    },
  },
)

// Un rouge qui n'est PAS un bug, et qui a déjà coûté une heure (4 sept. 2026,
// au soir) : quand le quota du jour de la clé de test est épuisé, la fonction
// répond « J'ai atteint la limite de l'offre gratuite », ou meurt en
// IDLE_TIMEOUT à 150 s en attendant un modèle saturé. Le contrôle tombe, mais
// le code est bon — les mêmes cas rejoués lentement repassent au vert. Sans ce
// relevé, on relit son diff pendant une heure pour rien.
const SIGNATURE_QUOTA = /IDLE_TIMEOUT|limite de l'offre gratuite|quota|RESOURCE_EXHAUSTED|429/i
const suspectsQuota = []

let premier = true
for (const c of cas) {
  // Rien à attendre avant le tout premier appel : la pause ne sert qu'à
  // espacer deux requêtes déjà envoyées.
  if (!premier && PAUSE_MS > 0) await new Promise((r) => setTimeout(r, PAUSE_MS))
  premier = false
  c.avant?.()
  const r = await demander(c.phrase)
  if (r.error) { verifier(c.nom, false, `erreur serveur : ${r.error}`); continue }
  const [ok, detail] = c.controle(r)
  verifier(c.nom, ok, detail)
  if (!ok) {
    console.log("      réponse :", JSON.stringify(r.actions ?? r).slice(0, 400))
    if (SIGNATURE_QUOTA.test(JSON.stringify(r))) {
      suspectsQuota.push(c.nom)
      console.log("      ↑ signature d'un quota épuisé, PAS d'un bug — voir le bilan en bas")
    }
  }
}

await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)

// Le rouge reste rouge — on ne fait jamais passer un échec pour un succès. Mais
// on dit ce qu'on a vu, pour que personne ne relise son diff pendant une heure.
if (suspectsQuota.length) {
  console.log(
    `\n${suspectsQuota.length} de ces échecs portent une signature de quota épuisé :\n` +
      suspectsQuota.map((n) => `  - ${n}`).join("\n") +
      "\n\nCe n'est PROBABLEMENT pas ton code. Avant de chercher un bug :\n" +
      "  1. rejoue-les lentement — PAUSE_MS=15000 node scripts/verifier-commande-vocale.mjs ;\n" +
      "  2. lis la ligne « quota » des journaux de la fonction : elle nomme le modèle ET son plafond ;\n" +
      "  3. le plafond du jour se compte PAR PROJET et PAR MODÈLE, et se remet à zéro à minuit heure du Pacifique.\n" +
      "S'ils repassent au vert en les espaçant, c'était le quota : note-le et passe à la suite.",
  )
}

process.exit(echecs === 0 ? 0 : 1)
