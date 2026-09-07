/**
 * Vérifie sur la vraie base que `signaler_erreur` gère `correction_suggeree`
 * comme prévu (chantier 89c3ceca) :
 *
 *   node scripts/verifier-correction-suggeree.mjs
 *
 * Ce que `verifier-retours.ts` ne peut pas prouver : le comportement RÉEL de
 * la fonction SQL (upsert, RLS via auth.uid()) — pas seulement la décision
 * côté client. Utilisateur de test éphémère, créé puis supprimé.
 */
import { execFileSync } from "node:child_process"

const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANON || !SERVICE) {
  console.error("Il manque ANON_KEY et/ou SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(2)
}

let echecs = 0
function verifier(nom, ok, detail = "") {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

function sql(requete) {
  const sortie = execFileSync("scripts/sql.sh", [requete], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  const reponse = JSON.parse(sortie)
  if (!reponse.ok) throw new Error(`SQL en échec : ${sortie}`)
  return reponse.rows ?? []
}

async function admin(chemin, options = {}) {
  const r = await fetch(`${URL_PROJET}${chemin}`, {
    ...options,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...options.headers },
  })
  return { statut: r.status, corps: await r.json().catch(() => null) }
}

const email = `essai-correction-suggeree-${Date.now()}@jarvis-test.local`
const motDePasse = crypto.randomUUID()

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

async function rpc(nom, corps = {}) {
  const r = await fetch(`${URL_PROJET}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  })
  return await r.json()
}

// Première occurrence, avec une suggestion.
await rpc("signaler_erreur", {
  p_categorie: "action",
  p_titre: "Contrôle : ouvrir la mauvaise application",
  p_detail: null,
  p_contexte: "Ouvre Spotify.",
  p_source: "manuel",
  p_correction_suggeree: "Tu as ouvert Deezer au lieu de Spotify, c'est Spotify qu'il fallait ouvrir.",
})

const [apres1] = sql(
  `select correction, correction_suggeree, occurrences from jarvis_erreurs where user_id = '${userId}' and titre = 'Contrôle : ouvrir la mauvaise application'`,
)
verifier(
  "la première occurrence enregistre la suggestion",
  apres1?.correction_suggeree === "Tu as ouvert Deezer au lieu de Spotify, c'est Spotify qu'il fallait ouvrir.",
  JSON.stringify(apres1),
)
verifier("et ne pose AUCUNE correction toute seule", apres1?.correction === null, JSON.stringify(apres1))

// Deuxième occurrence, une suggestion différente : elle doit RAFRAÎCHIR la
// suggestion, puisqu'aucune correction n'a encore été adoptée.
await rpc("signaler_erreur", {
  p_categorie: "action",
  p_titre: "Contrôle : ouvrir la mauvaise application",
  p_detail: null,
  p_contexte: "Ouvre Spotify.",
  p_source: "manuel",
  p_correction_suggeree: "Non, ce n'est pas Deezer, c'est bien Spotify qu'il fallait lancer.",
})
const [apres2] = sql(
  `select correction, correction_suggeree, occurrences from jarvis_erreurs where user_id = '${userId}' and titre = 'Contrôle : ouvrir la mauvaise application'`,
)
verifier(
  "une occurrence de plus rafraîchit la suggestion",
  apres2?.correction_suggeree === "Non, ce n'est pas Deezer, c'est bien Spotify qu'il fallait lancer.",
  JSON.stringify(apres2),
)
verifier("les deux occurrences ont bien fait une seule ligne", apres2?.occurrences === 2, JSON.stringify(apres2))

// Adoption manuelle (ce que fait le bouton « Adopter » du cockpit) : une fois
// `correction` posée, une nouvelle occurrence ne doit PLUS écraser la
// suggestion (qui vaut alors null) avec une nouvelle proposition.
sql(
  `update jarvis_erreurs set correction = 'Toujours ouvrir Spotify, jamais Deezer.', correction_suggeree = null where user_id = '${userId}' and titre = 'Contrôle : ouvrir la mauvaise application'`,
)
await rpc("signaler_erreur", {
  p_categorie: "action",
  p_titre: "Contrôle : ouvrir la mauvaise application",
  p_detail: null,
  p_contexte: "Ouvre Spotify.",
  p_source: "manuel",
  p_correction_suggeree: "Encore une suggestion, qui ne devrait plus jamais être écrite.",
})
const [apres3] = sql(
  `select correction, correction_suggeree from jarvis_erreurs where user_id = '${userId}' and titre = 'Contrôle : ouvrir la mauvaise application'`,
)
verifier(
  "une correction déjà adoptée n'est jamais écrasée par une nouvelle suggestion",
  apres3?.correction === "Toujours ouvrir Spotify, jamais Deezer." && apres3?.correction_suggeree === null,
  JSON.stringify(apres3),
)

// Un appel SANS suggestion (le cas de tous les autres appelants existants,
// comme `_shared/pannes.ts`) ne doit rien casser : c'est le paramètre par
// défaut qui doit tenir.
await rpc("signaler_erreur", {
  p_categorie: "serveur",
  p_titre: "Contrôle : panne sans suggestion",
  p_detail: "Détail.",
  p_contexte: null,
  p_source: "manuel",
})
const [sansSuggestion] = sql(
  `select correction_suggeree from jarvis_erreurs where user_id = '${userId}' and titre = 'Contrôle : panne sans suggestion'`,
)
verifier(
  "un appel sans le nouveau paramètre marche toujours (défaut null)",
  sansSuggestion?.correction_suggeree === null,
  JSON.stringify(sansSuggestion),
)

// Deux occurrences de catégorie « action » sans correction ouvrent un
// chantier tout seul (`signaler_erreur`, migration 0031) — c'est le
// comportement normal, pas un effet de bord de ce contrôle. Mais un dev_item
// encore lié à cet utilisateur de test fait échouer la suppression de son
// compte (`dev_items_supprimes` a sa propre clé étrangère vers auth.users,
// et son trigger BEFORE DELETE peut se heurter à l'ordre de la cascade) : on
// le nettoie explicitement avant de supprimer le compte, plutôt que de
// laisser un chantier de test dans le vrai cockpit de Raphaël.
sql(`delete from dev_items where user_id = '${userId}'`)

await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
const restes = sql(`select count(*)::int as n from jarvis_erreurs where user_id = '${userId}'`)
verifier("l'utilisateur de test et ses erreurs sont bien supprimés", restes[0].n === 0, `${restes[0].n} restant(s)`)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
