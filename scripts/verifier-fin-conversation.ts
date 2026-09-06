/**
 * La commande vocale qui clôt une conversation Live, sans réseau :
 *
 *   node --experimental-strip-types scripts/verifier-fin-conversation.ts
 *
 * Ce que ça prouve : les formules de clôture ferment, les commandes qui
 * contiennent le même mot (« termine le chantier ») ne ferment pas.
 *
 * DEPUIS LE 6 SEPT. 2026 (chantier b68f3b21), la liste est réglable depuis
 * Paramètres : la seconde moitié de ce fichier vérifie la personnalisation —
 * une formule ajoutée par Raphaël ferme, une qu'il a retirée ne ferme plus,
 * et une liste VIDÉE ne ferme jamais rien (plutôt que de retomber en
 * silence sur la liste par défaut, ce qui le laisserait croire qu'il l'a
 * bien vidée alors que non).
 */
import { demandeFinDeConversation, FORMULES_PAR_DEFAUT } from "../src/lib/live/finConversation.ts"

const ferment = [
  "Terminé.",
  "terminé",
  "C'est terminé !",
  "OK, terminé",
  "Merci Jarvis, terminé.",
  "Fin de transmission.",
  "fin de la transmission",
  "Fin de conversation",
  "Au revoir",
  "Au revoir Jarvis",
  "Merci, à plus tard.",
  "À plus tard Jarvis",
  "Bonne nuit Jarvis",
  "C'est tout pour aujourd'hui.",
  "C'est bon, c'est tout.",
  "On s'arrête là.",
  "on arrête là merci",
  "Coupe le micro",
  "Ferme la conversation",
  "Stop Jarvis",
  "Parfait, merci, fin de discussion.",
]

const neFermentPas = [
  "J'ai terminé la tâche du plombier",
  "termine le chantier du widget",
  "Marque la tâche plombier comme terminée",
  "Quelles sont mes tâches ?",
  "Stop",
  "Arrête",
  "arrête de parler",
  "Ajoute une tâche : appeler Mel demain",
  "Est-ce que c'est terminé pour le chantier Live ?",
  "Dis-moi quand ce sera terminé",
  "au revoir à tous, ajoute ça dans le message",
  "",
  "   ",
]

let echecs = 0
const verifier = (nom: string, obtenu: boolean, attendu: boolean) => {
  const ok = obtenu === attendu
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}`)
}

for (const phrase of ferment) verifier(`ferme    « ${phrase} »`, demandeFinDeConversation(phrase), true)
for (const phrase of neFermentPas) verifier(`ne ferme pas « ${phrase} »`, demandeFinDeConversation(phrase), false)

// --- La liste éditée depuis Paramètres (chantier b68f3b21) -----------------
{
  verifier(
    "liste par défaut : au moins une formule connue",
    FORMULES_PAR_DEFAUT.includes("termine"),
    true,
  )

  const personnalisee = ["à la revoyure", "coupe la conversation"]
  verifier(
    "formule ajoutée par Raphaël : ferme",
    demandeFinDeConversation("À la revoyure !", personnalisee),
    true,
  )
  verifier(
    "une formule du défaut absente de sa liste : ne ferme plus",
    demandeFinDeConversation("Au revoir", personnalisee),
    false,
  )
  verifier(
    "une formule encore dans sa liste : ferme toujours",
    demandeFinDeConversation("Coupe la conversation", personnalisee),
    true,
  )

  // Liste vidée : jamais de repli silencieux sur le défaut.
  verifier("liste vide : plus rien ne ferme, même « terminé »", demandeFinDeConversation("Terminé.", []), false)
  verifier("liste vide : même l'ancien défaut ne ferme plus", demandeFinDeConversation("Au revoir", []), false)

  // undefined (pas de personnalisation) reste le défaut, à l'identique.
  verifier(
    "sans personnalisation : le défaut s'applique toujours",
    demandeFinDeConversation("Terminé.", undefined),
    true,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
