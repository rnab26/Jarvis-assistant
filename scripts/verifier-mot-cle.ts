/**
 * Vérifie la reconnaissance du mot-clé « Jarvis ».
 *
 *   node --experimental-strip-types scripts/verifier-mot-cle.ts
 *
 * Aucun réseau, aucun micro : on rejoue ce que la dictée française rend
 * réellement quand Raphaël dit « Jarvis », et ce qu'elle rend quand il dit
 * autre chose. Les deux listes comptent autant : rater un réveil est
 * agaçant, en déclencher un sur une conversation ordinaire l'est plus encore.
 */
import { chercherMotCle } from "../src/lib/motCle.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// Ce que la dictée écrit quand il dit « Jarvis » : le mot n'est dans aucun
// dictionnaire français, elle propose donc le plus proche qu'elle connaît.
const DOIT_REVEILLER: [string, string][] = [
  ["Jarvis", ""],
  ["jarvis ajoute une tâche pour le plombier", "ajoute une tache pour le plombier"],
  ["Jarvice, qu'est-ce que j'ai demain ?", "qu'est ce que j'ai demain"],
  ["Charvis ajoute une tâche", "ajoute une tache"],
  ["Djarvis", ""],
  ["jarvi c'est quoi mon planning", "c'est quoi mon planning"],
  ["Javis rappelle-moi d'appeler Yoni", "rappelle moi d'appeler yoni"],
  ["JARVIS !", ""],
  ["eh Jarvis, tu m'entends", "tu m'entends"],
  ["jarvisse ajoute un chantier", "ajoute un chantier"],
]

for (const [entendu, resteAttendu] of DOIT_REVEILLER) {
  const r = chercherMotCle(entendu)
  if (!r.trouve) {
    verifier(`réveille sur « ${entendu} »`, false, "mot-clé non reconnu")
  } else {
    verifier(
      `réveille sur « ${entendu} »`,
      r.reste === resteAttendu,
      `reste = « ${r.reste} », attendu « ${resteAttendu} »`,
    )
  }
}

// Des phrases ordinaires, dont plusieurs contiennent des mots proches. Un
// faux réveil coupe la parole à Raphaël en pleine conversation : c'est pire
// qu'un réveil raté.
const NE_DOIT_PAS_REVEILLER = [
  "je suis en service commandé",
  "j'arrive dans cinq minutes",
  "le service client m'a rappelé",
  "on part en Java cet été",
  "sers-toi un verre",
  "la jarre est sur la table",
  "j'ai vu Marvin hier",
  "il faut que je parte",
  "",
  "d'accord merci beaucoup",
]

for (const phrase of NE_DOIT_PAS_REVEILLER) {
  const r = chercherMotCle(phrase)
  verifier(`ne réveille pas sur « ${phrase} »`, !r.trouve, `reconnu à tort, reste = « ${r.reste} »`)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
