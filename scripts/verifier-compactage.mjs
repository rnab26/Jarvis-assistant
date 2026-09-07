/**
 * Vérifie sur la fonction RÉELLEMENT DÉPLOYÉE que le compactage des vieilles
 * conversations (chantier 470d9c4d) fait ce qu'il annonce :
 *
 *   ANON_KEY=... node scripts/verifier-compactage.mjs
 *
 * Un échange plus vieux que COMPACTAGE_APRES_JOURS doit devenir un RÉSUMÉ
 * (transcript réécrit, resume=true, nouvelle empreinte), jamais disparaître.
 * Un échange récent ne doit pas être touché. Utilisateur de test éphémère,
 * créé puis supprimé — rien ne touche à la mémoire de Raphaël, et l'en-tête
 * x-jarvis-essai fait utiliser la clé du second projet Google AI Studio, pas
 * son quota du jour.
 */
import { execFileSync } from "node:child_process"

const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const FONCTION = process.env.FONCTION ?? "voice-command"

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

const email = `essai-compactage-${Date.now()}@jarvis-test.local`
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

async function dire(phrase) {
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
      categories: [], tasks: [], devItems: [], themes: [], documents: [], contacts: [],
      placeReminders: [], pronunciations: [],
      widgetConfig: { maxTasks: 3, urgentOnly: false, categoryId: null },
      todayISO: new Date().toISOString().slice(0, 10),
    }),
  })
  return await r.json()
}

// Deux vieux échanges (30 jours, au-delà des 21 jours de COMPACTAGE_APRES_JOURS)
// avec un vrai contenu à condenser, et un échange RÉCENT (2 jours) qui ne doit
// pas bouger — c'est lui qui prouve que le filtre d'âge est respecté, pas
// juste que « quelque chose » a été réécrit.
const ancien1 = crypto.randomUUID()
const ancien2 = crypto.randomUUID()
const recent = crypto.randomUUID()
sql(`insert into echanges (id, user_id, transcript, reponse, created_at, source) values
  ('${ancien1}', '${userId}', 'Le budget carrelage de la villa Dan est validé à 4500 shekels, en grès cérame gris.', 'Noté, je le retiens.', now() - interval '30 days', 'serveur'),
  ('${ancien2}', '${userId}', 'Rappelle-moi d''appeler le plombier de la villa Kerouan mardi prochain à 9 heures.', 'C''est noté pour mardi 9 h.', now() - interval '28 days', 'serveur'),
  ('${recent}', '${userId}', 'Ceci est un échange récent qui ne doit pas être compacté.', 'Bien reçu.', now() - interval '2 days', 'serveur')`)

// Une phrase quelconque : ce qui nous intéresse est ce que memoriser() fait en
// tâche de fond AVANT l'extraction de ses propres faits, pas cette phrase.
await dire("Bonjour Jarvis, un contrôle automatique est en cours.")

/** Le compactage part en tâche de fond et appelle un modèle : on attend
 *  qu'il ait fini plutôt qu'un délai fixe, avec un plafond raisonnable. */
async function attendreCompactage(maxMs = 90000, pasMs = 4000) {
  const debut = Date.now()
  while (Date.now() - debut < maxMs) {
    const [ligne] = sql(`select resume from echanges where id = '${ancien1}'`)
    if (ligne?.resume) return true
    await new Promise((r) => setTimeout(r, pasMs))
  }
  return false
}

const compacte = await attendreCompactage()
verifier("le compactage a eu le temps de tourner", compacte, "resume n'est jamais passé à true sur l'échange de 30 jours")

if (compacte) {
  const [ligne1] = sql(`select transcript, reponse, resume, embedding is not null as a_empreinte from echanges where id = '${ancien1}'`)
  verifier(
    "l'échange de 30 jours est marqué comme résumé",
    ligne1?.resume === true,
  )
  verifier(
    "son transcript a été réécrit (ce n'est plus le mot-à-mot d'origine)",
    typeof ligne1?.transcript === "string" && ligne1.transcript !== "Le budget carrelage de la villa Dan est validé à 4500 shekels, en grès cérame gris.",
    `transcript actuel : « ${ligne1?.transcript} »`,
  )
  verifier(
    "le résumé garde une empreinte cherchable par le sens",
    ligne1?.a_empreinte === true,
  )
  verifier(
    "reponse est vidée (le résumé porte déjà l'essentiel des deux tours)",
    ligne1?.reponse === null,
  )

  const [ligne2] = sql(`select resume from echanges where id = '${ancien2}'`)
  verifier(
    "le second échange du même lot est compacté aussi (compactage PAR LOT, pas un par un)",
    ligne2?.resume === true,
  )

  const [ligneRecente] = sql(`select transcript, resume from echanges where id = '${recent}'`)
  verifier(
    "un échange récent (2 jours) n'est PAS touché par le compactage",
    ligneRecente?.resume === false &&
      ligneRecente?.transcript === "Ceci est un échange récent qui ne doit pas être compacté.",
    `resume=${ligneRecente?.resume}, transcript=« ${ligneRecente?.transcript} »`,
  )

  const traces = sql(
    `select verdict, nb_compactes, essai from compactages_memoire where essai = true and demarre_at > now() - interval '5 minutes' order by demarre_at desc limit 1`,
  )
  verifier(
    "la passe laisse une trace, marquée comme un essai",
    traces[0]?.verdict === "compacte" && traces[0]?.nb_compactes >= 2 && traces[0]?.essai === true,
    JSON.stringify(traces[0]),
  )
}

await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
const restes = sql(`select count(*)::int as n from echanges where user_id = '${userId}'`)
verifier("l'utilisateur de test et ses échanges sont bien supprimés", restes[0].n === 0, `${restes[0].n} restant(s)`)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
