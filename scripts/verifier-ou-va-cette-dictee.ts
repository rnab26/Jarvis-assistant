/**
 * Vérifie où atterrit ce qu'il dicte, sans réseau.
 *
 *   node --experimental-strip-types scripts/verifier-ou-va-cette-dictee.ts
 *
 * SA DEMANDE, 6 sept. 2026 : « Si jarvis a un doute ou est-ce qu'il faut
 * déposer une requête ou un chantier il faut qu'il donne une supposition a
 * raphael ou bien raphael lui indique lui meme ou la placer. »
 *
 * CE QUI PEUT ÊTRE FAUX EN SILENCE ICI, et que ce contrôle garde :
 *
 * 1. UNE NOUVELLE DEMANDE PRISE POUR UNE CORRECTION. « Ajoute un chantier
 *    pour refaire la salle de bain » contient exactement les mêmes mots que
 *    « mets-le en chantier ». La prendre pour une correction déplacerait la
 *    ligne précédente AU LIEU de créer celle-ci : on perdrait sa demande et
 *    on abîmerait la précédente, d'un coup. LA MOITIÉ DES CONTRÔLES
 *    CI-DESSOUS VÉRIFIE CE REFUS, pas la détection.
 * 2. UNE CORRECTION QUI RECRÉE AU LIEU DE DÉPLACER : la ligne d'origine
 *    resterait dans la mauvaise liste, invisible, pendant qu'une jumelle
 *    apparaîtrait ailleurs. C'est déjà arrivé le 5 sept. avec deux chantiers
 *    dictés à une minute d'intervalle.
 * 3. UNE SECONDE RÈGLE DE RECONNAISSANCE. `chantierDeguise` est mesurée sur
 *    ses vraies lignes ; en écrire une autre ici, c'est accepter qu'elles
 *    divergent, et que l'onglet Tâches et la voix ne disent plus la même
 *    chose du même titre.
 * 4. UNE PHRASE AU PASSÉ SUR CE QUI N'A PAS EU LIEU.
 */
import { readFileSync } from "node:fs"
import {
  FENETRE_CORRECTION_MS,
  correctionApplicable,
  correctionDeDestination,
  phraseDeplacement,
  phraseIntrouvable,
  phraseSupposition,
  suppositionDictee,
  type DerniereCreation,
} from "../src/lib/ouVaCetteDictee.ts"
import { interpreterLocalement } from "../src/lib/commandeLocale.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ---------------------------------------------------------------------------
// La supposition : elle vient de la règle mesurée, et de nulle part ailleurs
// ---------------------------------------------------------------------------

verifier(
  "une dictée qui annonce une demande aux sessions part en chantier",
  suppositionDictee("R un chantier : les notifications quand l'app est fermée") !== null &&
    suppositionDictee("Pour Claude Code, revoir la mémoire longue durée") !== null,
)
verifier(
  "un chantier de MAÇONNERIE reste une tâche",
  suppositionDictee("Appeler le chantier de la villa Dan") === null &&
    suppositionDictee("Commander les carreaux pour le chantier") === null,
  "c'est le cas qui compte le plus : il est dans l'immobilier",
)
verifier(
  "une course ordinaire aussi",
  suppositionDictee("Racheter un spot pour l'entrée") === null &&
    suppositionDictee("Payer la facture d'électricité") === null,
)
verifier(
  "la supposition dit CE QUI L'A FAIT PENCHER, et comment la défaire",
  (() => {
    const s = suppositionDictee("R un chantier : refaire l'écran de mémoire")
    if (!s) return false
    const p = phraseSupposition(s.titre, s.indice)
    return p.includes(s.indice) && /mets-le en t[âa]che/i.test(p)
  })(),
  "sans ça, une supposition est indiscernable d'une décision arbitraire",
)

// ---------------------------------------------------------------------------
// La correction — et surtout ce qu'elle REFUSE
// ---------------------------------------------------------------------------

const corrections: [string, "chantier" | "tache"][] = [
  ["mets-le en chantier", "chantier"],
  ["non, mets-le plutôt en chantier", "chantier"],
  ["range ça dans le cockpit", "chantier"],
  ["c'est un chantier", "chantier"],
  ["déplace-le en tâche", "tache"],
  ["non, c'est une tâche", "tache"],
  ["mets ça en tâche", "tache"],
  ["c'est une tâche, pas un chantier", "tache"],
  ["c'est un chantier, pas une tâche", "chantier"],
]
for (const [phrase, attendu] of corrections) {
  verifier(`« ${phrase} » → ${attendu}`, correctionDeDestination(phrase) === attendu,
    `rendu : ${correctionDeDestination(phrase)}`)
}

const refus = [
  "ajoute un chantier pour refaire la salle de bain",
  "crée un chantier : les notifications quand l'app est fermée",
  "ajoute une tâche appeler le plombier",
  "mets-le en chantier prioritaire pour demain avec Yoni",
  "quels sont mes chantiers en cours",
  "montre-moi mes tâches",
  "range le chantier de la villa Dan dans les urgents",
  "appelle le chantier",
]
for (const phrase of refus) {
  verifier(
    `« ${phrase} » n'est PAS une correction`,
    correctionDeDestination(phrase) === null,
    "la prendre pour une correction déplacerait la ligne précédente au lieu de créer celle-ci",
  )
}

// ---------------------------------------------------------------------------
// Quand une correction peut encore s'appliquer
// ---------------------------------------------------------------------------

const t0 = 1_000_000_000_000
const creation = (vers: "tache" | "chantier", quand = t0): DerniereCreation => ({
  vers,
  titre: "Refaire l'écran de mémoire",
  quand,
})

verifier(
  "sans rien créé juste avant, on ne déplace rien",
  !correctionApplicable(null, "chantier", t0),
)
verifier(
  "une correction qui ne change rien ne fait rien",
  !correctionApplicable(creation("chantier"), "chantier", t0 + 1000),
  "« mets-le en chantier » sur un chantier : il n'y a rien à déplacer",
)
verifier(
  "dans la fenêtre, elle s'applique",
  correctionApplicable(creation("tache"), "chantier", t0 + 60_000),
)
verifier(
  "au-delà, non",
  !correctionApplicable(creation("tache"), "chantier", t0 + FENETRE_CORRECTION_MS + 1),
  "« mets-le en chantier » dit une heure plus tard parle d'autre chose",
)
verifier(
  "une horloge qui recule ne rouvre pas la fenêtre",
  !correctionApplicable(creation("tache"), "chantier", t0 - 60_000),
)

// ---------------------------------------------------------------------------
// Le chemin local : la correction ne doit jamais partir au modèle
// ---------------------------------------------------------------------------

const ctx = {
  tasks: [],
  devItems: [],
  contacts: [],
  categories: [],
  maintenant: new Date("2026-09-06T12:00:00Z"),
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier(
  "« non, mets-le en chantier » est comprise SUR L'APPAREIL",
  (() => {
    const a = interpreterLocalement("non, mets-le en chantier", ctx)
    return a?.length === 1 && a[0].action === "move_last_entry" && a[0].vers === "chantier"
  })(),
  "un aller-retour au modèle coûte une seconde et une chance de plus de la comprendre comme une nouvelle demande",
)
verifier(
  "et « ajoute un chantier pour X » ne l'est pas",
  (() => {
    const a = interpreterLocalement("ajoute un chantier pour refaire la salle de bain", ctx)
    return !a || a[0].action !== "move_last_entry"
  })(),
)

// ---------------------------------------------------------------------------
// Rien au passé qui n'ait eu lieu, et on DÉPLACE
// ---------------------------------------------------------------------------

verifier(
  "quand la ligne est introuvable, on dit que rien n'a bougé",
  /rien n'a bougé/i.test(phraseIntrouvable("Refaire l'écran")) &&
    // Aucune forme au PASSÉ : « déplacer » à l'infinitif est légitime,
    // « déplacé » et « c'est corrigé » ne le sont pas.
    !/(?:corrig[ée]|d[ée]plac[ée]e?s?\b(?!r))/i.test(phraseIntrouvable("Refaire l'écran")),
  "c'est la règle du 6 sept. : jamais au passé ce qui n'a pas été constaté",
)
verifier(
  "et le déplacement dit dans quel sens il s'est fait",
  phraseDeplacement("X", "chantier").includes("chantier") &&
    phraseDeplacement("X", "tache").includes("tâche"),
)

const actions = readFileSync("src/lib/voiceActions.ts", "utf8")
const bloc = actions.slice(
  actions.indexOf('case "move_last_entry"'),
  actions.indexOf('case "update_task"'),
)
verifier(
  "la correction DÉPLACE : elle crée d'un côté et efface de l'autre",
  /addDevItem\(/.test(bloc) && /deleteTask\(/.test(bloc) &&
    /addTask\(/.test(bloc) && /deleteDevItem\(/.test(bloc),
  "recréer sans effacer laisserait la ligne d'origine dans la mauvaise liste, invisible",
)
verifier(
  "et elle n'efface qu'APRÈS avoir écrit ailleurs",
  bloc.indexOf("addDevItem(") < bloc.indexOf("deleteTask(") &&
    bloc.indexOf("addTask(") < bloc.indexOf("deleteDevItem("),
  "l'inverse perdrait sa dictée si la seconde écriture échoue",
)

const module = readFileSync("src/lib/ouVaCetteDictee.ts", "utf8")
verifier(
  "une seule règle de reconnaissance pour tout le projet",
  /from "\.\/tacheOuChantier\.ts"/.test(module) && /chantierDeguise/.test(module),
  "en écrire une seconde ici, c'est accepter qu'elles divergent un jour",
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
