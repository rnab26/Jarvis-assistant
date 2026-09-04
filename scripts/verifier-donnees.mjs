/**
 * Vérification de la plomberie de données : temps réel et réglages.
 *
 *   ANON_KEY=... node scripts/verifier-donnees.mjs
 *
 * Ces deux mécanismes ont la même vilaine propriété : quand ils cassent, ils
 * ne disent rien. Le temps réel s'abonne, annonce "SUBSCRIBED", et ne reçoit
 * jamais rien. Les réglages s'écrivent en local et ne remontent pas. Dans les
 * deux cas l'app a l'air de marcher — jusqu'à ce que Raphaël réinstalle et
 * perde son réacteur, ou qu'un ajout fait sur le web n'apparaisse jamais sur
 * son téléphone. Un typecheck ne dit rien là-dessus, d'où ce script.
 *
 * Tout se fait avec des utilisateurs de test éphémères, créés puis supprimés :
 * rien ne touche aux données de Raphaël. ANON_KEY est la clé publique du
 * projet (celle qui part déjà dans le bundle du site) — jamais la clé de
 * service. SUPABASE_SERVICE_ROLE_KEY vient de l'environnement et ne sert qu'à
 * créer et supprimer les comptes de test.
 */
import pkg from "../node_modules/@supabase/supabase-js/dist/index.cjs"
const { createClient } = pkg

const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANON || !SERVICE) {
  console.error("Il manque ANON_KEY et/ou SUPABASE_SERVICE_ROLE_KEY (voir l'en-tête du fichier).")
  process.exit(2)
}

const admin = createClient(URL_PROJET, SERVICE, { auth: { persistSession: false } })
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

let echecs = 0
const verifier = (nom, ok, detail) => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const comptes = []
async function compteDeTest(tag) {
  const email = `essai-${tag}-${Date.now()}@jarvis-test.local`
  const password = crypto.randomUUID()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`création impossible : ${error.message}`)
  comptes.push(data.user.id)
  const client = createClient(URL_PROJET, ANON, { auth: { persistSession: false } })
  const { data: session, error: e } = await client.auth.signInWithPassword({ email, password })
  if (e) throw new Error(`connexion impossible : ${e.message}`)
  return { id: data.user.id, client, jeton: session.session.access_token }
}

/** Reproduit exactement la séquence du hook useRealtimeRefresh. */
async function ecouter(client, jeton, table, userId) {
  await client.realtime.setAuth(jeton)
  const recus = []
  await new Promise((resolve, reject) => {
    client
      .channel(`essai:${table}:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        (p) => recus.push(p.eventType),
      )
      .subscribe((statut, err) => {
        if (statut === "SUBSCRIBED") resolve()
        if (statut === "CHANNEL_ERROR" || statut === "TIMED_OUT") reject(err ?? new Error(statut))
      })
  })
  // "SUBSCRIBED" dit que le canal est rejoint, pas que le serveur diffuse
  // déjà : le tout premier canal d'une connexion neuve rate une écriture
  // faite dans la seconde. Sans conséquence dans l'app (elle s'abonne à la
  // connexion, les changements arrivent bien après), mais un script qui
  // écrit aussitôt après l'abonnement se croirait en panne.
  await attendre(2000)
  return recus
}

async function attendreUnEvenement(recus, limiteMs = 15000) {
  const fin = Date.now() + limiteMs
  while (recus.length === 0 && Date.now() < fin) await attendre(250)
  return recus.length > 0
}

try {
  const a = await compteDeTest("a")

  // --- Temps réel : l'app doit voir ce qui est écrit AILLEURS. C'est le cas
  // qu'elle ne voyait pas : une tâche ajoutée depuis le web restait invisible
  // dans l'app ouverte sur le téléphone.
  for (const [table, ligne] of [
    ["tasks", { title: "essai temps réel", status: "todo" }],
    ["dev_items", { title: "essai temps réel", status: "todo", priority: "normal" }],
    // Les deux tables du cockpit ajoutées le 4 sept. (migrations 0018 et
    // 0019) : sans diffusion, une section créée depuis le web n'apparaîtrait
    // jamais dans l'app restée ouverte, et une erreur signalée pendant qu'il
    // regarde le cockpit n'arriverait qu'au prochain retour au premier plan.
    ["dev_sections", { nom: "essai temps réel", position: 1 }],
    [
      "jarvis_erreurs",
      { categorie: "autre", titre: "essai temps réel", empreinte: "autre:essai temps reel" },
    ],
  ]) {
    const recus = await ecouter(a.client, a.jeton, table, a.id)
    const { error } = await admin.from(table).insert({ user_id: a.id, ...ligne })
    if (error) { verifier(`temps réel sur ${table}`, false, `insertion impossible : ${error.message}`); continue }
    verifier(`temps réel sur ${table} : l'écriture d'ailleurs arrive`, await attendreUnEvenement(recus),
      "aucun événement reçu — vérifier que la table est dans la publication supabase_realtime (migration 0011)")
  }

  // --- Le piège : sans jeton utilisateur posé AVANT l'abonnement, le canal
  // rejoint avec la seule clé publique, passe quand même "SUBSCRIBED", et ne
  // reçoit jamais rien. RLS refuse en silence. Ce contrôle existe pour que
  // personne ne "simplifie" le hook en retirant le setAuth.
  const muet = createClient(URL_PROJET, ANON, { auth: { persistSession: false } })
  const recusMuets = []
  await new Promise((resolve) => {
    muet
      .channel(`essai:sans-jeton:${a.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${a.id}` },
        (p) => recusMuets.push(p.eventType))
      .subscribe((s) => { if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") resolve() })
  })
  await admin.from("tasks").insert({ user_id: a.id, title: "essai sans jeton", status: "todo" })
  await attendre(6000)
  verifier("sans jeton utilisateur, RLS ne laisse rien passer", recusMuets.length === 0,
    `${recusMuets.length} événement(s) reçus sans jeton : le cloisonnement du temps réel ne tient plus`)

  // --- Réglages : ce qui doit survivre à une réinstallation de l'app.
  const image = `data:image/webp;base64,${"A".repeat(60000)}`
  const valeurs = {
    jarvis_voice_rate: "1.35",
    jarvis_core_image: image,
    jarvis_widget_config: '{"maxTasks":5,"urgentOnly":false,"categoryId":null}',
  }
  const { error: eEcr } = await a.client.from("reglages").upsert(
    { user_id: a.id, valeurs, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  verifier("réglages : écriture par leur propriétaire", !eEcr, eEcr?.message)

  const { data: relu } = await a.client.from("reglages").select("valeurs").eq("user_id", a.id).maybeSingle()
  const lu = relu?.valeurs ?? {}
  const identiques = Object.keys(valeurs).every((k) => lu[k] === valeurs[k])
  verifier("réglages : relus à l'identique, image comprise", identiques,
    `reçu : ${JSON.stringify(Object.keys(lu))}, image intacte : ${lu.jarvis_core_image === image}`)

  const { error: eMaj } = await a.client.from("reglages").upsert(
    { user_id: a.id, valeurs: { ...valeurs, jarvis_voice_rate: "0.9" }, updated_at: new Date().toISOString() },
    { onConflict: "user_id" })
  const { data: relu2 } = await a.client.from("reglages").select("valeurs").eq("user_id", a.id).maybeSingle()
  verifier("réglages : réécrire met à jour au lieu de dupliquer",
    !eMaj && relu2?.valeurs?.jarvis_voice_rate === "0.9", eMaj?.message ?? JSON.stringify(relu2?.valeurs?.jarvis_voice_rate))

  // --- Cloisonnement : les réglages d'un compte sont invisibles aux autres.
  const b = await compteDeTest("b")
  const { data: vol } = await b.client.from("reglages").select("valeurs").eq("user_id", a.id)
  verifier("réglages : un autre compte ne voit rien", (vol ?? []).length === 0, JSON.stringify(vol))
  const { error: ePirate } = await b.client.from("reglages").upsert(
    { user_id: a.id, valeurs: { pirate: "1" } }, { onConflict: "user_id" })
  verifier("réglages : un autre compte ne peut pas écrire", Boolean(ePirate),
    "l'écriture a été acceptée : la policy RLS ne protège plus rien")
} catch (e) {
  verifier("déroulement du script", false, String(e))
} finally {
  for (const id of comptes) await admin.auth.admin.deleteUser(id)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
