/**
 * Vérifie sur la VRAIE base ce que fait sa réponse sur un chantier « à
 * constater » (chantier 56b1a074) et la mémoire de ce qui marche (6af9c51b,
 * c2fd0205) — migration 0053.
 *
 *   ANON_KEY=... node scripts/verifier-constat-reel.mjs
 *
 * La note calculée se vérifie hors ligne (`verifier-constat-chantier.ts`). Ce
 * qui ne peut se vérifier qu'ici :
 *
 * 1. `constater_chantier` fait les TROIS écritures d'un bloc — archiver, sa
 *    réponse dans le journal, la ligne de `ce_qui_marche` — et `annuler_constat`
 *    les défait toutes les trois. Une réponse « Ça marche » qui resterait au
 *    journal après l'avoir annulée ferait mentir le bloc de démarrage.
 * 2. Une note modifiée ENTRE-TEMPS par une session n'est jamais écrasée.
 * 3. « Ça ne marche pas » exige ses mots.
 * 4. Le cloisonnement RLS : un autre compte ne peut ni constater le chantier
 *    de Raphaël, ni lire ce qu'il a dit qui marche. Une policy mal posée ne
 *    lève AUCUNE erreur, elle rend simplement des lignes en trop.
 * 5. `noter_ce_qui_marche` regroupe : deux « parfait » sur la même action font
 *    UNE ligne à deux occurrences.
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

const rest = (jeton, chemin, options = {}) =>
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
  const r = await rest(jeton, `rpc/${nom}`, { method: "POST", body: JSON.stringify(args) })
  const texte = await r.text()
  let corps = null
  try {
    corps = JSON.parse(texte)
  } catch {
    corps = texte
  }
  return { ok: r.ok, corps }
}

const lire = async (jeton, chemin) => {
  const r = await rest(jeton, chemin)
  return r.ok ? await r.json() : []
}

const NOTE = "[LIVRÉ — RESTE À CONSTATER SUR SON TÉLÉPHONE]\n\nEssaie la bulle."
const APRES_OK = "[CONSTATÉ PAR RAPHAËL LE 23/09/2026 — ÇA MARCHE]\n\nEssaie la bulle.\n\n\n--- ÇA MARCHE."
const APRES_KO = "[LIBRE — RETOUR DE RAPHAËL LE 23/09/2026 : ÇA NE MARCHE PAS, voir en bas]\n\nEssaie la bulle.\n\n\n--- ÇA NE MARCHE PAS."

const a = await creerUtilisateur()
const b = await creerUtilisateur()

try {
  const [cree] = await (
    await rest(a.jeton, "dev_items", {
      method: "POST",
      body: JSON.stringify({ user_id: a.id, title: "ZZ essai constat", notes: NOTE, status: "todo", priority: "normal" }),
    })
  ).json()
  const id = cree?.id
  verifier("chantier d'essai créé", !!id, JSON.stringify(cree))

  // ── 4. RLS : un autre compte ne peut pas constater ce chantier ────────────
  const intrus = await rpc(b.jeton, "constater_chantier", {
    p_item: id, p_marche: true, p_paroles: null, p_photo: null, p_notes_avant: NOTE, p_notes_apres: APRES_OK,
  })
  verifier(
    "un AUTRE compte ne peut pas constater le chantier de Raphaël",
    !intrus.ok && JSON.stringify(intrus.corps).includes("introuvable"),
    JSON.stringify(intrus.corps).slice(0, 200),
  )

  // ── 2. Note modifiée entre-temps : refus ──────────────────────────────────
  const perime = await rpc(a.jeton, "constater_chantier", {
    p_item: id, p_marche: true, p_paroles: null, p_photo: null, p_notes_avant: "une autre note", p_notes_apres: APRES_OK,
  })
  verifier(
    "une note modifiée entre-temps par une session n'est JAMAIS écrasée",
    !perime.ok && JSON.stringify(perime.corps).includes("session vient de modifier"),
    JSON.stringify(perime.corps).slice(0, 200),
  )
  const [intact] = await lire(a.jeton, `dev_items?id=eq.${id}&select=notes,archived_at`)
  verifier("…et le chantier est resté tel quel", intact?.notes === NOTE && intact?.archived_at === null)

  // ── 3. « Ça ne marche pas » sans ses mots : refus ─────────────────────────
  const muet = await rpc(a.jeton, "constater_chantier", {
    p_item: id, p_marche: false, p_paroles: "  ", p_photo: null, p_notes_avant: NOTE, p_notes_apres: APRES_KO,
  })
  verifier(
    "« Ça ne marche pas » sans rien dire est refusé",
    !muet.ok && JSON.stringify(muet.corps).includes("Dis ce qui ne marche pas"),
    JSON.stringify(muet.corps).slice(0, 200),
  )

  // ── 1. « Ça marche » : les trois écritures d'un bloc ──────────────────────
  const ok = await rpc(a.jeton, "constater_chantier", {
    p_item: id, p_marche: true, p_paroles: "Nickel", p_photo: null, p_notes_avant: NOTE, p_notes_apres: APRES_OK,
  })
  verifier("« Ça marche » passe", ok.ok, JSON.stringify(ok.corps).slice(0, 200))
  const [archive] = await lire(a.jeton, `dev_items?id=eq.${id}&select=notes,status,archived_at`)
  verifier(
    "…le chantier est archivé, statut « fait », avec la note calculée par l'app",
    archive?.archived_at !== null && archive?.status === "done" && archive?.notes === APRES_OK,
    JSON.stringify(archive).slice(0, 200),
  )
  const journal = await lire(a.jeton, `dev_log?item_id=eq.${id}&select=id,author,kind,body`)
  verifier(
    "…sa réponse est au journal, signée de lui, avec ses mots",
    journal.length === 1 && journal[0].author === "Raphaël" && journal[0].kind === "reponse" &&
      journal[0].body.startsWith("Ça marche") && journal[0].body.includes("Nickel"),
    JSON.stringify(journal).slice(0, 300),
  )
  const marche = await lire(a.jeton, `ce_qui_marche?item_id=eq.${id}&select=id,source,titre,paroles,occurrences`)
  verifier(
    "…et « ce qui marche » le retient, avec ses mots",
    marche.length === 1 && marche[0].source === "cockpit" && marche[0].paroles === "Nickel" &&
      marche[0].titre === "ZZ essai constat",
    JSON.stringify(marche),
  )
  verifier(
    "un autre compte ne voit RIEN de ce qu'il a dit qui marche (RLS)",
    (await lire(b.jeton, `ce_qui_marche?item_id=eq.${id}&select=id`)).length === 0,
  )

  // ── 1bis. « Annuler » défait les trois ────────────────────────────────────
  const annule = await rpc(a.jeton, "annuler_constat", {
    p_item: id, p_notes: NOTE, p_status: "todo", p_archived_at: null,
    p_log: ok.corps?.log_id ?? null, p_marche: ok.corps?.marche_id ?? null,
  })
  verifier("« Annuler » passe", annule.ok, JSON.stringify(annule.corps).slice(0, 200))
  const [rendu] = await lire(a.jeton, `dev_items?id=eq.${id}&select=notes,status,archived_at`)
  verifier(
    "…le chantier est rendu tel qu'il était",
    rendu?.notes === NOTE && rendu?.archived_at === null && rendu?.status === "todo",
    JSON.stringify(rendu).slice(0, 200),
  )
  verifier(
    "…sa réponse « Ça marche » a quitté le journal",
    (await lire(a.jeton, `dev_log?item_id=eq.${id}&select=id`)).length === 0,
  )
  verifier(
    "…et « ce qui marche » ne le retient plus",
    (await lire(a.jeton, `ce_qui_marche?item_id=eq.${id}&select=id`)).length === 0,
  )

  // ── « Ça ne marche pas » : il redevient du travail ────────────────────────
  const ko = await rpc(a.jeton, "constater_chantier", {
    p_item: id, p_marche: false, p_paroles: "La bulle revient toute seule", p_photo: null,
    p_notes_avant: NOTE, p_notes_apres: APRES_KO,
  })
  verifier("« Ça ne marche pas » passe", ko.ok, JSON.stringify(ko.corps).slice(0, 200))
  const [repris] = await lire(a.jeton, `dev_items?id=eq.${id}&select=notes,status,archived_at`)
  verifier(
    "…le chantier reste ouvert, « à faire », avec la note qui le rend libre",
    repris?.archived_at === null && repris?.status === "todo" && repris?.notes === APRES_KO,
    JSON.stringify(repris).slice(0, 200),
  )
  verifier(
    "…et rien n'est retenu comme « qui marche »",
    (await lire(a.jeton, `ce_qui_marche?item_id=eq.${id}&select=id`)).length === 0,
  )

  // ── 5. Deux « parfait » sur la même action : une ligne, deux fois ─────────
  const p1 = await rpc(a.jeton, "noter_ce_qui_marche", {
    p_source: "voix", p_titre: "add_task", p_paroles: "parfait", p_contexte: "Demande : « x ».",
  })
  const p2 = await rpc(a.jeton, "noter_ce_qui_marche", {
    p_source: "voix", p_titre: "add_task", p_paroles: "super", p_contexte: null,
  })
  verifier("noter_ce_qui_marche passe deux fois", p1.ok && p2.ok, JSON.stringify([p1.corps, p2.corps]))
  const voix = await lire(a.jeton, "ce_qui_marche?source=eq.voix&select=titre,occurrences,paroles,contexte")
  verifier(
    "deux « parfait » sur la même action font UNE ligne à deux occurrences, avec les derniers mots",
    voix.length === 1 && voix[0].occurrences === 2 && voix[0].paroles === "super" &&
      voix[0].contexte === "Demande : « x ».",
    JSON.stringify(voix),
  )
} finally {
  await admin(`/rest/v1/ce_qui_marche?user_id=in.(${a.id},${b.id})`, { method: "DELETE" })
  await admin(`/rest/v1/dev_items?user_id=in.(${a.id},${b.id})`, { method: "DELETE" })
  await admin(`/auth/v1/admin/users/${a.id}`, { method: "DELETE" })
  await admin(`/auth/v1/admin/users/${b.id}`, { method: "DELETE" })
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
