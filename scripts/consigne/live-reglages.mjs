/**
 * En conversation Live, une demande de RÉGLAGE part à l'outil — elle n'est ni
 * refusée ni inventée par le modèle.
 *
 *   scripts/essayer-consigne-live.sh reglages
 *
 * MESURÉ le 23 sept. 2026 avec la consigne alors en ligne, qui disait « NEUF
 * de tes réglages » : à « Règle ta vitesse de réponse sur rapide », le modèle
 * répondait « je ne peux pas changer le rythme de la discussion » sans appeler
 * l'outil ; à « quelle est ta vitesse de réponse ? », il inventait « quasi
 * instantanée ». Avec la consigne corrigée : 10 sur 10 partent à l'outil.
 *
 * Les phrases sont SES demandes du soir du 23 sept. ; le dernier cas vérifie
 * l'inverse — une question générale reste une réponse directe, sans outil.
 */
import { readFileSync } from "node:fs"
import { GoogleGenAI, Modality } from "@google/genai"

const { consigne, outil } = JSON.parse(readFileSync(process.argv[2], "utf8"))
const MODELE = process.env.GEMINI_MODELE_LIVE ?? "gemini-2.5-flash-native-audio-preview-12-2025"
const CONTEXTE = "CONTEXTE DE TEST : aucune tâche. Nous sommes le mercredi 23 septembre 2026, 18 h."

async function tour(phrase) {
  const cle = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_TEST, httpOptions: { apiVersion: "v1alpha" } })
  const t = Date.now()
  const jeton = await cle.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime: new Date(t + 60e3).toISOString(),
      expireTime: new Date(t + 1800e3).toISOString(),
      liveConnectConstraints: {
        model: MODELE,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `${consigne}\n\n${CONTEXTE}`,
          tools: [{ functionDeclarations: [outil] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { languageCode: "fr-FR" },
        },
      },
    },
  })
  const ai = new GoogleGenAI({ apiKey: jeton.name, httpOptions: { apiVersion: "v1alpha" } })
  let fini = false
  let erreur = null
  let dit = ""
  const appels = []
  const session = await ai.live.connect({
    model: MODELE,
    config: {},
    callbacks: {
      onmessage: (m) => {
        const c = m.serverContent
        if (c?.outputTranscription?.text) dit += c.outputTranscription.text
        if (c?.turnComplete) fini = true
        if (m.toolCall?.functionCalls?.length) {
          for (const a of m.toolCall.functionCalls) appels.push(a.args)
          session.sendToolResponse({
            functionResponses: m.toolCall.functionCalls.map((a) => ({ id: a.id, name: a.name, response: { resultat: "C'est fait." } })),
          })
        }
      },
      onerror: (e) => (erreur = e.message),
      onclose: (e) => {
        if (!fini) erreur = erreur ?? `fermée : ${e.code} ${e.reason}`
      },
    },
  })
  await new Promise((r) => setTimeout(r, 300))
  const envoye = Date.now()
  session.sendClientContent({ turns: phrase, turnComplete: true })
  while (!fini && !erreur && Date.now() - envoye < 20000) await new Promise((r) => setTimeout(r, 50))
  session.close()
  return { appels, dit, erreur }
}

const CAS = [
  ["Règle ta vitesse de réponse sur rapide.", true],
  ["Parle plus lentement.", true],
  ["Qu'est-ce que j'ai paramétré ?", true],
  ["Quelle est ta vitesse de réponse ?", true],
  ["Active la lecture des rappels à voix haute.", true],
  ["Quelle est la capitale de l'Italie ?", false],
]
let echecs = 0
for (const [phrase, outilAttendu] of CAS) {
  const r = await tour(phrase)
  const ok = !r.erreur && (r.appels.length > 0) === outilAttendu
  if (!ok) echecs++
  console.log(
    `${ok ? "OK  " : "ÉCHEC"} « ${phrase} » ${outilAttendu ? "→ outil" : "→ réponse directe"}\n      ${r.erreur ?? (r.appels.length ? `outil : ${JSON.stringify(r.appels)}` : `dit : ${r.dit.slice(0, 120)}`)}`,
  )
  await new Promise((res) => setTimeout(res, 1200))
}
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
