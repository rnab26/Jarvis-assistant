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
import { DELAI_MAX_MS, quoiRendre } from "../src/lib/demarrageOverlay.ts"

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

// ── Le moteur de reconnaissance ne doit JAMAIS être choisi ────────────────
//
// Constaté le 6 sept. 2026 dans le journal d'écoute de Raphaël :
// « com.raphael.jarvis » est apparu parmi les moteurs de reconnaissance de son
// téléphone, dès que l'APK a déclaré le VoiceInteractionService. Ce moteur ne
// reconnaît rien — s'il était choisi par défaut, Jarvis deviendrait sourd sans
// le moindre message.
const reconnaissanceXml = readFileSync(
  "android/app/src/main/res/xml/recognition_service.xml",
  "utf8",
)
verifier(
  "le moteur de reconnaissance refuse d'être choisi par défaut",
  /android:selectableAsDefault="false"/.test(reconnaissanceXml),
  "sans ça, Android peut le retenir comme moteur du téléphone et plus rien n'écoute",
)

// ── ET IL NE DOIT JAMAIS ÊTRE CHOISI PAR NOUS NON PLUS ──────────────────
//
// `selectableAsDefault="false"` ne parle qu'à Android. Notre propre plugin,
// lui, énumère `queryIntentServices(RecognitionService)` à deux endroits : pour
// choisir automatiquement un moteur, et pour proposer la liste dans Paramètres.
// Mesuré le 8 sept. 2026 dans son journal d'écoute, `com.raphael.jarvis` est
// bel et bien dans cette liste — la déclaration XML ne l'en retire pas.
const patchEcoute = readFileSync(
  "patches/@capacitor-community+speech-recognition+7.0.1.patch",
  "utf8",
)
verifier(
  "notre propre moteur est écarté des deux énumérations du plugin",
  (patchEcoute.match(/getPackageName\(\)\.equals\(info\.serviceInfo\.packageName\)\) continue;/g) ?? []).length >= 2,
  "un seul des deux ne suffit pas : l'un choisit tout seul, l'autre le propose dans Paramètres",
)

// ── LE MOTEUR DE GOOGLE NE SE RÉSUME PAS À L'APPLICATION GOOGLE ──────────
//
// Chantier ba140853, mesuré le 8 sept. 2026 sur son téléphone. Le plugin ne
// cherchait que « com.google.android.googlequicksearchbox » ; elle n'est PAS
// installée chez lui. `queryIntentServices` rend
// « com.google.android.as,com.google.android.tts,com.anthropic.claude,
// com.raphael.jarvis ». On retombait donc sur le service par défaut — celui
// qui bipe et qui coupe — et son journal le prouve : sur 48 heures, autant de
// rafales mortes en 20-60 ms avec ERROR_SERVER_DISCONNECTED que de rafales
// normales (50 contre 51 sur une heure, 43 contre 34 sur une autre). Une
// ouverture de micro sur deux ne servait à rien, et chacune fait sa tonalité.
// LE CONTRÔLE VISE LA LISTE, PAS LE MOT. Première version : il cherchait
// « com.google.android.as » n'importe où dans le patch — et le paquet est
// aussi CITÉ dans le commentaire qui explique la mesure. Essayé à l'envers en
// retirant le paquet de la liste, il restait vert : il voyait le commentaire.
// Même piège que le sélecteur Playwright et que `Filesystem.mkdir` : un
// contrôle doit viser ce qui AGIT.
const listeGoogle = patchEcoute.match(/PAQUETS_GOOGLE = \{([\s\S]*?)\};/)?.[1] ?? ""
verifier(
  "Android System Intelligence est DANS la liste des moteurs Google",
  /com\.google\.android\.as/.test(listeGoogle),
  `sans lui, un téléphone sans l'application Google retombe sur le service par défaut — liste lue : ${listeGoogle.replace(/\s+/g, " ").trim() || "introuvable"}`,
)
verifier(
  "et la synthèse vocale de Google n'est PAS prise pour de la reconnaissance",
  listeGoogle !== "" && !/com\.google\.android\.tts/.test(listeGoogle),
  "com.google.android.tts fait parler, pas écouter — son nom ressemble, c'est tout",
)

// ── Une seule fenêtre monte un micro à la fois ───────────────────────────
//
// LE BUG DU 6 SEPT., 8 h 24 : estOverlay() est asynchrone, et pendant qu'elle
// répondait le routeur rendait déjà la route « / » — donc la coquille de l'app
// normale, donc un premier micro, qui consommait le drapeau « démarre
// l'écoute » posé par l'activité avant de se faire démonter. Le micro de la
// fenêtre d'assistance arrivait ensuite, ne trouvait plus le drapeau, et
// attendait le mot-clé. Le journal montrait les deux rafales à 40 ms d'écart.
verifier(
  "on n'affiche rien tant qu'on ne sait pas dans quelle fenêtre on est",
  quoiRendre("inconnu") === "attendre",
)
verifier(
  "et la fenêtre d'assistance se rend sans passer par une redirection",
  quoiRendre("overlay") === "overlay" && quoiRendre("normal") === "normal",
  "une redirection laisserait, le temps d'un rendu, un second micro se monter",
)
verifier(
  "le filet existe : un pont muet ne laisse pas un écran blanc",
  DELAI_MAX_MS > 0 && DELAI_MAX_MS <= 3000,
  `${DELAI_MAX_MS} ms — une app qui s'affiche vaut mieux qu'une app qui attend`,
)

const app = readFileSync("src/App.tsx", "utf8")
verifier(
  "App.tsx applique bien cette décision avant de rendre les routes",
  app.includes("quoiRendre") && /if \(rendu === "attendre"\) return null/.test(app),
  "sinon la coquille de l'app normale se remonte pendant l'attente, et le bug revient",
)
verifier(
  "et la fenêtre d'assistance n'est plus atteinte par navigate()",
  !app.includes('navigate("/assistant"'),
  "la redirection est précisément ce qui montait deux micros",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
