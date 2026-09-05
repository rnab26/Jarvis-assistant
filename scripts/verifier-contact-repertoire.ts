/**
 * Vérifie qu'on retrouve la bonne personne dans le répertoire du téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-contact-repertoire.ts
 *
 * Composer le numéro de quelqu'un d'autre est une erreur qu'on ne rattrape
 * pas : c'est pour ça que ce rapprochement est pur et vérifié ici, sans
 * téléphone ni réseau.
 */
import { chercherContact } from "../src/lib/chercherContact.ts"
import type { ContactTelephone } from "../src/lib/actionsTelephone.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const c = (nom: string, numero: string, etiquette = "Mobile"): ContactTelephone => ({
  nom,
  numero,
  etiquette,
})

const REPERTOIRE: ContactTelephone[] = [
  c("Mélissa Nabet", "0501111111"),
  c("Mélissa Nabet", "0399999999", "Domicile"),
  c("Yoni Cohen", "0502222222"),
  c("Yoni Levy", "0503333333"),
  c("Dylan", "0504444444"),
  c("Docteur Amar", "0505555555"),
]

console.log("— On retrouve la bonne personne —")

{
  const r = chercherContact("Mélissa", REPERTOIRE)
  verifier(
    "un prénom seul suffit",
    r.etat === "trouve" && r.contact.nom === "Mélissa Nabet",
    JSON.stringify(r),
  )
  verifier(
    "et c'est son MOBILE, pas le fixe listé après",
    r.etat === "trouve" && r.contact.numero === "0501111111",
    "appeler le fixe parce qu'il venait après dans la liste serait un échec silencieux",
  )
}

verifier(
  "les accents ne comptent pas",
  chercherContact("melissa", REPERTOIRE).etat === "trouve",
)
verifier(
  "« ma femme Mélissa » trouve Mélissa",
  chercherContact("ma femme Mélissa", REPERTOIRE).etat === "trouve",
)
verifier(
  "un nom complet trouve la bonne personne parmi deux Yoni",
  (() => {
    const r = chercherContact("Yoni Levy", REPERTOIRE)
    return r.etat === "trouve" && r.contact.numero === "0503333333"
  })(),
)

console.log("\n— On ne compose JAMAIS au hasard —")

{
  const r = chercherContact("Yoni", REPERTOIRE)
  verifier(
    "deux Yoni : on demande lequel, on ne tire pas au sort",
    r.etat === "ambigu" && r.candidats.length === 2,
    JSON.stringify(r),
  )
}

verifier(
  "un inconnu ne trouve personne",
  chercherContact("Bertrand", REPERTOIRE).etat === "aucun",
)
verifier(
  "un fragment de prénom ne suffit pas",
  chercherContact("Yo", REPERTOIRE).etat === "aucun",
  "« Yo » n'est pas un nom : appeler un Yoni là-dessus serait deviner",
)
verifier(
  "des mots vides seuls ne trouvent personne",
  chercherContact("mon", REPERTOIRE).etat === "aucun",
)
verifier(
  "un répertoire vide ne trouve personne",
  chercherContact("Mélissa", []).etat === "aucun",
)
verifier(
  "une demande vide ne trouve personne",
  chercherContact("   ", REPERTOIRE).etat === "aucun",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
