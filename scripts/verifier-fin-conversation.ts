/**
 * La commande vocale qui clôt une conversation Live, sans réseau :
 *
 *   node --experimental-strip-types scripts/verifier-fin-conversation.ts
 *
 * Ce que ça prouve : les formules de clôture ferment, les commandes qui
 * contiennent le même mot (« termine le chantier ») ne ferment pas.
 */
import { demandeFinDeConversation } from "../src/lib/live/finConversation.ts"

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

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
