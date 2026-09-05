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
  const r = await fetch(`${URL_PROJET}/functions/v1/live-jeton`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", "x-jarvis-essai": "1" }, body: JSON.stringify({ contexte }) })
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
} finally {
  await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
}
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
