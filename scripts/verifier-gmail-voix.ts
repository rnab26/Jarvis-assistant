/**
 * Vérifie les décisions pures de Gmail à la voix : reconnaître « le dernier »
 * et lire proprement un expéditeur — sans réseau.
 *
 *   node --experimental-strip-types scripts/verifier-gmail-voix.ts
 */
import { estDernierMessage, nomExpediteur } from "../src/lib/gmailVoix.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── nomExpediteur ──
verifier(
  "extrait le nom affiché",
  nomExpediteur('Yoni Cohen <yoni@exemple.com>') === "Yoni Cohen",
)
verifier(
  "gère les guillemets autour du nom",
  nomExpediteur('"Bezeq International" <no-reply@bezeq.co.il>') === "Bezeq International",
)
verifier(
  "sans nom affiché, rend l'adresse telle quelle",
  nomExpediteur("contact@station-paz.co.il") === "contact@station-paz.co.il",
)
verifier("null rend un texte, jamais une chaîne vide ni une erreur", nomExpediteur(null) === "un expéditeur inconnu")

// ── estDernierMessage ──
for (const cible of ["le dernier", "Le dernier.", "la dernière", "le dernier mail", "le dernier message", "dernier"]) {
  verifier(`« ${cible} » désigne le dernier message`, estDernierMessage(cible))
}
for (const cible of ["le mail de Yoni", "la facture d'électricité", "le dernier message de Yoni", "Yoni"]) {
  verifier(`« ${cible} » N'EST PAS « le dernier » — c'est un vrai terme de recherche`, !estDernierMessage(cible))
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
