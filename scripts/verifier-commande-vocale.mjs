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
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 0)

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
const CONTACTS = [
  { id: "ct-yoni", name: "Yoni", notes: "Chef de chantier", phone: "0612345678" },
  { id: "ct-dylan", name: "Dylan", notes: "Client de Melissa, villa Dan", phone: null },
]

let PRONONCIATIONS = []

async function demander(phrase) {
  const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: phrase,
      categories: [], tasks: TACHES, devItems: CHANTIERS, themes: THEMES, documents: [], contacts: CONTACTS,
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
    nom: "retenir le numéro dicté d'un contact existant",
    phrase: "Le numéro de Dylan c'est le 07 88 99 00 11.",
    controle: (r) => {
      const a = (r.actions ?? []).find((x) => x.action === "update_contact")
      if (!a) return [false, `actions : ${JSON.stringify((r.actions ?? []).map((x) => x.action))}`]
      if (a.contact_id !== "ct-dylan") return [false, `contact_id = ${a.contact_id}`]
      const tel = (a.changes?.phone ?? "").replace(/\D/g, "")
      if (tel !== "0788990011") return [false, `changes = ${JSON.stringify(a.changes)}`]
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
)

// L'offre gratuite de Gemini compte les requêtes À LA MINUTE (cinq pour
// gemini-3.5-flash, mesuré le 3 sept.). Envoyer les vingt-cinq cas en rafale
// sature le quota et fait échouer la vérification pour une raison qui n'a
// rien à voir avec le code. On respire entre deux cas ; PAUSE_MS=0 pour
// retrouver l'ancien comportement quand le modèle n'a pas cette limite.
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 4000)
const respirer = (ms) => new Promise((r) => setTimeout(r, ms))

let premier = true
for (const c of cas) {
<<<<<<< HEAD
  if (!premier && PAUSE_MS > 0) await respirer(PAUSE_MS)
  premier = false
=======
  if (PAUSE_MS) await new Promise((r) => setTimeout(r, PAUSE_MS))
>>>>>>> 9905691194dd9f685e9f7a5353de1d85d52bb3fa
  c.avant?.()
  const r = await demander(c.phrase)
  if (r.error) { verifier(c.nom, false, `erreur serveur : ${r.error}`); continue }
  const [ok, detail] = c.controle(r)
  verifier(c.nom, ok, detail)
  if (!ok) console.log("      réponse :", JSON.stringify(r.actions ?? r).slice(0, 400))
}

await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
