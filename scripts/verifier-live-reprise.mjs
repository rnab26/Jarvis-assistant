/**
 * Une conversation Live REPREND après une coupure au lieu de repartir de zéro
 * (chantier 0373a04d, « adapter Jarvis aux longues discussions »).
 *
 *   ANON_KEY=... node scripts/verifier-live-reprise.mjs
 *
 * Mesuré le 23 sept. 2026 : Google ferme la session Live toutes les ~9-10
 * minutes (« Google a demandé de fermer la session »), l'app en rouvre une,
 * et avant ce correctif Jarvis oubliait TOUT ce qui venait d'être dit.
 *
 * Ce contrôle ouvre une VRAIE session (clé de test, `x-jarvis-essai`), lui
 * donne un mot à retenir, récupère la poignée de reprise que Google envoie,
 * ferme, rouvre AVEC la poignée par live-jeton — exactement le chemin de
 * l'app —, et demande le mot. Il ne peut passer qu'une fois live-jeton
 * REDÉPLOYÉ avec `sessionResumption` : avant, Google n'envoie aucune poignée
 * et le contrôle le dit (« aucune poignée reçue ») au lieu de faire semblant.
 *
 * Un utilisateur de test éphémère est créé puis supprimé.
 */
import { GoogleGenAI } from "@google/genai"

const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!ANON || !SERVICE) {
  console.error("ANON_KEY et SUPABASE_SERVICE_ROLE_KEY requis")
  process.exit(2)
}

let echecs = 0
const verifier = (nom, ok, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok || !detail ? "" : `\n      ${detail}`}`)
}

const admin = async (chemin, options = {}) => {
  const r = await fetch(`${URL_PROJET}${chemin}`, {
    ...options,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...options.headers },
  })
  return { statut: r.status, corps: await r.json().catch(() => null) }
}

const email = `essai-${crypto.randomUUID()}@jarvis-test.local`
const motDePasse = crypto.randomUUID()
const cree = await admin("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email, password: motDePasse, email_confirm: true }),
})
const userId = cree.corps?.id
if (!userId) {
  console.error("création impossible", cree)
  process.exit(1)
}
const jwt = (
  await (
    await fetch(`${URL_PROJET}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: motDePasse }),
    })
  ).json()
).access_token

async function jeton(reprise) {
  const r = await fetch(`${URL_PROJET}/functions/v1/live-jeton`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", "x-jarvis-essai": "1" },
    body: JSON.stringify({ contexte: "Contexte de test.", reprise }),
  })
  return r.json()
}

/** Ouvre une session, envoie une phrase, attend la fin du tour ; rend ce qui
 * a été dit et la dernière poignée reprenable reçue. */
async function tour(reprise, phrase) {
  const { jeton: j, modele } = await jeton(reprise)
  if (!j) return { erreur: "pas de jeton" }
  const ai = new GoogleGenAI({ apiKey: j, httpOptions: { apiVersion: "v1alpha" } })
  let sortie = ""
  let fini = false
  let erreur = null
  let poignee = null
  let session = null
  session = await ai.live.connect({
    model: modele,
    config: {},
    callbacks: {
      onmessage: (m) => {
        const c = m.serverContent
        if (c?.outputTranscription?.text) sortie += c.outputTranscription.text
        for (const p of c?.modelTurn?.parts ?? []) if (p.text) sortie += p.text
        if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) {
          poignee = m.sessionResumptionUpdate.newHandle
        }
        if (c?.turnComplete) fini = true
        // Le modèle peut vouloir passer par son outil (« retiens » ressemble
        // à une commande) : sans réponse, le tour ne se termine jamais.
        if (m.toolCall?.functionCalls?.length) {
          session.sendToolResponse({
            functionResponses: m.toolCall.functionCalls.map((a) => ({
              id: a.id,
              name: a.name ?? "commande_jarvis",
              response: { resultat: "C'est noté." },
            })),
          })
        }
      },
      onerror: (e) => {
        erreur = e.message
      },
      onclose: (e) => {
        if (!fini) erreur = erreur ?? `fermée : ${e.reason}`
      },
    },
  })
  session.sendClientContent({ turns: phrase, turnComplete: true })
  const debut = Date.now()
  while (!fini && !erreur && Date.now() - debut < 25000) await new Promise((r) => setTimeout(r, 200))
  // Une poignée reprenable arrive souvent juste APRÈS la fin du tour.
  const apres = Date.now()
  while (!poignee && !erreur && Date.now() - apres < 5000) await new Promise((r) => setTimeout(r, 200))
  session.close()
  return { sortie, poignee, erreur, fini }
}

try {
  const premier = await tour(null, "Pour tester ta mémoire de conversation : le mot du jour est ANANAS-VIOLET. Ne fais aucune action, réponds seulement « d'accord ».")
  verifier("première session : le modèle a répondu", premier.fini, premier.erreur ?? "pas de fin de tour en 25 s")
  verifier(
    "Google a donné une poignée de reprise",
    Boolean(premier.poignee),
    "aucune poignée reçue — live-jeton déployé ne demande pas encore sessionResumption (à redéployer)",
  )
  if (premier.poignee) {
    const second = await tour(premier.poignee, "Quel était le mot du jour que je t'ai donné tout à l'heure ?")
    verifier("la session rouverte AVEC la poignée répond", second.fini, second.erreur ?? "")
    console.log(`      réponse : « ${second.sortie.trim().slice(0, 200)} »`)
    verifier(
      "…et se souvient de ce qui a été dit avant la coupure",
      /ananas/i.test(second.sortie),
      "la conversation est repartie de zéro : la poignée n'a pas été appliquée",
    )
  }
} catch (e) {
  verifier("déroulement du script", false, String(e))
} finally {
  await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
