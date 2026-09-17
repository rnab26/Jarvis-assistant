/**
 * Vérifie qu'on peut reprendre une discussion dans le journal de bord, et que
 * l'écran dit ce qu'il ne montre pas.
 *
 *   node --experimental-strip-types scripts/verifier-fil-journal.ts
 *
 * SES MOTS, dictés le 17 sept. 2026 : « Dans le cockpit dev : journal de bord,
 * incohérence sur la durée de consultation des conversations et impossibilité
 * de reprendre la discussion ».
 *
 * MESURÉ sur sa base le même matin : 304 entrées, dont UNE SEULE portait un
 * bouton « Répondre ». Les cas ci-dessous sont donc construits sur ces
 * proportions-là, pas sur un jeu inventé — et la moitié d'entre eux vérifie le
 * SILENCE : un compteur qui s'affiche quand tout est visible, ou une citation
 * inventée à partir d'un parent absent, sont deux façons de rendre l'écran
 * moins lisible qu'avant.
 */
import {
  citationDuParent,
  doitMarquerTraite,
  parentDe,
  peutRepondre,
  phraseDeCoupure,
  resteACharger,
} from "../src/lib/filJournal.ts"
import type { DevLogEntry } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
function entree(p: Partial<DevLogEntry> = {}): DevLogEntry {
  n++
  return {
    id: `e${n}`,
    user_id: "u",
    item_id: null,
    author: "claude/cockpit-0917",
    kind: "info",
    body: "Une note de session.",
    answered_at: null,
    created_at: "2026-09-17T08:00:00Z",
    ...p,
  }
}

console.log("— On répond à TOUT, et c'est le cœur de sa demande —")

// Les quatre familles réellement présentes dans son journal, avec leur poids
// au 17 sept. : 208 info, 42 reponse, 30 de lui, 18 blocage, 1 question.
const FAMILLES: [string, Partial<DevLogEntry>][] = [
  ["une note d'information d'une session (208 des 304)", { kind: "info" }],
  ["un blocage signalé par une session (18)", { kind: "blocage" }],
  ["une réponse déjà écrite (42)", { kind: "reponse" }],
  ["une entrée qu'il a écrite lui-même (30)", { author: "Raphaël", kind: "info" }],
  ["une question DÉJÀ traitée", { kind: "question", answered_at: "2026-09-16T10:00:00Z" }],
  ["une question en attente (1)", { kind: "question" }],
]
for (const [nom, p] of FAMILLES) {
  verifier(
    `on peut reprendre la discussion sur ${nom}`,
    peutRepondre(entree(p)),
    "c'est exactement ce qui manquait : une entrée sur 304 seulement portait le bouton",
  )
}

verifier(
  "une entrée sans identifiant n'affiche pas de bouton",
  !peutRepondre(entree({ id: "" })),
  "personne ne peut citer ce qui n'existe pas encore : le bouton mentirait",
)

console.log("\n— Mais « marquer traité » ne vaut QUE pour une question en attente —")

verifier(
  "répondre à une question en attente la referme",
  doitMarquerTraite(entree({ kind: "question" })),
  "sinon elle reste dans la colonne « pour toi » alors qu'il vient d'y répondre",
)
const NE_REFERME_RIEN: [string, Partial<DevLogEntry>][] = [
  ["une note d'information", { kind: "info" }],
  ["un blocage", { kind: "blocage" }],
  ["une réponse", { kind: "reponse" }],
  ["une question déjà traitée", { kind: "question", answered_at: "2026-09-16T10:00:00Z" }],
]
for (const [nom, p] of NE_REFERME_RIEN) {
  verifier(
    `répondre à ${nom} ne referme rien`,
    !doitMarquerTraite(entree(p)),
    "poser answered_at là-dessus est invisible aujourd'hui et faux le jour où on comptera",
  )
}

console.log("\n— Une réponse dit à quoi elle répond —")

{
  // Longueur RÉALISTE : les notes que les sessions lui écrivent font des
  // centaines de caractères. Un cas d'essai plus court ne serait jamais coupé
  // et laisserait croire que la coupe au mot fonctionne sans l'avoir exercée.
  const CORPS =
    "Faut-il garder le mot-à-mot des conversations indéfiniment, ou le compacter " +
    "au bout de trois semaines comme le fait déjà la mémoire longue durée ? " +
    "Compacter fait perdre les tournures exactes, garder fait grossir la base."
  const question = entree({ id: "q1", author: "claude/voix-0509", kind: "question", body: CORPS })
  const reponse = entree({ kind: "reponse", author: "Raphaël", repond_a: "q1" })
  const parIdentifiant = new Map([[question.id, question]])

  verifier("le parent est retrouvé", parentDe(reponse, parIdentifiant)?.id === "q1")
  const citation = citationDuParent(parentDe(reponse, parIdentifiant))
  verifier(
    "la citation nomme l'auteur, sans son « claude/ »",
    citation?.startsWith("voix-0509 : ") === true,
    String(citation),
  )
  verifier("un long message EST coupé", citation?.endsWith("…") === true, String(citation))

  // La coupe tombe-t-elle sur une frontière de mot ? On reprend le texte gardé
  // et on regarde ce qui le suit dans l'original : un espace, jamais une
  // lettre. Une coupe au caractère près finit « la mémoire longue du… ».
  const garde = (citation ?? "").replace("voix-0509 : ", "").replace(/…$/, "")
  verifier(
    "et elle est coupée AU MOT, pas au caractère",
    CORPS.startsWith(garde) && CORPS[garde.length] === " ",
    `coupé sur « ${CORPS.slice(Math.max(0, garde.length - 12), garde.length + 8)} »`,
  )
  verifier(
    "elle reste courte",
    (citation ?? "").length < 130,
    `${citation?.length} caractères : une citation qui redit tout le message ne cite plus rien`,
  )
}

verifier(
  "une entrée qui ne répond à rien n'invente pas de citation",
  citationDuParent(parentDe(entree(), new Map())) === null,
)
verifier(
  "un parent NON CHARGÉ ne fabrique pas une citation vide",
  citationDuParent(parentDe(entree({ repond_a: "hors-page" }), new Map())) === null,
  "une réponse peut être visible alors que la question qu'elle cite est au-delà de ce qui est chargé",
)
verifier(
  "un parent au corps vide se cite quand même par son auteur",
  citationDuParent(entree({ author: "claude/x", body: "   " })) === "x",
)

console.log("\n— Ce que l'écran ne montre pas, il le DIT —")

verifier(
  "60 sur 304 : la coupure est annoncée",
  phraseDeCoupure(60, 304) === "60 entrées affichées sur 304",
  String(phraseDeCoupure(60, 304)),
)
verifier(
  "tout est affiché : on se tait",
  phraseDeCoupure(304, 304) === null,
  "un « 304 sur 304 » permanent est du bruit, et le bruit permanent cache le jour où ça change",
)
verifier(
  "moins d'entrées que la page : on se tait aussi",
  phraseDeCoupure(12, 12) === null,
)
verifier(
  "TOTAL INCONNU : on se tait plutôt que d'annoncer un nombre faux",
  phraseDeCoupure(60, null) === null,
  "le compte peut échouer alors que la liste est arrivée",
)

verifier(
  "la suite annonce ce qu'elle apporterait",
  resteACharger(60, 304, 60) === 60,
  String(resteACharger(60, 304, 60)),
)
verifier(
  "et jamais plus qu'il n'en reste",
  resteACharger(300, 304, 60) === 4,
  String(resteACharger(300, 304, 60)),
)
verifier("rien à charger quand tout est là", resteACharger(304, 304, 60) === 0)
verifier("ni quand on ne sait pas", resteACharger(60, null, 60) === 0)
verifier(
  "un total plus PETIT que l'affiché ne rend pas un négatif",
  resteACharger(60, 40, 60) === 0,
  "une entrée effacée entre la liste et le compte donnerait « voir les -20 précédentes »",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
