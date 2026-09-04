/**
 * Le modèle Live reçoit-il vraiment la consigne et le contexte ?
 *
 *   ANON_KEY=... node scripts/verifier-live-contexte.mjs
 *
 * Test du 4 sept. : Jarvis en mode Live disait « je n'ai pas accès à mes
 * tâches » alors que l'app lui fournit ses tâches dans la consigne. Ce script
 * ouvre une vraie session Live depuis Node, avec un jeton de la fonction
 * déployée et une consigne qui contient UNE tâche inventée, pose la question
 * en texte, et lit la transcription de la réponse. Si la tâche inventée n'y
 * est pas, la consigne n'arrive pas au modèle.
 *
 * Depuis le chantier f8484707, il vérifie AUSSI que les souvenirs suivent :
 * c'est live-jeton lui-même qui les joint au contexte scellé, pas l'app. En
 * mode classique voice-command les cherche à chaque phrase ; en Live le
 * contexte est scellé une fois à l'ouverture, donc Jarvis serait amnésique
 * dans un mode et pas dans l'autre si personne ne les joignait.
 *
 * COÛT : ce script ouvre de VRAIES sessions Live, et live-jeton n'a pas encore
 * le branchement vers la clé de test (chantier 9ad79fbf) — il puise donc dans
 * le quota de Raphaël. À lancer quand on change la consigne ou le contexte
 * Live, pas à chaque déploiement.
 */
import { GoogleGenAI } from "@google/genai"

const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!ANON || !SERVICE) { console.error("ANON_KEY et SUPABASE_SERVICE_ROLE_KEY requis"); process.exit(2) }

const email = `essai-${Date.now()}@jarvis-test.local`
const motDePasse = crypto.randomUUID()
const admin = async (chemin, options = {}) => {
  const r = await fetch(`${URL_PROJET}${chemin}`, { ...options, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...options.headers } })
  return { statut: r.status, corps: await r.json().catch(() => null) }
}
const cree = await admin("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: motDePasse, email_confirm: true }) })
const userId = cree.corps?.id
if (!userId) { console.error("création impossible", cree); process.exit(1) }
const connexion = await fetch(`${URL_PROJET}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: motDePasse }) })
const jwt = (await connexion.json()).access_token

let echecs = 0
const verifier = (nom, ok, detail = "") => { if (!ok) echecs++; console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok || !detail ? "" : `\n      ${detail}`}`) }

try {
  const TACHE = "Repeindre le portail du hangar bleu"
  const contexte = `Tâches à faire de Raphaël (1) :\n- ${TACHE}`
  // Le contexte part dans le jeton, comme le fait l'app : c'est le seul
  // chemin par lequel Google l'accepte (vérifié le 4 sept.).
  const r = await fetch(`${URL_PROJET}/functions/v1/live-jeton`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ contexte }) })
  const { jeton, modele } = await r.json()
  verifier("jeton obtenu", !!jeton)

  const ai = new GoogleGenAI({ apiKey: jeton, httpOptions: { apiVersion: "v1alpha" } })
  let sortie = ""
  let audio = 0
  let outils = 0
  let fini = false
  let erreur = null
  const session = await ai.live.connect({
    model: modele,
    config: {},
    callbacks: {
      onmessage: (m) => {
        const c = m.serverContent
        if (c?.outputTranscription?.text) sortie += c.outputTranscription.text
        for (const p of c?.modelTurn?.parts ?? []) {
          if (p.inlineData) audio++
          if (p.text) sortie += p.text
        }
        if (m.toolCall) outils++
        if (c?.turnComplete) fini = true
        if (process.env.DEBUG) console.log(JSON.stringify(m).slice(0, 300))
      },
      onerror: (e) => { erreur = e.message },
      onclose: (e) => { if (!fini) erreur = erreur ?? `fermée : ${e.reason}` },
    },
  })
  session.sendClientContent({ turns: "Quelles sont mes tâches à faire ?", turnComplete: true })
  const debut = Date.now()
  while (!fini && !erreur && Date.now() - debut < 25000) await new Promise((r) => setTimeout(r, 200))
  session.close()

  verifier("le modèle a répondu", fini, erreur ?? "pas de réponse en 25 s")
  console.log(`      réponse : « ${sortie.trim().slice(0, 200)} » — ${audio} paquets audio, ${outils} appel(s) d'outil`)
  verifier("la tâche fournie dans la consigne est citée", /portail|hangar/i.test(sortie), "la consigne n'atteint pas le modèle")
  verifier("il ne dit pas qu'il n'a pas accès", !/pas acc[eè]s/i.test(sortie))

  // ── Les souvenirs suivent-ils jusqu'au modèle ? ──
  //
  // Le fait est inventé et improbable exprès : s'il ressort, il ne peut venir
  // que de la base, pas des connaissances du modèle.
  const SOUVENIR = "Le chien de Raphaël s'appelle Zoltan et il a peur des trottinettes."
  const ecrit = await fetch(`${URL_PROJET}/rest/v1/souvenirs`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, contenu: SOUVENIR, categorie: "fait" }),
  })
  verifier("le souvenir de test est écrit", ecrit.ok, `HTTP ${ecrit.status}`)

  const r2 = await fetch(`${URL_PROJET}/functions/v1/live-jeton`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ contexte }),
  })
  const { jeton: jeton2, modele: modele2 } = await r2.json()
  verifier("deuxième jeton obtenu", !!jeton2)

  let sortie2 = ""
  let fini2 = false
  let erreur2 = null
  const ai2 = new GoogleGenAI({ apiKey: jeton2, httpOptions: { apiVersion: "v1alpha" } })
  const session2 = await ai2.live.connect({
    model: modele2,
    config: {},
    callbacks: {
      onmessage: (m) => {
        const c = m.serverContent
        if (c?.outputTranscription?.text) sortie2 += c.outputTranscription.text
        for (const p of c?.modelTurn?.parts ?? []) if (p.text) sortie2 += p.text
        if (c?.turnComplete) fini2 = true
      },
      onerror: (e) => { erreur2 = e.message },
      onclose: (e) => { if (!fini2) erreur2 = erreur2 ?? `fermée : ${e.reason}` },
    },
  })
  session2.sendClientContent({ turns: "Comment s'appelle mon chien ?", turnComplete: true })
  const debut2 = Date.now()
  while (!fini2 && !erreur2 && Date.now() - debut2 < 25000) await new Promise((r) => setTimeout(r, 200))
  session2.close()

  verifier("le modèle a répondu à la seconde question", fini2, erreur2 ?? "pas de réponse en 25 s")
  console.log(`      réponse : « ${sortie2.trim().slice(0, 200)} »`)
  verifier(
    "en Live, Jarvis se sert de ce qu'il a retenu",
    /zoltan/i.test(sortie2),
    "le souvenir n'atteint pas le modèle : Jarvis est amnésique en Live alors qu'il sait en mode classique",
  )
} finally {
  await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
}
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
