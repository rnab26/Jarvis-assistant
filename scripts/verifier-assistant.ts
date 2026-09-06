/**
 * Vérifie que Jarvis peut être CHOISI comme assistant du téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-assistant.ts
 *
 * POURQUOI CE CONTRÔLE EXISTE. Le 5 sept. 2026 on avait déclaré une activité
 * exportée répondant à ACTION_ASSIST — l'une des deux branches qu'AOSP
 * accepte. Le 6 sept. au matin, Raphaël a suivi le chemin jusqu'au bout
 * (Fonctions avancées › Touche latérale › Appuyer longuement › Application
 * d'assistant numérique par défaut › Autres applications) et Jarvis n'y était
 * pas : la liste de Samsung ne montre que l'autre branche, un vrai
 * VoiceInteractionService.
 *
 * CE QUI REND CE CONTRÔLE NÉCESSAIRE, et pas seulement utile : quand une de
 * ces déclarations manque, Android REJETTE le service EN SILENCE. Rien dans
 * l'app, rien à l'écran, rien dans un typecheck — Jarvis disparaît simplement
 * de la liste, et on refait le chemin pour rien. Les conditions ci-dessous
 * sont relevées dans la source d'AOSP le 6 sept. 2026
 * (VoiceInteractionServiceInfo, frameworks/base, branche main), pas citées de
 * mémoire.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const manifeste = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")
const interaction = readFileSync("android/app/src/main/res/xml/interaction_service.xml", "utf8")

/** Le bloc <service> qui porte un nom donné, pour ne pas confondre deux
 * services quand on cherche une permission ou une meta-data. */
function blocService(nom: string): string {
  const debut = manifeste.indexOf(`android:name="${nom}"`)
  if (debut < 0) return ""
  const ouverture = manifeste.lastIndexOf("<service", debut)
  const fin = manifeste.indexOf("</service>", debut)
  return manifeste.slice(ouverture, fin < 0 ? debut + 400 : fin)
}

const principal = blocService(".JarvisVoiceInteractionService")

verifier(
  "le VoiceInteractionService est déclaré",
  principal.length > 0,
  "sans lui, la liste de Samsung ne montre pas Jarvis, quoi que fasse l'activité ACTION_ASSIST",
)
verifier(
  "il est protégé par BIND_VOICE_INTERACTION, exactement",
  /android:permission="android\.permission\.BIND_VOICE_INTERACTION"/.test(principal),
  "VoiceInteractionServiceInfo compare si.permission à cette chaîne et refuse tout le service sinon",
)
verifier(
  "il est exporté : c'est le système qui s'y lie",
  /android:exported="true"/.test(principal),
  "non exporté, Android ne peut pas s'y lier — et la permission de signature reste la protection",
)
verifier(
  "il répond à l'action attendue",
  principal.includes("android.service.voice.VoiceInteractionService"),
)
verifier(
  "il porte la meta-data android.voice_interaction",
  principal.includes('android:name="android.voice_interaction"') &&
    principal.includes("@xml/interaction_service"),
  "sans elle : « No android.voice_interaction meta-data », et le service est ignoré",
)

verifier(
  "le XML a bien <voice-interaction-service> pour racine",
  /<voice-interaction-service/.test(interaction),
  "« Meta-data does not start with voice-interaction-service tag »",
)
verifier(
  "sessionService est renseigné",
  /android:sessionService="com\.raphael\.jarvis\.JarvisVoiceInteractionSessionService"/.test(interaction),
  "sinon « No sessionService specified » — le service entier est rejeté",
)
verifier(
  "recognitionService est renseigné",
  /android:recognitionService="com\.raphael\.jarvis\.JarvisRecognitionService"/.test(interaction),
  "sinon « No recognitionService specified » — même rejet, même silence",
)
verifier(
  "supportsAssist est vrai",
  /android:supportsAssist="true"/.test(interaction),
  "sans lui, le rôle assistant ignore l'application sans rien dire",
)

const session = blocService(".JarvisVoiceInteractionSessionService")
verifier(
  "la SessionService annoncée dans le XML existe dans le manifeste",
  session.length > 0,
  "un sessionService qui pointe dans le vide fait échouer l'ouverture de la session",
)
verifier(
  "et elle est protégée par BIND_VOICE_INTERACTION",
  /android:permission="android\.permission\.BIND_VOICE_INTERACTION"/.test(session),
  "c'est ce qui empêche n'importe quelle app de s'y lier",
)

const reconnaissance = blocService(".JarvisRecognitionService")
verifier(
  "le RecognitionService annoncé existe lui aussi",
  reconnaissance.length > 0,
  "il ne reconnaît rien, mais son absence fait rejeter tout le VoiceInteractionService",
)

// Les trois classes Java existent réellement : un nom mal orthographié dans le
// manifeste passe le build et ne se voit que sur le téléphone.
for (const classe of [
  "JarvisVoiceInteractionService",
  "JarvisVoiceInteractionSessionService",
  "JarvisVoiceInteractionSession",
  "JarvisRecognitionService",
]) {
  let existe = true
  try {
    readFileSync(`android/app/src/main/java/com/raphael/jarvis/${classe}.java`, "utf8")
  } catch {
    existe = false
  }
  verifier(`${classe}.java existe`, existe)
}

// L'activité ACTION_ASSIST reste : c'est l'autre branche d'AOSP, et elle sert
// aux surcouches qui la regardent. Le service ne la remplace pas.
verifier(
  "l'activité ACTION_ASSIST est toujours déclarée",
  manifeste.includes("android.intent.action.ASSIST"),
  "les deux branches valent mieux qu'une : toutes les surcouches ne regardent pas la même",
)

// La session ouvre la fenêtre existante et se retire : sans hide(), elle reste
// vivante au-dessus, invisible, et le prochain appui long ne rouvre rien.
const codeSession = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/JarvisVoiceInteractionSession.java",
  "utf8",
)
verifier(
  "la session ouvre la fenêtre d'assistance existante",
  codeSession.includes("AssistOverlayActivity"),
  "en redessiner une seconde ferait deux écrans à tenir à jour",
)
verifier(
  "et elle se retire ensuite",
  codeSession.includes("hide()"),
  "sans hide(), la session reste au-dessus et le prochain appui long ne rouvre rien",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
