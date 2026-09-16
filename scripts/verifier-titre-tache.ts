/**
 * LE TITRE D'UNE TÂCHE EST CE QU'IL Y A À FAIRE (chantier 7b2c99e2).
 *
 *   node --experimental-strip-types scripts/verifier-titre-tache.ts
 *
 * Aucun réseau. LES CAS QUI COMPTENT SONT SES VRAIS TITRES, relus dans sa base
 * le 15 sept. 2026 — pas des paraphrases de la règle qu'ils vérifient. C'est le
 * piège déjà payé par le filtre des sujets réservés le 6 sept., dont les cinq
 * cas d'essai reprenaient mot pour mot ses propres expressions régulières.
 *
 * ET LA MOITIÉ DE CE CONTRÔLE VÉRIFIE LE SILENCE. Un titre mal coupé est pire
 * qu'un titre long : long, il se lit ; coupé, il ment. Les tâches qui ne
 * doivent PAS bouger sont donc aussi nombreuses que celles qui doivent bouger.
 */
import { titreLisible } from "../src/lib/titreTache.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}
const rend = (entree: string, attendu: string) =>
  verifier(
    `« ${entree} » → « ${attendu} »`,
    titreLisible(entree) === attendu,
    `obtenu « ${titreLisible(entree)} »`,
  )
const inchange = (entree: string) =>
  verifier(
    `« ${entree} » n'est pas touché`,
    titreLisible(entree) === entree,
    `devenu « ${titreLisible(entree)} » — un titre coupé ment, un titre long se lit`,
  )

// ── Les deux titres réellement créés le 15 sept. 2026 ────────────────────────

/** Sa dictée de 17:32:41 : « note un rappel comme quoi je dois rappeler dan
 * Marciano jeudi matin à 10h ». C'est le cas qui a fait écrire ce module. */
rend("Un rappel comme quoi je dois rappeler dan marciano matin", "Rappeler dan marciano matin")

/** Sa dictée de 06:30:31 : « rajoute une tâche dans les prélèvements de
 * relancer Moli aujourd'hui avant midi ». Le « de » fait partie de l'amorce —
 * sans lui, le titre commencerait par une préposition orpheline. */
rend("Dans la tache des prelevements de relancer moli avant", "Prelevements de relancer moli avant")

/** Sa dictée de 06:30:57 : « rajoute une échéance dans finir le tableau… » */
rend("Ajoute une tache de finir le tableau", "Finir le tableau")

// ── Ses vraies tâches, qui ne doivent PAS bouger ─────────────────────────────

/** Copiées de `tasks` le 15 sept. Si l'une d'elles change, la règle mord sur
 * de vrais titres et il faut la resserrer, pas l'élargir. */
inchange("Rappeler la banque Apoalim")
inchange("Rappeler Rony Zerbib")
inchange("Acheter coque airpods et clefs de voiture")
inchange("Rappel Dan Marciano")
inchange("Rappel Jonathan Dukan")
inchange("Finir le tableau simulation Vente de rdv Qualifié PANNEAUX")

/** Les verbes d'action ne sont JAMAIS des amorces : ce sont eux le titre. */
inchange("Relancer Moli avant midi")
inchange("Envoyer les photos à Mélissa")
inchange("Noter les mesures de la villa Dan")
inchange("Appeler le chantier de la villa Dan")

// ── Ce que la règle refuse de faire ──────────────────────────────────────────

verifier(
  "une amorce SEULE ne laisse pas un titre vide",
  titreLisible("Ajoute une tâche") === "Ajoute une tâche",
  "un titre vide ferait disparaître la ligne de sa liste",
)
verifier(
  "un reste trop court ne remplace pas le titre",
  titreLisible("Note que ça") === "Note que ça",
  "« ça » ne dit rien : mieux vaut la phrase entière",
)
verifier(
  "l'amorce n'est retirée qu'en TÊTE",
  titreLisible("Payer la facture puis note que c'est fait") ===
    "Payer la facture puis note que c'est fait",
  "une amorce citée au milieu d'un titre n'est pas une commande",
)
/** LA FRONTIÈRE DE MOT, et ce cas-là l'exerce vraiment. « note que » est un
 * préfixe de « note quelque chose » : sans l'espace exigé après l'amorce, le
 * titre deviendrait « Lque chose d'important ». Essayé à l'envers — ma première
 * version de ce contrôle visait « Noteur de frais », qu'aucune amorce ne
 * touche, et elle restait verte quand on retirait la frontière. */
verifier(
  "une frontière de mot est exigée",
  titreLisible("Note quelque chose d'important") === "Note quelque chose d'important",
  `obtenu « ${titreLisible("Note quelque chose d'important")} » — sans frontière, ` +
    "« note que » mord sur « note quelque »",
)

/** CE QUI RESTE NE COMMENCE JAMAIS PAR UN MORCEAU DE COMMANDE. C'est
 * l'invariant qui compte pour lui, et il ne dépend pas de la façon dont on
 * l'obtient (l'ordre de la liste, ou la plus longue amorce qui gagne) — ma
 * première version testait l'une des deux et restait verte quand on cassait
 * l'autre. */
for (const entree of [
  "Un rappel comme quoi je dois payer Yoni",
  "Note que je dois relancer Moli",
  "Rajoute une tache de rappeler Rony",
]) {
  const sortie = titreLisible(entree)
  verifier(
    `« ${entree} » ne laisse aucun reste de commande`,
    !/^(je dois|que |de |dois )/i.test(sortie) && sortie.length > 5,
    `obtenu « ${sortie} »`,
  )
}
verifier(
  "accents et apostrophes ne font pas rater une amorce",
  titreLisible("Rajoute une tâche d'appeler le plombier") !==
    "Rajoute une tâche d'appeler le plombier",
  "la dictée écrit tantôt « tache » tantôt « tâche »",
)
verifier(
  "un titre vide reste vide",
  titreLisible("   ") === "",
  "c'est à l'appelant de refuser une tâche sans titre, pas à ce module d'en inventer un",
)
verifier(
  "la première lettre est remise en majuscule, et RIEN d'autre",
  titreLisible("Note que rappeler Dan MARCIANO") === "Rappeler Dan MARCIANO",
  "réécrire le reste abîmerait un nom propre qu'il a bien prononcé",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
