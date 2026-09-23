/**
 * Retrouver l'application qu'il nomme, et surtout ne pas en ouvrir une autre.
 *
 *   node --experimental-strip-types scripts/verifier-trouver-application.ts
 *
 * Aucun réseau. Le cas réel : le 18 sept. 2026 à 12h05, 12h07 et 12h08,
 * « Ouvre l'application WhatsApp » puis « Ouvre l'application YouTube » ont
 * répondu « J'ouvre מכבי ». Déjà vu le 5 et le 6 sept., contourné deux fois
 * sans que la cause soit trouvée : un nom hébreu devenait une chaîne vide, et
 * une chaîne vide est contenue dans toutes les demandes.
 */
import { trouverApplication, type ApplicationInstallee } from "../src/lib/actionsTelephone.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const app = (nom: string, paquet: string): ApplicationInstallee => ({ nom, paquet }) as ApplicationInstallee
// Un extrait de SES applications : une banque et une caisse de santé aux noms
// hébreux, à côté de celles qu'il demande.
const APPS = [
  app("מכבי", "com.ideomobile.maccabi"),
  app("הפועלים", "com.ideomobile.hapoalim"),
  app("WhatsApp", "com.whatsapp"),
  app("WhatsApp Business", "com.whatsapp.w4b"),
  app("YouTube", "com.google.android.youtube"),
  app("YouTube Music", "com.google.android.apps.youtube.music"),
  app("Waze", "com.waze"),
  app("Play Store", "com.android.vending"),
]
const nom = (demande: string) => trouverApplication(APPS, demande)?.nom ?? null

verifier("« l'application WhatsApp » → WhatsApp (le cas du 18 sept.)", nom("L'application whatsapp") === "WhatsApp", String(nom("L'application whatsapp")))
verifier("« l'application YouTube » → YouTube (le cas du 18 sept.)", nom("L'application YouTube") === "YouTube", String(nom("L'application YouTube")))
verifier("« l'appli Waze » → Waze", nom("l'appli Waze") === "Waze", String(nom("l'appli Waze")))
verifier("un nom qu'il n'a pas : RIEN, jamais מכבי", nom("Spotify") === null, String(nom("Spotify")))
verifier("une phrase sans nom d'application : rien", nom("un épisode de la série H") === null, String(nom("un épisode de la série H")))
verifier("le nom hébreu dit tel quel se trouve", nom("מכבי") === "מכבי", String(nom("מכבי")))
verifier("un nom dicté approximatif se rapproche encore", nom("Whatsap") === "WhatsApp", String(nom("Whatsap")))
verifier("« YouTube » exact ne rafle pas YouTube Music", nom("youtube") === "YouTube", String(nom("youtube")))
verifier("deux lettres ne se rapprochent de rien", nom("Wa") === null, String(nom("Wa")))

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
