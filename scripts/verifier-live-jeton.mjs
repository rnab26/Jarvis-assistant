/**
 * Vérifie que la fonction déployée `live-jeton` rend bien un jeton éphémère
 * Gemini à un utilisateur connecté — et rien à un utilisateur anonyme.
 *
 *   ANON_KEY=... node scripts/verifier-live-jeton.mjs
 *
 * Utilisateur de test éphémère, créé puis supprimé (SUPABASE_SERVICE_ROLE_KEY
 * fournie par l'environnement). Un jeton obtenu prouve : la fonction démarre,
 * le SDK Gemini tourne dans l'Edge Function, la clé est acceptée par Google
 * en v1alpha, et l'offre gratuite délivre des jetons Live.
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
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

async function admin(chemin, options = {}) {
  const r = await fetch(`${URL_PROJET}${chemin}`, {
    ...options,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...options.headers },
  })
  return { statut: r.status, corps: await r.json().catch(() => null) }
}

async function appeler(jeton) {
  const r = await fetch(`${URL_PROJET}/functions/v1/live-jeton`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jeton ?? ANON}`, "Content-Type": "application/json", "x-jarvis-essai": "1" },
    body: "{}",
  })
  return { statut: r.status, corps: await r.json().catch(() => null) }
}

// Anonyme : refusé.
const anonyme = await appeler(null)
verifier("un anonyme n'obtient pas de jeton", anonyme.statut === 401, `HTTP ${anonyme.statut} ${JSON.stringify(anonyme.corps)}`)

// Utilisateur de test.
const email = `essai-${Date.now()}@jarvis-test.local`
const motDePasse = crypto.randomUUID()
const cree = await admin("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email, password: motDePasse, email_confirm: true }),
})
if (!cree.corps?.id) { console.error("création impossible", cree); process.exit(1) }
const userId = cree.corps.id
try {
  const connexion = await fetch(`${URL_PROJET}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: motDePasse }),
  })
  const jetonUtilisateur = (await connexion.json()).access_token
  verifier("connexion de l'utilisateur de test", Boolean(jetonUtilisateur))

  const t0 = Date.now()
  const r = await appeler(jetonUtilisateur)
  const duree = Date.now() - t0
  verifier("la fonction répond 200", r.statut === 200, `HTTP ${r.statut} ${JSON.stringify(r.corps)}`)
  verifier("un jeton Live est rendu", typeof r.corps?.jeton === "string" && r.corps.jeton.startsWith("auth_tokens/"), JSON.stringify(r.corps))
  verifier("le modèle Live est annoncé", typeof r.corps?.modele === "string" && r.corps.modele.length > 0)
  verifier("en moins de 8 s", duree < 8000, `${duree} ms`)
  console.log(`      modèle : ${r.corps?.modele} — ${duree} ms`)
} finally {
  await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
