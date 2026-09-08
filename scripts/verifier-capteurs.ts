/**
 * Un capteur générique sur TOUTE action que Jarvis exécute (chantier
 * d50d5f34), pas seulement celles qui avaient déjà leur propre trace.
 *
 *   node --experimental-strip-types scripts/verifier-capteurs.ts
 *
 * Aucun réseau : ce contrôle LIT LE CODE, comme `verifier-pannes-silencieuses.ts`
 * — c'est le seul moyen de vérifier une règle de FORME (chaque chemin
 * d'exécution garde sa trace) sans microphone ni téléphone réel.
 *
 * POURQUOI CE CAPTEUR-LÀ ET PAS TRENTE. `screen_action`, la musique, les
 * notifications lues ont déjà leur propre `noterEcoute` détaillé
 * (`controleEcran.ts`, `actionsTelephoneVocales.ts`, `notificationsAndroid.ts`)
 * — les compter ici referait un contrôle qui existe déjà ailleurs. Ce qui
 * MANQUAIT, mesuré en lisant les vrais appels de `noterEcoute` du dépôt
 * (aucun ne couvrait add_task, add_dev_item, set_setting, open_app…) : un
 * filet unique posé au point où TOUTES les actions passent
 * (`executerActions` dans MicButton.tsx), plutôt que d'instrumenter un par un
 * chacun de la trentaine de cas d'`executeVoiceAction` — ce qui en aurait
 * fatalement oublié un.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const mic = readFileSync(
  new URL("../src/components/voice/MicButton.tsx", import.meta.url),
  "utf8",
)

const debut = mic.indexOf("async function executerActions")
verifier("executerActions existe toujours dans MicButton.tsx", debut !== -1)
const fin = mic.indexOf("\n  }\n\n  /**", debut)
const corps = debut !== -1 ? mic.slice(debut, fin === -1 ? undefined : fin) : ""

const appelsCapteur = [...corps.matchAll(/noterEcoute\("action_executee"/g)].length
verifier(
  "le capteur générique est posé exactement deux fois (succès et échec), ni plus ni moins",
  appelsCapteur === 2,
  `trouvé ${appelsCapteur} fois`,
)

// Le succès : juste après l'appel à executeVoiceAction, avant le catch.
const iTry = corps.indexOf("await executeVoiceAction(")
const iCatch = corps.indexOf("} catch (e) {")
const iCapteurSucces = corps.indexOf('noterEcoute("action_executee"', iTry)
verifier(
  "le capteur de succès est posé APRÈS l'exécution de l'action, avant le catch",
  iTry !== -1 && iCatch !== -1 && iCapteurSucces !== -1 && iCapteurSucces > iTry && iCapteurSucces < iCatch,
)

// L'échec : dans le catch, et AVANT que signalerErreur ne soit appelé (peu
// importe l'ordre réel entre les deux, mais les deux doivent être dans le
// même bloc catch).
const blocCatch = iCatch !== -1 ? corps.slice(iCatch) : ""
verifier(
  "le capteur d'échec vit dans le même bloc catch que signalerErreur",
  blocCatch.includes('noterEcoute("action_executee"') && blocCatch.includes("signalerErreur("),
)

verifier(
  "les deux appels portent le type d'action ET sa cible, pas juste « ça a marché »",
  (corps.match(/noterEcoute\("action_executee", \{ action: action\.action, cible,/g) ?? []).length === 2,
  "un capteur sans cible ne distingue pas deux échecs de la même famille (deux applications différentes, par exemple)",
)

verifier(
  "les deux appels disent s'ils réussissent ou échouent (reussi: true/false)",
  corps.includes("reussi: true") && corps.includes("reussi: false"),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
