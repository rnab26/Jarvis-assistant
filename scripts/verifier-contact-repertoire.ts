/**
 * Vérifie qu'on retrouve la bonne personne dans le répertoire du téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-contact-repertoire.ts
 *
 * Composer le numéro de quelqu'un d'autre est une erreur qu'on ne rattrape
 * pas : c'est pour ça que ce rapprochement est pur et vérifié ici, sans
 * téléphone ni réseau.
 */
import {
  chercherContact,
  cibleTropCourante,
  estEntreeSysteme,
} from "../src/lib/chercherContact.ts"
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

/**
 * Le répertoire tel qu'il est CHEZ LUI, pour l'incident du 5 sept. — à part,
 * volontairement : y verser « Mel Ma Femme ❤ » changerait le sens des
 * contrôles ci-dessus, où « ma femme Mélissa » doit désigner une seule
 * personne. Ici les deux entrées sont la même personne, ce qui est le cas
 * dans son vrai téléphone.
 */
const REPERTOIRE_REEL: ContactTelephone[] = [
  c("Mel Ma Femme ❤", "0506666666"),
  c("Voice Mail", "+972544151000"),
  c("Yoni Cohen", "0502222222"),
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

console.log("\n— L'incident du 5 sept. 2026, 21 h 07 : « appelle ma femme » a composé le répondeur —")

// Ce qu'il a dit : « appelle ma femme ». Ce que la reconnaissance a entendu :
// « appelle mail ». Ce que ce module a répondu : « Voice Mail », +972544151000,
// à 50 de score — un mot courant sur deux. L'appel est parti.
{
  const r = chercherContact("mail", REPERTOIRE_REEL)
  verifier(
    "« mail » ne compose plus le répondeur",
    r.etat === "aucun",
    r.etat === "trouve"
      ? `il a trouvé ${r.contact.nom} (${r.contact.numero}) — c'est l'appel qui est parti ce soir-là`
      : `état ${r.etat}`,
  )
}
{
  const r = chercherContact("ma femme", REPERTOIRE_REEL)
  verifier(
    "« ma femme », correctement entendu, trouve toujours la bonne personne",
    r.etat === "trouve" && r.contact.nom === "Mel Ma Femme ❤",
    "le garde-fou ne doit pas casser ce qui marchait : à 21 h 08 la même phrase a bien marché",
  )
}
{
  const r = chercherContact("Mel", REPERTOIRE_REEL)
  verifier(
    "« Mel » aussi",
    r.etat === "trouve" && r.contact.nom === "Mel Ma Femme ❤",
    "« Mel » est un prénom, pas un mot d'appareil",
  )
}
verifier(
  "la messagerie de l'opérateur n'est jamais quelqu'un",
  estEntreeSysteme("Voice Mail") && estEntreeSysteme("Messagerie vocale") &&
    estEntreeSysteme("Répondeur"),
  "elle porte des mots courants, donc elle gagne contre un prénom mal entendu",
)
verifier(
  "et une vraie personne n'est pas prise pour un service",
  !estEntreeSysteme("Mel Ma Femme ❤") && !estEntreeSysteme("Mélissa Nabet") &&
    !estEntreeSysteme("Docteur Amar"),
)

// Le garde-fou général, celui qui ne dépend d'aucune liste de noms : un seul
// mot, et c'est un mot d'appareil.
for (const mot of ["mail", "message", "sms", "appel", "téléphone", "musique", "alarme"]) {
  verifier(
    `« ${mot} » tout seul ne désigne personne`,
    cibleTropCourante(mot),
    "une commande mal entendue, pas un nom",
  )
}
for (const nom of ["Mel", "ma femme", "Yoni", "mon frère Yoni", "docteur", "maman", "Mail Cohen"]) {
  verifier(
    `« ${nom} » reste une façon de désigner quelqu'un`,
    !cibleTropCourante(nom),
    "l'interdire couperait des appels parfaitement légitimes",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
