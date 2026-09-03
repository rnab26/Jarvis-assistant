/**
 * Vérifie que le branchement du compte Google est correctement câblé.
 *
 *   ANON_KEY=... node scripts/verifier-connexion-google.mjs
 *
 * Ce que ça prouve, sans toucher au compte de Raphaël : la fonction
 * google-oauth demande bien une autorisation, avec l'adresse de retour EXACTE
 * enregistrée chez Google, les bons droits, et de quoi rester connecté
 * durablement. Et surtout : que Google accepte cette demande telle quelle.
 *
 * Écrit après une panne réelle (3 sept. 2026). La fonction déduisait son
 * adresse de retour de la requête reçue ; le runtime de Supabase ne lui donne
 * pas le domaine public, Google recevait donc une adresse inconnue et
 * refusait avec « Erreur 400 : redirect_uri_mismatch » — avant même
 * d'afficher l'écran d'autorisation. Un utilisateur de test éphémère est créé
 * puis supprimé ; aucune donnée réelle n'est touchée.
 */
const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ATTENDU = `${URL_PROJET}/functions/v1/google-oauth/callback`
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

const email = `essai-${Date.now()}@jarvis-test.local`
const motDePasse = crypto.randomUUID()
const cree = await (
  await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: motDePasse, email_confirm: true }),
  })
).json()
if (!cree?.id) {
  console.error("création de l'utilisateur de test impossible", cree)
  process.exit(1)
}

try {
  const jeton = (
    await (
      await fetch(`${URL_PROJET}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: motDePasse }),
      })
    ).json()
  ).access_token

  const reponse = await fetch(`${URL_PROJET}/functions/v1/google-oauth/start`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_to: "https://rnab26.github.io/Jarvis-assistant/" }),
  })
  const corps = await reponse.json()

  if (!corps.url) {
    verifier("la fonction rend une adresse d'autorisation", false, JSON.stringify(corps))
  } else {
    const u = new URL(corps.url)
    const scopes = u.searchParams.get("scope") ?? ""

    verifier(
      "l'adresse de retour est celle enregistrée chez Google",
      u.searchParams.get("redirect_uri") === ATTENDU,
      `envoyé « ${u.searchParams.get("redirect_uri")} », attendu « ${ATTENDU} »`,
    )
    verifier("les droits agenda sont demandés", scopes.includes("calendar.events"), scopes)
    verifier("les droits Gmail sont demandés", scopes.includes("gmail.modify"), scopes)
    verifier(
      "la connexion sera durable (sinon elle meurt au bout d'une heure)",
      u.searchParams.get("access_type") === "offline" && u.searchParams.get("prompt") === "consent",
      `access_type=${u.searchParams.get("access_type")} prompt=${u.searchParams.get("prompt")}`,
    )

    // Le contrôle qui compte vraiment : Google accepte-t-il cette demande ?
    //
    // CE QUE CE CONTRÔLE NE DIT PAS. Il suit l'URL sans session Google, donc
    // il s'arrête à l'écran de connexion. Ça prouve que le client_id et
    // l'adresse de retour sont valides — les deux refus qui arrivent AVANT
    // toute connexion. Ça ne prouve pas que l'application est publiée en
    // production, ni que le compte de Raphaël figure parmi les utilisateurs
    // de test : ces deux refus-là (« Accès bloqué ») ne surviennent qu'après
    // l'identification, hors de portée d'un script. Vert ici ne dispense donc
    // pas de vérifier en base que google_accounts a bien reçu une ligne.
    const chezGoogle = await fetch(corps.url, { redirect: "follow" })
    const page = await chezGoogle.text()
    const refus = /redirect_uri_mismatch|Acc%C3%A8s bloqu|Accès bloqué|invalid_client|access_blocked/i.test(page)
    verifier(
      "Google accepte la demande d'autorisation",
      chezGoogle.status === 200 && !refus,
      `HTTP ${chezGoogle.status}${refus ? " — Google refuse (voir redirect_uri / client_id)" : ""}`,
    )
  }
} finally {
  await admin(`/auth/v1/admin/users/${cree.id}`, { method: "DELETE" })
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
