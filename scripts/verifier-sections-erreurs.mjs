/**
 * Vérifie les sections de chantiers et le registre des erreurs sur la VRAIE
 * base : les fonctions SQL, le regroupement des occurrences, et le
 * cloisonnement entre utilisateurs.
 *
 *   ANON_KEY=... node scripts/verifier-sections-erreurs.mjs
 *
 * POURQUOI CE CONTRÔLE EXISTE.
 *
 * 1. Renommer une section renomme AUSSI le thème de tous ses chantiers, et
 *    fusionner ou supprimer les déplace. Si l'une des deux moitiés passe et
 *    pas l'autre, personne ne le voit tout de suite : le cockpit affiche une
 *    section vide à côté de chantiers devenus orphelins, et on ne comprend
 *    qu'après coup ce qui s'est passé. Ces opérations sont donc des fonctions
 *    SQL, et c'est ici qu'on vérifie qu'elles font bien les deux.
 *
 * 2. Le registre des erreurs regroupe les occurrences par empreinte. Un
 *    regroupement trop large avale des erreurs différentes (elles
 *    disparaissent), trop étroit il en fabrique une nouvelle à chaque fois
 *    (la liste devient illisible et donc inutilisée). Les deux se voient à
 *    l'usage, des semaines plus tard.
 *
 * 3. Une policy RLS mal posée ne lève AUCUNE erreur : la lecture rend
 *    simplement des lignes qu'elle ne devrait pas. D'où deux utilisateurs.
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

/** Requête PostgREST avec le jeton d'un utilisateur : c'est la RLS qui
 * décide, exactement comme depuis l'app. */
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

const rpc = async (jeton, nom, args) => {
  const r = await commeUtilisateur(jeton, `rpc/${nom}`, {
    method: "POST",
    body: JSON.stringify(args),
  })
  return { ok: r.ok, statut: r.status, corps: await r.json().catch(() => null) }
}

const lire = async (jeton, chemin) => {
  const r = await commeUtilisateur(jeton, chemin)
  return r.ok ? await r.json() : []
}

const a = await creerUtilisateur()
const b = await creerUtilisateur()

try {
  // ─────────────────────────── Les sections ───────────────────────────
  const [s1] = await (
    await commeUtilisateur(a.jeton, "dev_sections", {
      method: "POST",
      body: JSON.stringify({ user_id: a.id, nom: "Entraînement", position: 1 }),
    })
  ).json()
  const [s2] = await (
    await commeUtilisateur(a.jeton, "dev_sections", {
      method: "POST",
      body: JSON.stringify({ user_id: a.id, nom: "Fonctionnalités", position: 2 }),
    })
  ).json()
  verifier("créer deux sections", !!s1?.id && !!s2?.id, JSON.stringify({ s1, s2 }))
  if (!s1?.id || !s2?.id) throw new Error("rien à vérifier plus loin")

  // Une section peut naître VIDE : c'est tout l'intérêt de la table.
  verifier(
    "une section existe sans le moindre chantier",
    (await lire(a.jeton, `dev_sections?id=eq.${s1.id}&select=id`)).length === 1,
  )

  const doublon = await commeUtilisateur(a.jeton, "dev_sections", {
    method: "POST",
    body: JSON.stringify({ user_id: a.id, nom: "  entrainement ", position: 3 }),
  })
  verifier(
    "« entrainement » est refusé à côté de « Entraînement »",
    !doublon.ok,
    `HTTP ${doublon.status} — deux sections jumelles couperaient le sujet en deux`,
  )

  const chantiers = await (
    await commeUtilisateur(a.jeton, "dev_items", {
      method: "POST",
      body: JSON.stringify([
        { user_id: a.id, title: "Apprendre une tâche répétitive", theme: "Entraînement" },
        // Écrit sans accent, comme le ferait une session en SQL : il doit
        // suivre le renommage lui aussi.
        { user_id: a.id, title: "Rejouer une démonstration", theme: "Entrainement" },
        { user_id: a.id, title: "Autre chose", theme: "Fonctionnalités" },
      ]),
    })
  ).json()
  verifier("créer trois chantiers", chantiers.length === 3, JSON.stringify(chantiers))

  // ── Renommer : la section ET ses chantiers ──
  const renomme = await rpc(a.jeton, "renommer_section", {
    p_id: s1.id,
    p_nom: "Entraînement de Jarvis",
  })
  verifier(
    "renommer déplace les DEUX chantiers, l'accentué comme l'autre",
    renomme.corps === 2,
    `renvoyé : ${JSON.stringify(renomme)}`,
  )
  const apresRenommage = await lire(
    a.jeton,
    `dev_items?user_id=eq.${a.id}&select=title,theme&order=title`,
  )
  verifier(
    "les chantiers portent le nouveau nom",
    apresRenommage.filter((c) => c.theme === "Entraînement de Jarvis").length === 2,
    JSON.stringify(apresRenommage),
  )
  const [sectionRenommee] = await lire(a.jeton, `dev_sections?id=eq.${s1.id}&select=nom`)
  verifier(
    "et la section aussi — les deux moitiés, pas une seule",
    sectionRenommee?.nom === "Entraînement de Jarvis",
    JSON.stringify(sectionRenommee),
  )

  // ── Réordonner ──
  await rpc(a.jeton, "reordonner_sections", { p_ids: [s2.id, s1.id] })
  const ordre = await lire(a.jeton, `dev_sections?select=id,nom,position&order=position`)
  verifier(
    "l'ordre choisi est celui qui revient de la base",
    ordre[0]?.id === s2.id && ordre[1]?.id === s1.id,
    JSON.stringify(ordre),
  )

  // ── Fusionner ──
  const fusion = await rpc(a.jeton, "fusionner_sections", { p_source: s1.id, p_cible: s2.id })
  verifier("fusionner déplace les chantiers de la source", fusion.corps === 2, JSON.stringify(fusion))
  verifier(
    "la section source a disparu",
    (await lire(a.jeton, `dev_sections?id=eq.${s1.id}&select=id`)).length === 0,
  )
  const apresFusion = await lire(a.jeton, `dev_items?user_id=eq.${a.id}&select=theme`)
  verifier(
    "et AUCUN chantier n'a été supprimé avec elle",
    apresFusion.length === 3 && apresFusion.every((c) => c.theme === "Fonctionnalités"),
    JSON.stringify(apresFusion),
  )

  // ── Supprimer : les chantiers repartent à classer ──
  const suppression = await rpc(a.jeton, "supprimer_section", { p_id: s2.id, p_vers: null })
  verifier("supprimer rend les chantiers à classer", suppression.corps === 3, JSON.stringify(suppression))
  const apresSuppression = await lire(a.jeton, `dev_items?user_id=eq.${a.id}&select=theme`)
  verifier(
    "les trois chantiers sont toujours là, sans thème",
    apresSuppression.length === 3 && apresSuppression.every((c) => c.theme === null),
    JSON.stringify(apresSuppression),
  )

  // ── Le cloisonnement ──
  const [sB] = await (
    await commeUtilisateur(b.jeton, "dev_sections", {
      method: "POST",
      body: JSON.stringify({ user_id: b.id, nom: "Section de B", position: 1 }),
    })
  ).json()
  verifier(
    "un utilisateur ne voit PAS les sections d'un autre",
    (await lire(a.jeton, `dev_sections?id=eq.${sB.id}&select=id`)).length === 0,
  )
  const volParA = await rpc(a.jeton, "renommer_section", { p_id: sB.id, p_nom: "Détournée" })
  const [intacte] = await lire(b.jeton, `dev_sections?id=eq.${sB.id}&select=nom`)
  verifier(
    "ni ne peut renommer celle d'un autre",
    !volParA.ok && intacte?.nom === "Section de B",
    `HTTP ${volParA.statut}, la section de B s'appelle « ${intacte?.nom} »`,
  )

  // ─────────────────────── Le registre des erreurs ───────────────────────
  const e1 = await rpc(a.jeton, "signaler_erreur", {
    p_categorie: "systeme",
    p_titre: "Impossible de modifier le chantier (délai dépassé, 8012 ms)",
    p_detail: "timeout",
    p_source: "app",
  })
  verifier("signaler une erreur", !!e1.corps, JSON.stringify(e1))

  const e2 = await rpc(a.jeton, "signaler_erreur", {
    p_categorie: "systeme",
    p_titre: "Impossible de modifier le chantier (délai dépassé, 9310 ms)",
    p_detail: "timeout plus long",
    p_source: "app",
  })
  verifier(
    "la même erreur avec un chiffre différent ne fait pas une seconde ligne",
    e2.corps === e1.corps,
    `deux identifiants différents : ${e1.corps} / ${e2.corps}`,
  )
  const [groupee] = await lire(a.jeton, `jarvis_erreurs?id=eq.${e1.corps}&select=*`)
  verifier(
    "elle est comptée deux fois",
    groupee?.occurrences === 2,
    `occurrences = ${groupee?.occurrences}`,
  )
  verifier(
    "et c'est le dernier détail vu qui est gardé",
    groupee?.detail === "timeout plus long",
    `detail = ${groupee?.detail}`,
  )

  const e3 = await rpc(a.jeton, "signaler_erreur", {
    p_categorie: "comprehension",
    p_titre: "Impossible de modifier le chantier (délai dépassé, 8012 ms)",
  })
  verifier(
    "une erreur d'un AUTRE type reste une erreur distincte",
    e3.corps !== e1.corps,
    "deux familles d'erreurs se seraient confondues",
  )

  // Corrigée, puis elle revient : elle doit se revoir.
  await commeUtilisateur(a.jeton, `jarvis_erreurs?id=eq.${e1.corps}`, {
    method: "PATCH",
    body: JSON.stringify({ statut: "corrige", correction: "borner l'appel" }),
  })
  await rpc(a.jeton, "signaler_erreur", {
    p_categorie: "systeme",
    p_titre: "Impossible de modifier le chantier (délai dépassé, 12000 ms)",
  })
  const [revenue] = await lire(a.jeton, `jarvis_erreurs?id=eq.${e1.corps}&select=*`)
  verifier(
    "une erreur corrigée qui revient rouvre toute seule",
    revenue?.statut === "nouveau" && !!revenue?.reapparue_at,
    `statut ${revenue?.statut}, reapparue_at ${revenue?.reapparue_at}`,
  )
  verifier(
    "et la note de correction déjà écrite n'est pas effacée",
    revenue?.correction === "borner l'appel",
    `correction = ${revenue?.correction}`,
  )

  const vide = await rpc(a.jeton, "signaler_erreur", { p_categorie: "systeme", p_titre: "   " })
  verifier("un titre vide n'enregistre rien", vide.corps === null, JSON.stringify(vide))

  const inventee = await rpc(a.jeton, "signaler_erreur", {
    p_categorie: "n_importe_quoi",
    p_titre: "Catégorie inconnue",
  })
  const [rangee] = await lire(a.jeton, `jarvis_erreurs?id=eq.${inventee.corps}&select=categorie`)
  verifier(
    "une catégorie inconnue tombe dans « autre » au lieu d'être perdue",
    rangee?.categorie === "autre",
    JSON.stringify(rangee),
  )

  const statutBidon = await commeUtilisateur(a.jeton, `jarvis_erreurs?id=eq.${e1.corps}`, {
    method: "PATCH",
    body: JSON.stringify({ statut: "reglee_toute_seule" }),
  })
  verifier("un statut hors liste est refusé par la base", !statutBidon.ok, `HTTP ${statutBidon.status}`)

  verifier(
    "un utilisateur ne voit PAS les erreurs d'un autre",
    (await lire(b.jeton, `jarvis_erreurs?id=eq.${e1.corps}&select=id`)).length === 0,
  )
  const patchParB = await commeUtilisateur(b.jeton, `jarvis_erreurs?id=eq.${e1.corps}`, {
    method: "PATCH",
    body: JSON.stringify({ correction: "détournée" }),
  })
  const corpsB = patchParB.ok ? await patchParB.json() : []
  verifier(
    "ni corriger celles d'un autre",
    !patchParB.ok || corpsB.length === 0,
    `HTTP ${patchParB.status}, ${JSON.stringify(corpsB)}`,
  )

  // L'empreinte est celle du signalement : la retoucher à la main ne doit pas
  // faire repartir une nouvelle ligne à la prochaine occurrence.
  await commeUtilisateur(a.jeton, `jarvis_erreurs?id=eq.${e1.corps}`, {
    method: "PATCH",
    body: JSON.stringify({ titre: "Modification de chantier trop lente" }),
  })
  const encore = await rpc(a.jeton, "signaler_erreur", {
    p_categorie: "systeme",
    p_titre: "Impossible de modifier le chantier (délai dépassé, 4200 ms)",
  })
  verifier(
    "renommer une erreur ne casse pas son regroupement",
    encore.corps === e1.corps,
    "les occurrences suivantes seraient reparties sur une nouvelle ligne",
  )
} finally {
  await admin(`/auth/v1/admin/users/${a.id}`, { method: "DELETE" })
  await admin(`/auth/v1/admin/users/${b.id}`, { method: "DELETE" })
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
