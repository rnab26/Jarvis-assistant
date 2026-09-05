/**
 * Vérifie sur la fonction RÉELLEMENT DÉPLOYÉE que la mémoire ne réécrit plus
 * trois fois la même chose.
 *
 *   ANON_KEY=... node scripts/verifier-memoire.mjs
 *
 * `verifier-dedoublonnage.ts` vérifie la décision hors ligne. Ici on vérifie la
 * chaîne entière, celle qui a produit le bug : trois phrases dictées coup sur
 * coup, l'extraction par le modèle, l'empreinte calculée dans l'Edge Function,
 * la recherche du voisin le plus proche et l'écriture. Aucun de ces maillons
 * n'est visible depuis un test hors ligne, et la mémorisation est SILENCIEUSE
 * par construction : si elle se remet à empiler des doublons, personne ne le
 * verra — sauf ce contrôle.
 *
 * Utilisateur de test éphémère, créé puis supprimé : rien ne touche à la
 * mémoire de Raphaël. L'en-tête x-jarvis-essai fait utiliser la clé Gemini du
 * projet de test, pour ne pas puiser dans son quota du jour.
 *
 * ANON_KEY : la clé publique du projet (outil MCP get_publishable_keys).
 * SUPABASE_SERVICE_ROLE_KEY vient de l'environnement : elle sert à créer et
 * supprimer l'utilisateur de test, et à relire ce qui a été mémorisé.
 */
import { execFileSync } from "node:child_process"

const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const FONCTION = process.env.FONCTION ?? "voice-command"
/**
 * La mémorisation part en tâche de fond, et elle peut être LENTE : quand le
 * modèle répond 429, `appelerGemini` patiente puis change de modèle. Mesuré le
 * 4 sept. : plus d'une minute entre la phrase et l'écriture du souvenir. Un
 * délai fixe faisait lire la base trop tôt et déclarait la mémoire morte alors
 * qu'elle travaillait encore. On attend donc que ça se stabilise.
 */
const ATTENTE_MAX_MS = Number(process.env.ATTENTE_MAX_MS ?? 240000)
/**
 * Plancher d'attente. Un compte de souvenirs qui ne bouge pas ne veut PAS dire
 * que la mémorisation a fini : elle peut être en train d'attendre un modèle.
 * Mesuré le 4 sept. : 60 s entre la phrase et l'écriture quand le premier
 * modèle répond 429. Sans ce plancher, le contrôle lisait la base avant
 * l'écriture et déclarait l'échec d'un dédoublonnage qui, dans les journaux de
 * la fonction, avait bel et bien eu lieu.
 */
const ATTENTE_MIN_MS = Number(process.env.ATTENTE_MIN_MS ?? 90000)
/**
 * Espacement entre deux phrases. Mesuré le 4 sept. 2026 : à 4 s d'intervalle,
 * le modèle de la mémoire répond 429 (limite PAR MINUTE de l'offre gratuite)
 * dès la deuxième phrase, l'extraction saute, et le contrôle ci-dessous
 * passait au vert sans avoir rien dédoublonné du tout — pour la seule raison
 * que les redites n'étaient jamais arrivées jusqu'à la mémoire.
 */
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 22000)

if (!ANON || !SERVICE) {
  console.error("Il manque ANON_KEY et/ou SUPABASE_SERVICE_ROLE_KEY (voir l'en-tête du fichier).")
  process.exit(2)
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

const email = `essai-memoire-${Date.now()}@jarvis-test.local`
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

/** Appelle une fonction SQL AVEC LE JETON de l'utilisateur de test : c'est le
 *  seul moyen de vérifier ce que voit vraiment l'app, puisque ces fonctions
 *  s'appuient sur auth.uid() — que la clé de service ne renseigne pas. */
async function rpc(nom, corps = {}) {
  const r = await fetch(`${URL_PROJET}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  })
  return await r.json()
}

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

function compter(champ = "*") {
  return sql(`select count(${champ})::int as n from souvenirs where user_id = '${userId}'`)[0].n
}

/**
 * Attend que la mémorisation ait fini d'écrire : le compte de souvenirs ne
 * bouge plus depuis trois relevés, et au moins un a été écrit — sinon on
 * patiente jusqu'à la limite avant de conclure.
 */
async function attendreStabilisation() {
  const debut = Date.now()
  let precedent = -1
  let immobile = 0
  while (Date.now() - debut < ATTENTE_MAX_MS) {
    await new Promise((r) => setTimeout(r, 6000))
    const n = compter()
    process.stdout.write(`\r  ${Math.round((Date.now() - debut) / 1000)} s — ${n} souvenir(s) écrit(s)   `)
    immobile = n === precedent ? immobile + 1 : 0
    precedent = n
    if (Date.now() - debut < ATTENTE_MIN_MS) continue
    if (n > 0 && immobile >= 3) break
  }
  console.log("")
}

let echecs = 0
const verifier = (nom, ok, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/**
 * Le vrai cas de Raphaël, transposé : la même information redite trois fois,
 * comme le 3 sept. 2026 à 07:56 où trois souvenirs quasi identiques sur la
 * boutique Fripouille ont été écrits en 38 secondes.
 */
const REDITES = [
  "Pour info, mon associé sur le dossier de la tour Gamma s'appelle Ovadia.",
  "Sur le dossier de la tour Gamma, c'est Ovadia mon associé.",
  "Mon associé pour la tour Gamma, c'est Ovadia.",
]

for (const phrase of REDITES) {
  const r = await dire(phrase)
  if (r.error) { console.error(`erreur serveur sur « ${phrase} » : ${r.error}`); break }
  await new Promise((r) => setTimeout(r, PAUSE_MS))
}

console.log("Attente de la mémorisation (tâche de fond) :")
await attendreStabilisation()

const vivants = sql(
  `select id, contenu, categorie, perime_at, (updated_at > created_at + interval '1 second') as retouche
   from souvenirs where user_id = '${userId}' and perime_at is null order by created_at`,
)
const tous = compter()

console.log(`\n${tous} souvenir(s) écrit(s), ${vivants.length} vivant(s) :`)
for (const s of vivants) console.log(`  - (${s.categorie}) ${s.contenu}`)

verifier(
  "la mémoire a bien tourné (au moins un souvenir retenu)",
  vivants.length >= 1,
  "aucun souvenir : soit le modèle de mémoire ne répond plus, soit l'extraction est cassée — " +
    "dans les deux cas le contrôle des doublons ci-dessous ne prouve rien",
)

// LE contrôle : plus aucune paire de souvenirs vivants au-dessus des seuils.
// Les seuils sont recopiés de dedoublonnage.ts ; s'ils y changent, ils
// changent ici (le contrôle hors ligne, lui, vérifie qu'ils restent sensés).
const doublons = vivants.length < 2 ? [] : sql(
  `select a.contenu as a, b.contenu as b, round((1 - (a.embedding operator(extensions.<=>) b.embedding))::numeric, 3) as prox
   from souvenirs a join souvenirs b on a.id < b.id
   where a.user_id = '${userId}' and b.user_id = '${userId}'
     and a.perime_at is null and b.perime_at is null
     and 1 - (a.embedding operator(extensions.<=>) b.embedding) >= 0.95`,
)

verifier(
  "trois fois la même information ne laissent pas trois souvenirs",
  doublons.length === 0,
  doublons.map((d) => `  cos ${d.prox} : « ${d.a} » ≈ « ${d.b} »`).join("\n"),
)

verifier(
  "l'information a été retenue une fois, pas zéro",
  vivants.some((s) => /ovadia/i.test(s.contenu)),
  `retenu : ${JSON.stringify(vivants.map((s) => s.contenu))}`,
)

// LA preuve que le dédoublonnage a vraiment tourné, et pas que le modèle a
// simplement sauté les redites : `ranger()` touche `updated_at` quand il
// fusionne, et rien d'autre ne le touche. Sans ce contrôle, le test passait
// au vert en n'ayant rien vérifié du tout.
verifier(
  "une redite a bien été fondue dans le souvenir existant (updated_at retouché)",
  vivants.some((s) => s.retouche === true),
  "aucun souvenir retouché : les redites n'ont pas atteint la mémoire (429 du " +
    "modèle ? augmente PAUSE_MS) — le contrôle des doublons ne prouve alors rien",
)

// Un chiffre qui change met à jour au lieu d'empiler : l'ancien est périmé.
await dire("Le loyer de la tour Gamma est de 4000 shekels par mois.")
await new Promise((r) => setTimeout(r, PAUSE_MS))
await dire("Correction, le loyer de la tour Gamma est de 4500 shekels par mois.")
await attendreStabilisation()

const loyers = sql(
  `select contenu, perime_at from souvenirs where user_id = '${userId}' and contenu ilike '%loyer%' order by created_at`,
)
console.log(`\n${loyers.length} souvenir(s) sur le loyer :`)
for (const s of loyers) console.log(`  - ${s.perime_at ? "(périmé) " : ""}${s.contenu}`)

if (loyers.length >= 2) {
  verifier(
    "un montant corrigé périme l'ancien souvenir au lieu de laisser les deux vivants",
    loyers.filter((s) => !s.perime_at).length === 1,
    "les deux montants restent vivants : Jarvis pourrait ressortir l'ancien",
  )
} else {
  console.log("      (le modèle n'a retenu qu'un seul souvenir de loyer : rien à départager ici)")
}

// ---------------------------------------------------------------------------
// Le rattrapage des empreintes écrit-il VRAIMENT ? (5 sept. 2026)
//
// Il n'écrivait rien depuis deux jours, en silence : `echanges` avait des
// politiques SELECT/INSERT/DELETE mais aucune pour UPDATE, et RLS ne refuse
// pas bruyamment un UPDATE — il restreint les lignes. Zéro ligne touchée,
// succès rendu, rien à attraper. Aucun contrôle ne le voyait parce que tous
// regardaient le code, qui était juste.
// ---------------------------------------------------------------------------

{
  // Un vieil échange sans empreinte, comme les 75 de Raphaël.
  await fetch(`${URL_PROJET}/rest/v1/echanges`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jeton}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      transcript: "Un vieil échange que personne n'a jamais rendu cherchable.",
      reponse: "ok",
    }),
  })
  const avant = sql(
    `select count(*)::int as n from echanges where user_id = '${userId}' and embedding is null`,
  )[0].n
  verifier("un échange sans empreinte est bien en place pour le test", avant >= 1, `${avant} trouvé(s)`)

  // Une phrase quelconque déclenche le rattrapage, qui tourne en tâche de fond.
  await dire("Bonjour, ça va ?")
  await attendreStabilisation()

  const apres = sql(
    `select count(*)::int as n from echanges where user_id = '${userId}' and embedding is null`,
  )[0].n
  verifier(
    "le rattrapage rend vraiment cherchables les échanges anciens",
    apres < avant,
    `${avant} sans empreinte avant, ${apres} après — l'écriture ne passe pas ` +
      "(politique RLS UPDATE manquante sur echanges ?), et elle le fait en silence",
  )
}

// ---------------------------------------------------------------------------
// Retrouver une CONVERSATION passée, pas seulement un fait (chantier caa54df2).
//
// On choisit exprès un échange dont la consigne d'extraction dit qu'il ne doit
// PAS devenir un souvenir (« les questions de culture générale et leurs
// réponses »). Si Jarvis sait quand même y revenir, c'est que le mot-à-mot a
// bien été retrouvé — et pas un fait retenu par ailleurs.
// ---------------------------------------------------------------------------

const QUESTION_CULTURE = "Explique-moi en deux mots ce qu'est le grès cérame pleine masse."
const RAPPEL = "Tu te souviens, on avait parlé de quoi à propos du grès cérame ?"

await dire(QUESTION_CULTURE)
await new Promise((r) => setTimeout(r, PAUSE_MS))

const empreintes = sql(
  `select count(*)::int as n from echanges where user_id = '${userId}' and embedding is not null`,
)[0].n
verifier(
  "l'échange est enregistré avec son empreinte, donc retrouvable",
  empreintes >= 1,
  "aucune empreinte : la recherche par le sens dans les conversations ne trouvera jamais rien",
)

const reponseRappel = await dire(RAPPEL)
const messageRappel = (reponseRappel.actions ?? []).map((x) => x.message ?? "").join(" ")
await new Promise((r) => setTimeout(r, PAUSE_MS))

// Preuve côté base : la question de rappel, une fois enregistrée avec sa
// propre empreinte, retrouve bien l'échange précédent au-dessus du seuil de
// chercher_echanges (0,75). Requête équivalente à la fonction SQL, avec
// l'utilisateur en clair — la fonction, elle, s'appuie sur auth.uid(), que la
// clé de service ne renseigne pas.
const retrouves = sql(
  `select a.transcript as trouve,
          round((1 - (a.embedding operator(extensions.<=>) b.embedding))::numeric, 3) as prox
   from echanges a, echanges b
   where a.user_id = '${userId}' and b.user_id = '${userId}'
     and b.transcript = $q$${RAPPEL}$q$
     and a.transcript = $q$${QUESTION_CULTURE}$q$
     and a.embedding is not null and b.embedding is not null`,
)
console.log(`\nProximité entre la question de rappel et l'échange visé : ${retrouves[0]?.prox ?? "—"}`)
verifier(
  "la question de rappel retrouve l'échange passé au-dessus du seuil (0,75)",
  retrouves.length === 1 && Number(retrouves[0].prox) > 0.75,
  retrouves.length
    ? `proximité ${retrouves[0].prox} : sous le seuil, chercher_echanges ne le remonterait pas`
    : "les deux échanges n'ont pas tous les deux leur empreinte",
)

const souvenirCulture = sql(
  `select count(*)::int as n from souvenirs where user_id = '${userId}' and contenu ilike '%cérame%'`,
)[0].n
console.log(`Réponse de Jarvis au rappel : « ${messageRappel.slice(0, 300)} »`)
if (souvenirCulture === 0) {
  verifier(
    "Jarvis sait revenir sur la conversation, sans qu'aucun souvenir ne le lui souffle",
    /c[eé]rame|carrelage|gr[eè]s/i.test(messageRappel),
    "il ne cite pas le sujet : le mot-à-mot n'est pas arrivé jusqu'au modèle",
  )
} else {
  console.log(
    "      (un souvenir sur le grès cérame a été créé : la réponse pourrait venir de là, " +
      "le contrôle décisif reste celui de la proximité ci-dessus)",
  )
}

// ---------------------------------------------------------------------------
// Le témoin de la mémoire (chantier 9ab3ca4d).
//
// La mémorisation est silencieuse et avale ses erreurs : le 4 sept. elle est
// restée morte des heures sans que rien ne le dise. sante_memoire() est ce qui
// rend l'état consultable — encore faut-il qu'elle dise vrai.
// ---------------------------------------------------------------------------

const sante = (await rpc("sante_memoire"))[0]
console.log(`\nSanté de la mémoire : ${JSON.stringify(sante)}`)

verifier(
  "le témoin voit que la mémoire a travaillé",
  sante && sante.dernier_souvenir !== null,
  "dernier_souvenir vide alors que des souvenirs viennent d'être écrits",
)
// Compté en base plutôt que déduit : le nombre de souvenirs retenus dépend de
// ce que le modèle a jugé digne d'être gardé, et il varie d'un passage à
// l'autre. Ce qu'on vérifie ici, c'est que le témoin EXCLUT les périmés — pas
// qu'il tombe sur un chiffre qu'on aurait deviné.
const compte = sql(
  `select count(*) filter (where perime_at is null)::int as vivants,
          count(*) filter (where perime_at is not null)::int as perimes
   from souvenirs where user_id = '${userId}'`,
)[0]
verifier(
  "il compte les souvenirs vivants, pas les périmés",
  sante && sante.souvenirs_vivants === compte.vivants && compte.perimes > 0,
  `témoin ${sante?.souvenirs_vivants}, base ${compte.vivants} vivants et ${compte.perimes} périmé(s)`,
)
verifier(
  "il ne crie pas au loup quand tout va bien",
  sante && sante.echanges_depuis < 12 && sante.erreur_titre === null,
  `${sante?.echanges_depuis} échanges depuis, erreur « ${sante?.erreur_titre} »`,
)

// Une correction à la main ne doit PAS passer pour un travail de la mémoire :
// sinon le témoin repasserait au vert dès que Raphaël retouche un souvenir,
// exactement au moment où il faudrait qu'il reste rouge.
const aCorriger = (await rpc("sante_memoire"))[0]
await fetch(`${URL_PROJET}/rest/v1/souvenirs?user_id=eq.${userId}&perime_at=is.null&limit=1`, {
  method: "PATCH",
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${jeton}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  },
  body: JSON.stringify({ contenu: "Corrigé à la main par Raphaël.", updated_at: new Date().toISOString() }),
})
const apresCorrection = (await rpc("sante_memoire"))[0]
verifier(
  "corriger un souvenir à la main ne fait pas passer le témoin pour actif",
  apresCorrection?.dernier_souvenir === aCorriger?.dernier_souvenir,
  `la date a bougé (${aCorriger?.dernier_souvenir} → ${apresCorrection?.dernier_souvenir}) : ` +
    "le témoin repasserait au vert dès que Raphaël retouche un souvenir, au pire moment",
)

// Une panne signalée par la mémoire elle-même doit remonter jusqu'au témoin.
await rpc("signaler_erreur", {
  p_categorie: "serveur",
  p_titre: "La mémoire n'a rien pu retenir de cet échange",
  p_detail: "Contrôle automatique : quota du modèle épuisé (simulé).",
  p_contexte: "verifier-memoire.mjs",
  p_source: "memoire",
})
const santeApres = (await rpc("sante_memoire"))[0]
verifier(
  "une panne signalée par la mémoire remonte jusqu'au témoin",
  santeApres?.erreur_titre === "La mémoire n'a rien pu retenir de cet échange",
  `erreur_titre = ${JSON.stringify(santeApres?.erreur_titre)} — la panne resterait invisible`,
)
verifier(
  "et le témoin dit POURQUOI, pas seulement QUE",
  typeof santeApres?.erreur_detail === "string" && santeApres.erreur_detail.length > 0,
  "sans le détail, il faudrait rouvrir les journaux Supabase — c'est ce qu'on voulait éviter",
)

// Le cloisonnement : le témoin d'un utilisateur ne voit que sa propre mémoire.
const anonyme = await fetch(`${URL_PROJET}/rest/v1/rpc/sante_memoire`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: "{}",
})
const vuParUnAnonyme = await anonyme.json().catch(() => null)
verifier(
  "un anonyme ne voit rien de la mémoire de Raphaël",
  !Array.isArray(vuParUnAnonyme) ||
    vuParUnAnonyme.length === 0 ||
    (vuParUnAnonyme[0]?.dernier_souvenir == null && vuParUnAnonyme[0]?.souvenirs_vivants === 0),
  `réponse : ${JSON.stringify(vuParUnAnonyme).slice(0, 200)}`,
)

// ---------------------------------------------------------------------------
// Ce que Raphaël reprend à Jarvis lui revient (chantier 057fbe10).
//
// Le registre des erreurs lui fait écrire « ce qu'il aurait fallu faire ».
// Jusqu'ici ça ne servait qu'aux sessions Claude Code : Jarvis refaisait la
// même erreur le lendemain alors que la réponse était en base.
//
// La correction utilisée ici contient un fait que le modèle NE PEUT PAS
// deviner. S'il ressort, c'est qu'il a bien lu la correction — pas qu'il a eu
// de la chance.
// ---------------------------------------------------------------------------

const avantCorrection = await dire("Ajoute une tâche pour le grand chantier : commander les poignées.")
const titreAvant = (avantCorrection.actions ?? [])
  .filter((a) => a.action === "add_task")
  .map((a) => `${a.title ?? ""} ${a.notes ?? ""}`)
  .join(" ")
console.log(`\nAvant la correction, la tâche créée dit : « ${titreAvant.trim()} »`)
verifier(
  "sans correction, Jarvis ne peut pas savoir ce qu'est « le grand chantier »",
  !/kerouan/i.test(titreAvant),
  "le test ne prouverait rien : le modèle sort le mot sans avoir lu la correction",
)

await rpc("signaler_erreur", {
  p_categorie: "comprehension",
  p_titre: "« le grand chantier » pris au pied de la lettre",
  p_detail: "Contrôle automatique.",
  p_contexte: "Ajoute une tâche pour le grand chantier.",
  p_source: "manuel",
})
// La correction, c'est Raphaël qui l'écrit depuis le cockpit : on fait pareil.
await fetch(`${URL_PROJET}/rest/v1/jarvis_erreurs?user_id=eq.${userId}&categorie=eq.comprehension`, {
  method: "PATCH",
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${jeton}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  },
  body: JSON.stringify({
    correction: "Quand je dis « le grand chantier », je parle toujours de la villa Kerouan.",
  }),
})

await new Promise((r) => setTimeout(r, 3000))
const apres = await dire("Ajoute une tâche pour le grand chantier : commander les poignées.")
const titreApres = (apres.actions ?? [])
  .filter((a) => a.action === "add_task")
  .map((a) => `${a.title ?? ""} ${a.notes ?? ""}`)
  .join(" ")
console.log(`Après la correction, la tâche créée dit : « ${titreApres.trim()} »`)
verifier(
  "une correction écrite par Raphaël change ce que Jarvis fait, dès la phrase suivante",
  /kerouan/i.test(titreApres),
  "la correction n'atteint pas le modèle : elle ne sert toujours qu'aux sessions Claude Code",
)

// Et ce qui n'apprend rien au modèle ne doit pas lui coûter de contexte.
await rpc("signaler_erreur", {
  p_categorie: "serveur",
  p_titre: "Le modèle a refusé de répondre",
  p_detail: "Contrôle automatique.",
  p_source: "memoire",
})
await fetch(`${URL_PROJET}/rest/v1/jarvis_erreurs?user_id=eq.${userId}&categorie=eq.serveur`, {
  method: "PATCH",
  headers: { apikey: ANON, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ correction: "Redémarrer la fonction et repasser sur le modèle de secours." }),
})
await new Promise((r) => setTimeout(r, 3000))
const serveur = await dire("Ajoute une tâche : acheter du café.")
const toutLeTexte = JSON.stringify(serveur)
verifier(
  "une correction d'erreur serveur ne part PAS au modèle",
  !/red[eé]marrer la fonction/i.test(toutLeTexte) && (serveur.actions ?? []).some((a) => a.action === "add_task"),
  "elle n'apprend rien à un modèle de langue et coûte du quota à chaque phrase",
)

await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
const restes = sql(`select count(*)::int as n from souvenirs where user_id = '${userId}'`)
verifier("l'utilisateur de test et ses souvenirs sont bien supprimés", restes[0].n === 0, `${restes[0].n} restant(s)`)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
