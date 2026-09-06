/**
 * Vérifie sur la VRAIE base que rien de ce qu'on écrit dans un chantier ne se
 * perd, quel que soit le chemin d'écriture.
 *
 *   ANON_KEY=... node scripts/verifier-historique-reel.mjs
 *
 * La lecture d'une ligne d'historique se vérifie hors ligne
 * (`verifier-historique-chantier.ts`). Ce qui ne peut se vérifier qu'ici :
 *
 * 1. Le TRIGGER enregistre, et il enregistre depuis N'IMPORTE QUEL chemin —
 *    c'est toute la raison d'avoir mis la trace en base plutôt que dans l'app.
 * 2. Les RÉSERVATIONS ne sont PAS enregistrées. `claim_dev_item` tourne à
 *    chaque passe autonome, toutes les heures : les tracer noierait en un jour
 *    les changements qui comptent.
 * 3. Restaurer une note laisse elle-même une trace, sinon on remplace une
 *    perte par une autre.
 * 4. Une policy RLS mal posée ne lève AUCUNE erreur : elle rend simplement des
 *    lignes qu'elle ne devrait pas.
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

const historique = async (jeton, itemId) => {
  const r = await commeUtilisateur(
    jeton,
    `dev_items_historique?item_id=eq.${itemId}&select=*&order=change_at.desc`,
  )
  return r.ok ? await r.json() : []
}

const NOTE_ORIGINE =
  "[LIBRE] Ses mots du 3 sept. : « il faut que Jarvis sache lancer une musique précise ». " +
  "Écarté : passer par l'API Spotify, il ne l'a pas. Reste à essayer l'intent MediaStore."

const a = await creerUtilisateur()
const b = await creerUtilisateur()
let itemId = null

try {
  const [item] = await (
    await commeUtilisateur(a.jeton, "dev_items", {
      method: "POST",
      body: JSON.stringify({
        user_id: a.id,
        title: "Essai d'historique",
        notes: NOTE_ORIGINE,
        status: "todo",
        priority: "normal",
        theme: "Essai",
      }),
    })
  ).json()
  itemId = item?.id
  verifier("créer un chantier d'essai", !!itemId, JSON.stringify(item))

  verifier(
    "une CRÉATION n'écrit pas d'historique",
    (await historique(a.jeton, itemId)).length === 0,
    "chaque chantier neuf ouvrirait sa liste avec une ligne qui n'apprend rien",
  )

  // 1. La trace vient du trigger : elle existe quel que soit le chemin.
  await commeUtilisateur(a.jeton, `dev_items?id=eq.${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "in_progress", priority: "high" }),
  })
  const apresStatut = await historique(a.jeton, itemId)
  verifier(
    "un changement de statut ET de priorité fait DEUX lignes",
    apresStatut.length === 2,
    JSON.stringify(apresStatut.map((l) => l.champ)),
  )
  verifier(
    "et chacune porte l'avant et l'après",
    apresStatut.some((l) => l.champ === "status" && l.avant === "todo" && l.apres === "in_progress"),
    JSON.stringify(apresStatut),
  )

  // 2. La réservation ne doit RIEN écrire.
  const avantClaim = (await historique(a.jeton, itemId)).length
  await commeUtilisateur(a.jeton, "rpc/claim_dev_item", {
    method: "POST",
    body: JSON.stringify({ p_item: itemId, p_session: "claude/essai", p_minutes: 5 }),
  })
  verifier(
    "réserver le chantier n'écrit AUCUNE ligne",
    (await historique(a.jeton, itemId)).length === avantClaim,
    "une passe autonome par heure noierait l'historique en une journée",
  )

  // 3. La note écrasée, puis rendue.
  await commeUtilisateur(a.jeton, `dev_items?id=eq.${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ notes: "Fait. Commit abc1234." }),
  })
  const lignes = await historique(a.jeton, itemId)
  const ecrasement = lignes.find((l) => l.champ === "notes")
  verifier(
    "réécrire une note garde le texte d'AVANT, en entier",
    ecrasement?.avant === NOTE_ORIGINE,
    JSON.stringify(ecrasement?.avant?.slice(0, 80)),
  )

  const restaure = await commeUtilisateur(a.jeton, "rpc/restaurer_note_chantier", {
    method: "POST",
    body: JSON.stringify({ p_historique: ecrasement.id }),
  })
  verifier("restaurer la note répond", restaure.ok, `${restaure.status}`)

  const [relu] = await (
    await commeUtilisateur(a.jeton, `dev_items?id=eq.${itemId}&select=notes`)
  ).json()
  verifier(
    "et la note d'avant est bien revenue",
    relu?.notes === NOTE_ORIGINE,
    JSON.stringify(relu?.notes?.slice(0, 80)),
  )
  verifier(
    "LA RESTAURATION EST ELLE AUSSI TRACÉE",
    (await historique(a.jeton, itemId)).filter((l) => l.champ === "notes").length === 2,
    "sans ça, on remplacerait une perte par une autre",
  )

  // Ce qui n'est pas une note ne se restaure pas : rendre un ancien statut
  // sans le dire ferait mentir le tableau.
  const statutLigne = (await historique(a.jeton, itemId)).find((l) => l.champ === "status")
  const refus = await commeUtilisateur(a.jeton, "rpc/restaurer_note_chantier", {
    method: "POST",
    body: JSON.stringify({ p_historique: statutLigne.id }),
  })
  verifier("on ne restaure QUE des notes", !refus.ok, `${refus.status}`)

  // 4. Le cloisonnement.
  verifier(
    "l'historique de l'un n'est pas visible par l'autre",
    (await historique(b.jeton, itemId)).length === 0,
    "une RLS mal posée ne lève aucune erreur : elle rend des lignes en trop",
  )
  const ecritureDirecte = await commeUtilisateur(b.jeton, "dev_items_historique", {
    method: "POST",
    body: JSON.stringify({ item_id: itemId, user_id: b.id, champ: "notes", avant: "faux" }),
  })
  verifier(
    "et personne n'écrit à la main dans l'historique",
    !ecritureDirecte.ok,
    "une ligne qu'on pourrait fabriquer ne prouverait rien",
  )

  // La suppression du chantier emporte son historique : pas de trace orpheline
  // qui garderait le texte d'un chantier qu'il a voulu effacer.
  await commeUtilisateur(a.jeton, `dev_items?id=eq.${itemId}`, { method: "DELETE" })
  verifier(
    "supprimer le chantier emporte son historique",
    (await historique(a.jeton, itemId)).length === 0,
    "un chantier supprimé laisserait son texte derrière lui",
  )
  itemId = null
} finally {
  if (itemId) await admin(`/rest/v1/dev_items?id=eq.${itemId}`, { method: "DELETE" })
  await admin(`/auth/v1/admin/users/${a.id}`, { method: "DELETE" })
  await admin(`/auth/v1/admin/users/${b.id}`, { method: "DELETE" })
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
