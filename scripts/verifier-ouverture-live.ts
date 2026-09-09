/**
 * L'ORDRE DES TROIS ÉTAPES D'UNE OUVERTURE LIVE.
 *
 *   node --experimental-strip-types scripts/verifier-ouverture-live.ts
 *
 * Aucun réseau : ce contrôle LIT LE CODE, comme `verifier-pannes-silencieuses.ts`.
 * L'ouverture d'une session Live ne peut pas être jouée hors d'un appareil —
 * il y faut un vrai micro et un vrai WebSocket vers Google — mais la règle
 * qu'on veut tenir porte sur la FORME du code, et elle se lit.
 *
 * LA RÈGLE, ET LA MESURE QUI LA JUSTIFIE (chantier ba140853, 9 sept. 2026).
 * Une ouverture Live enchaînait trois attentes strictement l'une après
 * l'autre : le jeton (`ms_jeton`, 1253 à 4594 ms sur ses vraies ouvertures),
 * le WebSocket vers Google (`ms_connexion`, 630 à 6994 ms), puis le micro
 * (`ms_micro`, 333 à 2926 ms). Les trois rendaient compte EXACTEMENT du
 * total — résidu vérifié à zéro sur 60 ouvertures —, donc le micro était de
 * l'attente pure ajoutée au reste, alors que `getUserMedia` ne dépend ni du
 * jeton ni de la session.
 *
 * Il part donc maintenant EN MÊME TEMPS que la connexion. Deux bornes, et il
 * faut les deux :
 *
 *  - PAS APRÈS la connexion : ce serait revenir à l'attente en série.
 *  - PAS AVANT le jeton : `handleClick` (MicButton) appelle `stopListening()`
 *    sans l'attendre juste avant d'ouvrir le Live, et le service de
 *    reconnaissance d'Android tient encore le micro à cet instant. Deux
 *    preneurs du même micro, c'est `getUserMedia` qui échoue — « Le micro n'a
 *    pas répondu » sur une ouverture parfaitement normale. L'aller-retour du
 *    jeton est le coussin qui laisse le service lâcher.
 *
 * ESSAYÉ À L'ENVERS avant d'être cru : remettre `capturerMicro` dans le bloc
 * `try`, ou le remonter avant l'appel à `live-jeton`, fait rougir le contrôle
 * correspondant. Il vise les POSITIONS DES APPELS, jamais la présence d'un
 * mot — c'est le piège payé par le sélecteur Playwright, par `Filesystem.mkdir`
 * et par `com.google.android.as`.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const source = readFileSync("src/lib/live/sessionLive.ts", "utf8")

/** Le corps de `demarrerSessionLive` seul : `maintenirSessionLive`, plus bas,
 * n'ouvre rien lui-même et fausserait les positions. */
const debutFonction = source.indexOf("export async function demarrerSessionLive")
const finFonction = source.indexOf("export async function maintenirSessionLive")
verifier(
  "les deux fonctions d'ouverture sont bien là où on les cherche",
  debutFonction >= 0 && finFonction > debutFonction,
  "le fichier a été réorganisé : ce contrôle mesure des positions, il faut le relire",
)
const corps = source.slice(debutFonction, finFonction > debutFonction ? finFonction : undefined)

/** La position d'un APPEL, pas d'un mot : `posDe("capturerMicro(")` ne peut pas
 * tomber sur l'import ni sur une phrase de commentaire qui le cite. */
const posDe = (appel: string) => corps.indexOf(appel)

const posJeton = posDe('invoke<{')
const posMicro = posDe("capturerMicro((paquet)")
const posConnexion = posDe("ai.live.connect(")

verifier(
  "les trois appels de l'ouverture sont retrouvés",
  posJeton > 0 && posMicro > 0 && posConnexion > 0,
  `jeton=${posJeton} micro=${posMicro} connexion=${posConnexion}`,
)

verifier(
  "le micro n'attend PAS la connexion à Google",
  posMicro > 0 && posConnexion > 0 && posMicro < posConnexion,
  "capturerMicro est appelé après ai.live.connect : les 333 à 2926 ms du micro " +
    "retombent en série sur le chemin critique, ce que ce chantier a retiré",
)

verifier(
  "le micro part APRÈS le jeton, pas avant",
  posJeton > 0 && posMicro > posJeton,
  "capturerMicro est appelé avant l'aller-retour du jeton : plus de coussin pour " +
    "que le service de reconnaissance d'Android lâche le micro (stopListening n'est pas attendu)",
)

/** Un micro lancé tôt peut n'avoir pas encore répondu quand on ferme. `capture`
 * est alors encore nul, et `capture?.arreter()` ne rend rien : le micro
 * resterait ouvert tout seul derrière nous, pris pour toute autre application. */
const corpsFermer = corps.slice(corps.indexOf("const fermer = ("), corps.indexOf("/** Clôture à la voix"))
verifier(
  "fermer() rend un micro qui n'a pas encore répondu",
  corpsFermer.includes("rendreLeMicro()"),
  "seul `capture?.arreter()` est appelé, et `capture` est nul tant que le micro " +
    "n'a pas répondu — le flux resterait ouvert",
)

/** Le rejet du micro peut survenir pendant qu'on ouvre encore la session :
 * personne ne l'attend à cet instant, et Node comme la WebView le comptent
 * alors comme un rejet non géré. */
verifier(
  "l'échec du micro ne peut pas devenir un rejet non géré",
  /micro\.catch\(\(\) => \{\}\)/.test(corps),
  "sans ce catch neutre, un micro qui échoue avant l'await remonte en unhandled rejection",
)

/** Le message du micro ne doit pas être remplacé par celui de `withTimeout`,
 * qui parle du SERVEUR : un diagnostic faux coûte plus cher qu'aucun. */
verifier(
  "un micro qui ne vient pas le dit, et ne parle pas du serveur",
  corps.includes("Le micro n'a pas répondu"),
  "le message d'échec du micro a disparu : withTimeout enverrait chercher une panne de réseau",
)

/** LE NOMBRE QUI COMPTE MAINTENANT. Les trois segments ne s'additionnent plus
 * (le micro recouvre la connexion) : ce qu'il coûte réellement, c'est ce qu'on
 * a encore attendu APRÈS la connexion. Sans lui, la prochaine session lirait
 * `ms_micro` comme avant et conclurait de travers. */
verifier(
  "live_debut dit ce que le micro coûte ENCORE sur le chemin critique",
  corps.includes("ms_micro_attente:"),
  "ms_micro seul ne se lit plus comme avant : il recouvre la connexion depuis " +
    "que le micro est parallèle, et sans ms_micro_attente le total ne se décompose plus",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
