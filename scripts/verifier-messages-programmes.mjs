/**
 * Vérifie la table des messages programmés : le cycle complet, et surtout son
 * cloisonnement.
 *
 *   ANON_KEY=... node scripts/verifier-messages-programmes.mjs
 *
 * POURQUOI CE CONTRÔLE EXISTE. Cette table portera des messages que Raphaël
 * fait écrire à quelqu'un — son client, sa femme, un fournisseur. Deux façons
 * de la casser en silence :
 *   — une policy RLS mal posée, et un utilisateur voit ou modifie les messages
 *     d'un autre. Ça ne lève AUCUNE erreur : la lecture rend simplement des
 *     lignes qu'elle ne devrait pas. D'où deux utilisateurs de test ici, et
 *     pas un seul.
 *   — le passage de « annoncé » à « envoyé » confondu avec un seul état, et
 *     un message que Jarvis a annoncé sans réponse disparaîtrait de sa liste
 *     comme s'il était parti.
 *
 * Deux utilisateurs de test éphémères sont créés puis supprimés. Rien ne touche
 * aux données de Raphaël, et AUCUN message n'est envoyé — cette table ne sait
 * pas envoyer, c'est justement le point.
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

/** Requête PostgREST avec le jeton d'un utilisateur : c'est la RLS qui décide,
 * exactement comme depuis l'app. */
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

try {
  const dans2h = new Date(Date.now() + 2 * 3600_000).toISOString()

  // ── Le cycle, du côté du propriétaire ──
  const r = await commeUtilisateur(a.jeton, "messages_programmes", {
    method: "POST",
    body: JSON.stringify({
      user_id: a.id,
      destinataire: "le client de Melissa",
      texte: "Où en est ton chantier ?",
      envoyer_a: dans2h,
    }),
  })
  const [cree] = r.ok ? await r.json() : []
  verifier("programmer un message", r.ok && !!cree?.id, `HTTP ${r.status}`)
  if (!cree?.id) throw new Error("rien à vérifier plus loin")

  verifier(
    "le canal reste vide tant qu'il ne l'a pas dit",
    cree.canal === null,
    `canal = ${cree.canal} — le modèle ne doit pas choisir à sa place`,
  )
  verifier(
    "et il naît « prévu », pas « envoyé »",
    cree.statut === "prevu",
    `statut = ${cree.statut}`,
  )
  verifier(
    "la façon dont il l'a nommé est conservée telle quelle",
    cree.destinataire === "le client de Melissa",
    `destinataire = ${cree.destinataire}`,
  )

  // ── Le cloisonnement : c'est ici que ça casse en silence ──
  const vuParB = await (
    await commeUtilisateur(b.jeton, `messages_programmes?id=eq.${cree.id}&select=id`)
  ).json()
  verifier(
    "un autre utilisateur ne voit PAS ses messages",
    Array.isArray(vuParB) && vuParB.length === 0,
    `l'autre utilisateur a lu ${JSON.stringify(vuParB)}`,
  )

  const modifParB = await commeUtilisateur(b.jeton, `messages_programmes?id=eq.${cree.id}`, {
    method: "PATCH",
    body: JSON.stringify({ texte: "message détourné" }),
  })
  const corpsModifB = modifParB.ok ? await modifParB.json() : []
  verifier(
    "et ne peut PAS modifier le texte d'un message qui n'est pas à lui",
    !modifParB.ok || corpsModifB.length === 0,
    `HTTP ${modifParB.status}, ${JSON.stringify(corpsModifB)}`,
  )

  const suppParB = await commeUtilisateur(b.jeton, `messages_programmes?id=eq.${cree.id}`, {
    method: "DELETE",
  })
  const corpsSuppB = suppParB.ok ? await suppParB.json() : []
  verifier(
    "ni le supprimer",
    !suppParB.ok || corpsSuppB.length === 0,
    `HTTP ${suppParB.status}, ${JSON.stringify(corpsSuppB)}`,
  )

  const encoreLa = await (
    await commeUtilisateur(a.jeton, `messages_programmes?id=eq.${cree.id}&select=id,texte`)
  ).json()
  verifier(
    "après quoi son message est intact",
    encoreLa.length === 1 && encoreLa[0].texte === "Où en est ton chantier ?",
    JSON.stringify(encoreLa),
  )

  // ── Annoncé n'est pas envoyé ──
  await commeUtilisateur(a.jeton, `messages_programmes?id=eq.${cree.id}`, {
    method: "PATCH",
    body: JSON.stringify({ statut: "annonce", annonce_a: new Date().toISOString() }),
  })
  const [annonce] = await (
    await commeUtilisateur(a.jeton, `messages_programmes?id=eq.${cree.id}&select=statut,annonce_a,updated_at`)
  ).json()
  verifier(
    "« annoncé » est un état distinct de « envoyé »",
    annonce.statut === "annonce" && !!annonce.annonce_a,
    JSON.stringify(annonce),
  )
  verifier(
    "et updated_at est tenu par la base, pas par l'appelant",
    new Date(annonce.updated_at).getTime() > new Date(cree.created_at).getTime() - 1000,
    `updated_at = ${annonce.updated_at}`,
  )

  // ── Reprogrammer efface l'annonce : sinon il ne serait jamais réannoncé ──
  await commeUtilisateur(a.jeton, `messages_programmes?id=eq.${cree.id}`, {
    method: "PATCH",
    body: JSON.stringify({ envoyer_a: dans2h, statut: "prevu", annonce_a: null }),
  })
  const [reprog] = await (
    await commeUtilisateur(a.jeton, `messages_programmes?id=eq.${cree.id}&select=statut,annonce_a`)
  ).json()
  verifier(
    "reprogrammer le remet en attente d'annonce",
    reprog.statut === "prevu" && reprog.annonce_a === null,
    JSON.stringify(reprog),
  )

  // ── Un statut inventé doit être refusé par la base ──
  const bidon = await commeUtilisateur(a.jeton, `messages_programmes?id=eq.${cree.id}`, {
    method: "PATCH",
    body: JSON.stringify({ statut: "parti_tout_seul" }),
  })
  verifier(
    "un statut hors liste est refusé par la base",
    !bidon.ok,
    `HTTP ${bidon.status} — la contrainte de statut ne tient pas`,
  )

  // ── La requête que fera le téléphone ──
  const aAnnoncer = await (
    await commeUtilisateur(
      a.jeton,
      `messages_programmes?statut=eq.prevu&envoyer_a=lte.${encodeURIComponent(new Date(Date.now() + 3 * 3600_000).toISOString())}&select=id`,
    )
  ).json()
  verifier(
    "le téléphone retrouve ce qu'il a à annoncer",
    Array.isArray(aAnnoncer) && aAnnoncer.some((m) => m.id === cree.id),
    JSON.stringify(aAnnoncer),
  )
} finally {
  await admin(`/auth/v1/admin/users/${a.id}`, { method: "DELETE" })
  await admin(`/auth/v1/admin/users/${b.id}`, { method: "DELETE" })
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs ? 1 : 0)
