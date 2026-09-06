/**
 * Vérifie que les applications proposées sont celles du TÉLÉPHONE.
 *
 *   node --experimental-strip-types scripts/verifier-apps-par-defaut.ts
 *
 * D'OÙ ÇA VIENT. Raphaël, 6 sept. 2026 : « il a une certaine logique de me
 * demander pour un itinéraire quelle application j'utilise, mais il ne sait
 * pas la lancer. Il me dit que je peux voir dans l'application à quelle
 * application il a l'autorisation — sauf qu'en aucun cas il y a Waze. Il n'y
 * a pas les applications qu'il y a. »
 *
 * MÊME CAUSE RACINE QUE WHATSAPP BUSINESS LE MATIN MÊME : on suppose au lieu
 * de regarder. Trois défauts dans une phrase, et ce contrôle tient les trois :
 * 1. la liste doit venir du téléphone, interrogé sur l'intent RÉEL qui sera
 *    lancé — et il faut qu'il y AIT une liste, ce qui n'était pas le cas pour
 *    les itinéraires ni la musique ;
 * 2. demander « quelle application ? » puis ne rien lancer est pire que ne
 *    pas demander : une préférence qui ne correspond à rien doit se DIRE,
 *    pas retomber en silence sur le sélecteur d'Android ;
 * 3. l'écran vers lequel Jarvis renvoie doit être celui qui répond à la
 *    question — « Tes applications par défaut », jamais « Autorisations ».
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const java = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/ActionsTelephonePlugin.java",
  "utf8",
)
const manifeste = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")
const carte = readFileSync("src/components/settings/AppsParDefaut.tsx", "utf8")
const vocales = readFileSync("src/lib/actionsTelephoneVocales.ts", "utf8")
const consigne = readFileSync("supabase/functions/voice-command/index.ts", "utf8")

const sansCommentaires = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")

// --- 1. La liste vient du téléphone ----------------------------------------

verifier(
  "le téléphone est interrogé sur l'intent RÉEL d'un itinéraire",
  /public void listerApplicationsItineraire/.test(java) && /Uri\.parse\("geo:/.test(java),
  "une liste écrite dans le code est fausse le jour où il installe autre chose",
)
verifier(
  "et sur celui d'une demande de musique",
  /public void listerApplicationsMusique/.test(java) &&
    /MEDIA_PLAY_FROM_SEARCH/.test(java) &&
    /CATEGORY_APP_MUSIC/.test(java),
  "les deux : celles qui savent jouer une recherche, et celles qui se déclarent lecteurs",
)
verifier(
  "les lecteurs de musique sont visibles depuis Android 11",
  /android\.intent\.category\.APP_MUSIC/.test(manifeste),
  "sans la déclaration <queries>, ils sont invisibles et la liste est fausse — sans le moindre message",
)

// --- 2. Il y a VRAIMENT une liste à l'écran, pour les trois -----------------

const propre = sansCommentaires(carte)
for (const [titre, lister] of [
  ["Musique", "listerMusique"],
  ["Appels", "listerAppel"],
  ["Itinéraires", "listerItineraire"],
] as const) {
  verifier(
    `« ${titre} » se choisit à l'écran, la liste vient du téléphone`,
    new RegExp(`titre="${titre}"[\\s\\S]{0,400}?lister=\\{${lister}\\}`).test(propre) &&
      new RegExp(`titre="${titre}"[\\s\\S]{0,500}?onChoisir=`).test(propre),
    "ces lignes montraient la valeur retenue et un bouton « Oublier », rien d'autre : impossible de voir Waze, impossible de le choisir",
  )
}
verifier(
  "et l'ancienne ligne sans liste n'existe plus",
  !/function Ligne\(/.test(carte),
  "deux façons d'afficher la même chose finiraient par ne plus dire pareil",
)
verifier(
  "« je n'ai pas pu regarder » ne se dit pas comme « il n'y a rien »",
  /siAucune/.test(carte) && /apps === null/.test(carte),
  "hors de l'app, ou sur une APK ancienne, il n'y a pas de liste à afficher — ce n'est pas une absence d'applications",
)

// --- 3. Demander puis ne rien faire ----------------------------------------

const navigate = vocales.slice(
  vocales.indexOf('case "navigate_to"'),
  vocales.indexOf('case "media_control"'),
)
verifier(
  "une préférence qui ne correspond à aucune application se DIT",
  /if \(!paquet\)/.test(sansCommentaires(navigate)) &&
    /Paramètres/.test(navigate) &&
    /noterEcoute\("app_introuvable"/.test(navigate),
  "avant, ça retombait en silence sur le sélecteur d'Android et Jarvis annonçait quand même « je t'ouvre l'itinéraire »",
)
verifier(
  "et l'itinéraire est cherché dans la liste PAR USAGE, pas dans toutes les apps",
  /appsItineraire\(\)/.test(navigate),
)
verifier(
  "la préférence retenue est validée contre cette même liste",
  /action\.category === "navigation"[\s\S]{0,120}?appsItineraire\(\)/.test(vocales) &&
    /appsMusique\(\)/.test(vocales),
  "retenir une application qui ne répond pas à l'intent ne changerait rien une fois choisie",
)
verifier(
  "une APK ancienne ne fait pas échouer la commande",
  /catch \{[\s\S]{0,200}?listerApplications\(\)/.test(vocales),
  "depuis la mise à jour rapide, une interface récente peut tourner dans une ancienne coquille",
)

// --- 4. Le bon écran -------------------------------------------------------

verifier(
  "la consigne envoie vers « Tes applications par défaut »",
  /Tes applications par défaut/.test(consigne),
)
verifier(
  "et interdit explicitement de renvoyer vers les autorisations pour ça",
  /N'envoie JAMAIS vers « Autorisations du téléphone » pour ça/.test(consigne),
  "il a suivi ce renvoi et n'y a trouvé aucune application : cet écran ne parle que de ce que le système laisse faire",
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
