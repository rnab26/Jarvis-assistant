/**
 * Vérifie sur la VRAIE base que le repère « déjà vu » du cockpit suit son
 * compte, et seulement le sien.
 *
 *   ANON_KEY=... node scripts/verifier-visite-cockpit.mjs
 *
 * Chantier ae0f3a7b. Le repère vivait dans le seul localStorage : il appuyait
 * sur « Vu » sur le téléphone, et le site lui réannonçait les quatorze mêmes
 * chantiers livrés. La décision (quel repère l'emporte, que faire d'une panne
 * de lecture) se vérifie hors ligne, dans
 * `scripts/verifier-depuis-derniere-visite.ts`. Ce qui ne peut se vérifier que
 * sur la base est ici :
 *
 * 1. Le repère NE RECULE JAMAIS, et c'est la fonction SQL qui le garantit —
 *    pas le client. Deux écrans ouverts en même temps, celui qu'on quitte en
 *    dernier ne doit pas effacer le passage de l'autre.
 * 2. Une policy RLS mal posée ne lève AUCUNE erreur : elle rend simplement des
 *    lignes qu'elle ne devrait pas. D'où deux utilisateurs.
 *
 * Deux utilisateurs de test éphémères sont créés puis supprimés. Rien ne
 * touche aux données de Raphaël.
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

const marquer = async (jeton, quand) => {
  const r = await commeUtilisateur(jeton, "rpc/marquer_cockpit_vu", {
    method: "POST",
    body: JSON.stringify(quand ? { p_vu_at: quand } : {}),
  })
  return { ok: r.ok, statut: r.status, corps: await r.json().catch(() => null) }
}

const lireVisite = async (jeton) => {
  const r = await commeUtilisateur(jeton, "visites_cockpit?select=vu_at")
  return r.ok ? await r.json() : null
}

const TOT = "2026-09-01T08:00:00+00:00"
const TARD = "2026-09-05T20:00:00+00:00"

const a = await creerUtilisateur()
const b = await creerUtilisateur()

try {
  verifier(
    "un compte neuf n'a aucun repère",
    (await lireVisite(a.jeton))?.length === 0,
    "sans ça, la première ouverture annoncerait tout le cockpit comme nouveau",
  )

  const pose = await marquer(a.jeton, TARD)
  verifier("appuyer sur « Vu » enregistre le passage", pose.ok, JSON.stringify(pose))
  verifier(
    "et il se relit tel quel depuis un autre écran",
    (await lireVisite(a.jeton))?.[0]?.vu_at === TARD,
    JSON.stringify(await lireVisite(a.jeton)),
  )

  // LE POINT QUI COMPTE : c'est le SQL qui empêche le recul, pas le client.
  // Deux écrans ouverts, celui qu'on quitte en dernier porte une date plus
  // ancienne — et ne doit pas effacer le passage de l'autre.
  await marquer(a.jeton, TOT)
  verifier(
    "un « Vu » plus ANCIEN ne fait pas reculer le repère",
    (await lireVisite(a.jeton))?.[0]?.vu_at === TARD,
    "deux écrans ouverts, et le cockpit réannoncerait ce qu'il vient de voir",
  )

  verifier(
    "le repère de l'un n'est pas visible par l'autre",
    (await lireVisite(b.jeton))?.length === 0,
    "une RLS mal posée ne lève aucune erreur : elle rend des lignes en trop",
  )

  await marquer(b.jeton, TOT)
  verifier(
    "et chacun garde le sien",
    (await lireVisite(a.jeton))?.[0]?.vu_at === TARD &&
      (await lireVisite(b.jeton))?.[0]?.vu_at === TOT,
  )

  const sansJeton = await fetch(`${URL_PROJET}/rest/v1/visites_cockpit?select=vu_at`, {
    headers: { apikey: ANON },
  })
  verifier(
    "sans être connecté, on ne lit rien",
    (await sansJeton.json().catch(() => []))?.length === 0,
    "le repère dit quand il regarde son cockpit : ça ne regarde personne d'autre",
  )
} finally {
  await admin(`/auth/v1/admin/users/${a.id}`, { method: "DELETE" })
  await admin(`/auth/v1/admin/users/${b.id}`, { method: "DELETE" })
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
