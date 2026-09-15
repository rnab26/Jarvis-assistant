/**
 * Vérifie sur la VRAIE base qu'une suppression de tâche laisse une trace,
 * et qu'elle se restaure — chantier ouvert le 15 sept. 2026 après la perte
 * réelle d'une tâche (delete_task ciblant une mauvaise tâche parmi deux
 * homonymes, capture à l'appui).
 *
 *   ANON_KEY=... node scripts/verifier-taches-supprimees-reel.mjs
 *
 * Un utilisateur de test éphémère est créé puis supprimé. Rien ne touche
 * aux données de Raphaël.
 */
const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANON || !SERVICE) {
  console.error("Il manque ANON_KEY et/ou SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(2)
}

let echecs = 0
const verifier = (nom, ok, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const admin = (chemin, options = {}) =>
  fetch(`${URL_PROJET}${chemin}`, {
    ...options,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

async function creerUtilisateur() {
  const email = `essai-${crypto.randomUUID()}@jarvis-test.local`
  const motDePasse = crypto.randomUUID()
  const cree = await (
    await admin("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password: motDePasse, email_confirm: true }),
    })
  ).json()
  if (!cree?.id) throw new Error(`création impossible : ${JSON.stringify(cree)}`)
  const session = await (
    await fetch(`${URL_PROJET}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: motDePasse }),
    })
  ).json()
  return { id: cree.id, jeton: session.access_token }
}

const commeUtilisateur = (jeton, chemin, options = {}) =>
  fetch(`${URL_PROJET}/rest/v1/${chemin}`, {
    ...options,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jeton}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...options.headers,
    },
  })

const a = await creerUtilisateur()
const b = await creerUtilisateur()
let taskId = null

try {
  // ── Une tâche créée, supprimée, laisse une trace ──
  const cree = await (
    await commeUtilisateur(a.jeton, "tasks", {
      method: "POST",
      body: JSON.stringify({
        user_id: a.id,
        title: "Essai — trace de suppression",
        notes: "ligne de test",
        due_date: "2026-09-20",
        due_time: "15:00",
        status: "todo",
      }),
    })
  ).json()
  taskId = cree?.[0]?.id
  verifier("la tâche de test est créée", Boolean(taskId), JSON.stringify(cree))

  await commeUtilisateur(a.jeton, `tasks?id=eq.${taskId}`, { method: "DELETE" })

  const trace = await (
    await commeUtilisateur(a.jeton, `taches_supprimees?task_id=eq.${taskId}&select=*`)
  ).json()
  verifier(
    "la suppression laisse une trace, avec le bon contenu",
    trace.length === 1 &&
      trace[0].title === "Essai — trace de suppression" &&
      trace[0].due_date === "2026-09-20" &&
      trace[0].due_time?.startsWith("15:00"),
    JSON.stringify(trace),
  )
  const traceId = trace[0]?.id

  // ── Le cloisonnement RLS : b ne voit rien de la trace de a ──
  const traceVueParB = await (
    await commeUtilisateur(b.jeton, `taches_supprimees?task_id=eq.${taskId}&select=*`)
  ).json()
  verifier("un autre utilisateur ne voit pas cette trace", traceVueParB.length === 0, JSON.stringify(traceVueParB))

  // ── b ne peut pas restaurer la trace de a ──
  const restaureParB = await commeUtilisateur(b.jeton, "rpc/restaurer_tache_supprimee", {
    method: "POST",
    body: JSON.stringify({ p_id: traceId }),
  })
  verifier("un autre utilisateur ne peut pas la restaurer", !restaureParB.ok, `status ${restaureParB.status}`)

  // ── a restaure sa propre tâche ──
  const restaure = await commeUtilisateur(a.jeton, "rpc/restaurer_tache_supprimee", {
    method: "POST",
    body: JSON.stringify({ p_id: traceId }),
  })
  const nouvelId = await restaure.json()
  verifier("la restauration réussit et rend un nouvel id", restaure.ok && typeof nouvelId === "string", JSON.stringify(nouvelId))

  const restauree = await (
    await commeUtilisateur(a.jeton, `tasks?id=eq.${nouvelId}&select=*`)
  ).json()
  verifier(
    "la tâche restaurée reprend titre, notes, échéance",
    restauree.length === 1 &&
      restauree[0].title === "Essai — trace de suppression" &&
      restauree[0].due_date === "2026-09-20" &&
      restauree[0].due_time?.startsWith("15:00"),
    JSON.stringify(restauree),
  )

  const traceApresRestauration = await (
    await commeUtilisateur(a.jeton, `taches_supprimees?id=eq.${traceId}&select=*`)
  ).json()
  verifier(
    "la restauration efface la trace, pour ne pas recréer la même tâche deux fois",
    traceApresRestauration.length === 0,
    JSON.stringify(traceApresRestauration),
  )

  // Ménage : la tâche restaurée aussi.
  await commeUtilisateur(a.jeton, `tasks?id=eq.${nouvelId}`, { method: "DELETE" })
} finally {
  await admin(`/auth/v1/admin/users/${a.id}`, { method: "DELETE" })
  await admin(`/auth/v1/admin/users/${b.id}`, { method: "DELETE" })
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
