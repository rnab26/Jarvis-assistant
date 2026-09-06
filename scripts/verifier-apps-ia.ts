/**
 * Vérifie les connecteurs d'IA, sans téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-apps-ia.ts
 *
 * CE QUI PEUT ÊTRE FAUX EN SILENCE ICI :
 *
 * 1. « TU N'AS AUCUNE APPLICATION D'IA » DIT SANS AVOIR REGARDÉ. Hors de
 *    l'app empaquetée, il n'y a pas d'applications à lister — ce n'est pas la
 *    même chose que « j'ai regardé et il n'y en a pas ». C'est l'erreur que
 *    repertoire.ts évite déjà pour les contacts, et elle se réintroduit en
 *    rendant un tableau vide.
 * 2. UNE LISTE QUI LIMITE AU LIEU DE METTRE EN AVANT. Sa demande dit « en vrai
 *    on peut même le faire pour toutes les applis » : les applications
 *    reconnues sont mises en tête, jamais les seules choisissables.
 * 3. UNE SECONDE CLÉ DE RÉGLAGE. `jarvis_app_ia` existait déjà ; en créer une
 *    autre ferait deux endroits où lire la favorite, avec la moitié dans
 *    chacun.
 */
import { readFileSync } from "node:fs"
import {
  APPS_IA_CONNUES,
  EXEMPLE_FAVORITE,
  etatConnecteurs,
  exemplePour,
  filtrerApps,
  trierAppsIA,
} from "../src/lib/appsIA.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const SON_TELEPHONE = [
  { nom: "WhatsApp", paquet: "com.whatsapp" },
  { nom: "Perplexity", paquet: "ai.perplexity.app.android" },
  { nom: "YouTube", paquet: "com.google.android.youtube" },
  { nom: "ChatGPT", paquet: "com.openai.chatgpt" },
  { nom: "Waze", paquet: "com.waze" },
]

verifier(
  "les IA sont reconnues parmi les applications installées",
  trierAppsIA(SON_TELEPHONE).ia.map((a) => a.nom).join(",") === "Perplexity,ChatGPT",
  "et dans l'ordre de la liste connue, pour que l'affichage ne bouge pas d'un lancement à l'autre",
)
verifier(
  "et le reste n'est pas jeté : il reste choisissable",
  trierAppsIA(SON_TELEPHONE).autres.length === 3,
  "« en vrai on peut même le faire pour toutes les applis » — sa demande du 5 sept.",
)
verifier(
  "une IA reconnue à son NOM quand le paquet est inconnu",
  trierAppsIA([{ nom: "Claude", paquet: "com.exemple.reconditionne" }]).ia.length === 1,
  "un fabricant peut redistribuer la même application sous un autre paquet",
)
verifier(
  "un nom qui CONTIENT celui d'une IA n'en est pas une",
  trierAppsIA([{ nom: "Gemini Calculator", paquet: "com.x.calc" }]).ia.length === 0,
  "on compare le nom entier, sinon la moitié du téléphone passerait pour une IA",
)

verifier(
  "hors de l'app, on ne prétend PAS qu'il n'a rien",
  etatConnecteurs(null).etat === "hors_app",
  "« je n'ai pas pu regarder » et « il n'y en a pas » ne se disent pas pareil",
)
verifier(
  "et quand on a vraiment regardé sans rien trouver, on le dit AVEC le reste",
  (() => {
    const e = etatConnecteurs([{ nom: "Waze", paquet: "com.waze" }])
    return e.etat === "aucune" && e.autres === 1
  })(),
  "sinon la carte est vide et il ne sait pas qu'il peut quand même en choisir une",
)

verifier(
  "le filtre ignore accents et casse",
  filtrerApps(SON_TELEPHONE, "perplex").length === 1 &&
    filtrerApps(SON_TELEPHONE, "WAZE").length === 1,
)
verifier(
  "les exemples NOMMENT l'application : c'est la phrase à dire",
  exemplePour("Perplexity").includes("sur Perplexity") && EXEMPLE_FAVORITE.includes("cherche"),
)

// --- Une seule clé, et le contrôle vocal qui va avec ------------------------

const vocales = readFileSync("src/lib/actionsTelephoneVocales.ts", "utf8")
const appsIA = readFileSync("src/lib/appsIA.ts", "utf8")
const carte = readFileSync("src/components/settings/ConnecteursIA.tsx", "utf8")

verifier(
  "la favorite reste `jarvis_app_ia`, la clé qui existait",
  /jarvis_app_ia/.test(vocales) &&
    !/jarvis_ia_favorite|jarvis_app_recherche|jarvis_connecteurs/.test(appsIA + carte),
  "une seconde clé ferait deux endroits où lire la favorite, avec la moitié dans chacun",
)
verifier(
  "la carte n'invente aucun état « connecté » : elle lit les apps installées",
  /listerApplications\(\)/.test(carte) && !/connecte(s|es)?\s*:/.test(appsIA),
  "il n'y a rien à brancher : Jarvis passe la question par un intent Android",
)
verifier(
  "et elle dit qu'il n'y a rien à payer ni de compte à connecter",
  /rien à brancher/.test(carte) && /abonnement/.test(carte),
  "« je ne veux pas payer, je veux profiter des applications que je paye déjà »",
)
verifier(
  "la ligne « Question à une IA » a bien quitté l'autre carte",
  !/titre="Question à une IA"/.test(readFileSync("src/components/settings/AppsParDefaut.tsx", "utf8")),
  "deux façons de régler la même chose finiraient par ne plus dire pareil",
)

const consigne = readFileSync("supabase/functions/voice-command/index.ts", "utf8")
verifier(
  "la consigne envoie « cherche… » vers ask_ai, pas vers une réponse du modèle",
  /cherche le prix du grès cérame/.test(consigne) &&
    /« sur internet » et « sur le web » ne sont PAS des noms d'application/.test(consigne),
  "sans ça il répond lui-même, et la recherche n'atteint jamais son application",
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
