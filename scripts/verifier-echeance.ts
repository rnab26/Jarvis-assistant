/**
 * Vérifie l'étiquette d'échéance d'une tâche.
 *
 *   node --experimental-strip-types scripts/verifier-echeance.ts
 *
 * Aucun réseau. Deux choses se cassent en silence sur une date, et aucune des
 * deux ne se voit à l'œil : le décalage d'un jour dû au fuseau (« aujourd'hui »
 * affiché « hier »), et le retard qui ne se signale pas. Le jour de référence
 * est injecté dans la fonction, donc ces contrôles donnent le même résultat
 * n'importe quand — un test de date qui dépend de la date du jour ne vaut rien.
 */
import { lireEcheance } from "../src/lib/echeance.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// Un jeudi, en milieu de mois et de journée : rien de limite ici, les cas
// limites sont testés à part plus bas.
const JEUDI = new Date(2026, 8, 3, 14, 30) // 3 septembre 2026

const CAS: [string, string | null, string, boolean][] = [
  // [date, heure, texte attendu, en retard attendu]
  ["2026-09-03", null, "aujourd'hui", false],
  ["2026-09-04", null, "demain", false],
  ["2026-09-02", null, "hier", true],
  ["2026-09-05", null, "samedi", false],
  ["2026-09-08", null, "mardi", false],
  // 7 jours pile : on retombe sur le quantième, sinon « jeudi » serait
  // ambigu avec le jeudi d'aujourd'hui.
  ["2026-09-10", null, "10 sept.", false],
  ["2026-12-24", null, "24 déc.", false],
  // Année différente : elle s'affiche, et seulement là.
  ["2027-01-15", null, "15 janv. 2027", false],
  ["2025-11-02", null, "2 nov. 2025", true],
  // L'heure se colle au texte, tronquée aux minutes.
  ["2026-09-04", "20:00:00", "demain 20:00", false],
  ["2026-09-03", "08:30", "aujourd'hui 08:30", false],
  ["2026-09-01", "09:00:00", "1 sept. 09:00", true],
]

for (const [date, heure, texteAttendu, retardAttendu] of CAS) {
  const r = lireEcheance(date, heure, JEUDI)
  if (!r) {
    verifier(`${date}${heure ? " " + heure : ""}`, false, "aucune échéance rendue")
    continue
  }
  verifier(
    `« ${texteAttendu} » pour ${date}${heure ? " " + heure : ""}`,
    r.texte === texteAttendu,
    `obtenu « ${r.texte} »`,
  )
  verifier(
    `retard = ${retardAttendu} pour ${date}`,
    r.enRetard === retardAttendu,
    `obtenu ${r.enRetard}`,
  )
}

// Pas d'échéance du tout : la ligne ne doit pas porter d'étiquette vide.
for (const vide of [null, "", "   ", "pas une date", "2026-13-45"]) {
  verifier(
    `rien à afficher pour ${JSON.stringify(vide)}`,
    lireEcheance(vide as string | null, null, JEUDI) === null,
    "une étiquette a été rendue alors qu'il n'y a pas de date lisible",
  )
}

// LE PIÈGE DU FUSEAU. Une date lue en UTC recule d'un jour à l'ouest de
// Greenwich et « aujourd'hui » s'affiche « hier ». On rejoue donc le même jour
// à des heures qui encadrent minuit UTC, des deux côtés.
for (const heureDuJour of [0, 1, 2, 12, 22, 23]) {
  const reference = new Date(2026, 8, 3, heureDuJour, 0)
  const r = lireEcheance("2026-09-03", null, reference)
  verifier(
    `« aujourd'hui » tient à ${String(heureDuJour).padStart(2, "0")} h`,
    r?.texte === "aujourd'hui" && r.enRetard === false,
    `obtenu « ${r?.texte} », retard = ${r?.enRetard}`,
  )
}

// Changement de mois et d'année : les deux endroits où un calcul en jours se
// trompe le plus facilement.
const SAINT_SYLVESTRE = new Date(2026, 11, 31, 10, 0)
for (const [date, attendu] of [
  ["2026-12-31", "aujourd'hui"],
  ["2027-01-01", "demain"],
  ["2026-12-30", "hier"],
] as [string, string][]) {
  const r = lireEcheance(date, null, SAINT_SYLVESTRE)
  verifier(`${attendu} au passage de l'année (${date})`, r?.texte === attendu, `obtenu « ${r?.texte} »`)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
