/**
 * Vérifie qu'une COUPURE RÉSEAU ne se présente jamais comme une réponse du
 * serveur vocal.
 *
 *   node --experimental-strip-types scripts/verifier-coupure-reseau.ts
 *
 * D'OÙ ÇA VIENT, 15 sept. 2026, capture à l'appui. Raphaël dicte 43 secondes
 * (104 résultats partiels, 19 sessions de reconnaissance, mesuré dans
 * `journal_ecoute`) et lit sous le cœur :
 *
 *     « Jarvis : Le serveur vocal a répondu : Failed to send a request to the
 *       Edge Function »
 *
 * DEUX CHOSES Y SONT FAUSSES, et les journaux Supabase du même instant le
 * prouvent : `POST | 200 | .../voice-command` à 10:50:42.027, alors que l'app
 * avait rendu la main à 10:50:41.717 après 2985 ms. Le serveur n'a jamais
 * « répondu » ça — il a répondu 200. Et la phrase est en anglais, brute.
 *
 * La cause est mécanique : `FunctionsFetchError` de supabase-js (levé quand le
 * `fetch` lui-même est rejeté) n'a pas de `context`, donc aucun cas ne le
 * reconnaissait et le dernier recours le relayait tel quel.
 *
 * LA MOITIÉ DE CES CONTRÔLES VÉRIFIE CE QU'ON NE DIT PAS : ni « le serveur »,
 * ni « ça n'est pas parti » — du téléphone, on ne PEUT pas savoir si la
 * demande a été exécutée, et ce jour-là elle l'avait été.
 */
import { readFileSync } from "node:fs"
import { traduireErreurServeur } from "../src/lib/erreurServeurVocal.ts"
import { erreurDepuisEcoute } from "../src/lib/erreurs.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/** Le message EXACT de supabase-js, celui qu'il a eu sous les yeux. */
const RÉEL = "Failed to send a request to the Edge Function"

// ── Ce qu'on dit ─────────────────────────────────────────────────────────
{
  const phrase = traduireErreurServeur("", RÉEL)
  verifier(
    "une coupure réseau parle de la CONNEXION",
    /connexion/i.test(phrase),
    phrase,
  )
  verifier(
    "et n'accuse PAS le serveur",
    !/le serveur vocal a répondu/i.test(phrase),
    `le serveur avait répondu 200 : ${phrase}`,
  )
  verifier(
    "le message anglais de supabase-js n'arrive plus à l'écran",
    !phrase.includes("Failed to send") && !/edge function/i.test(phrase),
    phrase,
  )
  verifier(
    "elle dit qu'on NE SAIT PAS si la demande est passée",
    /je ne sais pas si/i.test(phrase),
    "« ça n'est pas parti » aurait été faux le 15 sept. : le serveur avait répondu 200",
  )
  verifier(
    "et elle ne prétend pas non plus que c'est passé",
    !/(a bien été|c'est fait|est parti[e]?\b)/i.test(phrase),
    phrase,
  )
}

// Les autres formulations du même défaut, selon le moteur du WebView.
for (const brut of [
  "TypeError: Failed to fetch",
  "Load failed",
  "Network request failed",
  "NetworkError when attempting to fetch resource.",
]) {
  verifier(
    `« ${brut.slice(0, 32)} » est aussi reconnu comme une coupure`,
    /connexion/i.test(traduireErreurServeur("", brut)),
    traduireErreurServeur("", brut),
  )
}

// ── LE SILENCE : ce qui ne doit PAS basculer dans ce cas ────────────────
verifier(
  "un vrai refus du moteur garde sa phrase à lui",
  /limite du moteur/i.test(traduireErreurServeur('{"error":"RESOURCE_EXHAUSTED"}', "")),
  "la coupure réseau ne doit pas avaler les cas déjà traités",
)
verifier(
  "un 503 reste « le modèle est débordé »",
  /débordé/i.test(traduireErreurServeur('{"error":"503 overloaded"}', "")),
)
verifier(
  "une session expirée reste une session expirée",
  /reconnecte/i.test(traduireErreurServeur('{"error":"non authentifié"}', "")),
)
verifier(
  "un corps inconnu est toujours relayé tel quel",
  /Le serveur vocal a répondu/.test(
    traduireErreurServeur('{"error":"quelque chose de neuf"}', ""),
  ),
  "un message obscur reste plus utile qu'un « une erreur est survenue »",
)

// ── Le registre des erreurs sépare les deux pannes ──────────────────────
{
  const reseau = erreurDepuisEcoute("reponse", { source: "modele", erreur: RÉEL })
  const serveur = erreurDepuisEcoute("reponse", {
    source: "modele",
    erreur: "Edge Function returned a non-2xx status code",
  })
  verifier(
    "le registre ne titre plus « le serveur a refusé » sur une coupure",
    reseau?.titre !== undefined && !/refusé/i.test(reseau.titre),
    String(reseau?.titre),
  )
  verifier(
    "il nomme la connexion",
    /connexion/i.test(reseau?.titre ?? ""),
    String(reseau?.titre),
  )
  verifier(
    "un vrai refus du serveur garde SON titre",
    /refusé/i.test(serveur?.titre ?? ""),
    String(serveur?.titre),
  )
  verifier(
    "les deux font deux lignes distinctes, pas une",
    reseau?.titre !== serveur?.titre,
    "une panne de 4G et un moteur qui refuse ne se corrigent pas du même côté",
  )
  verifier(
    "le détail garde le message brut, pour qu'on puisse encore chercher",
    reseau?.detail === RÉEL,
    String(reseau?.detail),
  )
}

// ── « Réessayer sans redicter » ─────────────────────────────────────────
//
// Le bouton ne se vérifie PAS dans un navigateur : le chemin d'écoute est
// natif, et aucun banc ne peut atteindre l'état d'erreur d'un vrai tour de
// voix. On lit donc le code — et on vise l'APPEL, jamais la présence du mot :
// c'est le piège déjà payé par `Filesystem.mkdir` le 4 sept. et par le
// sélecteur Playwright, où un contrôle restait vert alors que l'appel avait
// disparu et que seule la définition subsistait.
{
  const mic = readFileSync(new URL("../src/components/voice/MicButton.tsx", import.meta.url), "utf8")

  verifier(
    "le bouton APPELLE vraiment le renvoi",
    /onClick=\{\(\)\s*=>\s*void\s+rejouerLaPhrase\(\)\}/.test(mic),
    "un bouton sans onClick est un bouton mort, et rien ne le dirait",
  )
  verifier(
    "il ne s'affiche QUE sur un échec, et seulement s'il y a une phrase",
    /status === "error" && phraseARejouer &&/.test(mic),
    "le proposer après une commande réussie inviterait à la faire deux fois",
  )
  verifier(
    "le renvoi repasse par conduireConversation, pas par un second chemin",
    /async function rejouerLaPhrase\(\)[\s\S]{0,600}?await conduireConversation\(phrase\)/.test(mic),
    "une seconde route finirait par ne plus exécuter les actions pareil",
  )
  verifier(
    "AUCUN renvoi automatique : rejouerLaPhrase n'est appelée que par le bouton",
    (mic.match(/rejouerLaPhrase\(\)/g) ?? []).length === 2,
    "le 15 sept., la requête « en échec » avait reçu un 200 : un renvoi automatique aurait tout fait deux fois",
  )
  verifier(
    "la phrase à renvoyer est oubliée dès que le tour aboutit",
    /const enchainer = await runTurn\(transcript\)[\s\S]{0,400}?setPhraseARejouer\(null\)/.test(mic),
    "sinon « Réessayer » survivrait à une commande réussie",
  )
}

// ── Le micro est MESURÉ, pas supposé ────────────────────────────────────
{
  const hook = readFileSync(new URL("../src/hooks/useSpeechRecognition.ts", import.meta.url), "utf8")
  const dansCommandeFin = hook.slice(hook.indexOf('noterEcoute("commande_fin"'))
  verifier(
    "le journal dit combien de temps le micro met à s'ouvrir",
    /ms_ouverture:/.test(dansCommandeFin.slice(0, 900)),
    "sans ce nombre, « le micro est lent » ne peut que se discuter",
  )
  verifier(
    "et combien de temps il met à rendre le premier mot",
    /ms_premier_mot:/.test(dansCommandeFin.slice(0, 900)),
    "les deux ensemble disent si c'est notre chemin ou Android qui est lent",
  )
  verifier(
    "une ouverture qui n'a pas eu lieu vaut null, jamais 0",
    /ms_ouverture: microOuvertAt \? microOuvertAt - appuiAt : null/.test(hook),
    "zéro se lirait comme « instantané », c'est-à-dire le contraire",
  )
  verifier(
    "c'est la PREMIÈRE ouverture qui est mesurée, pas la dernière relance",
    /if \(demarre && !microOuvertAt\) microOuvertAt = Date\.now\(\)/.test(hook),
    "la boucle relance une session à chaque silence : compter la dernière dirait le temps d'une relance",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
