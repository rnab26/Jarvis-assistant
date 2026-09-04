/**
 * « Terminé », « fin de transmission », « au revoir » : Raphaël clôt la
 * conversation Live à la voix, sans toucher l'écran (demande du 4 sept.
 * 2026). Le modèle ne décide pas de ça — c'est l'app, sur ce qu'elle a
 * entendu, pour que la fermeture soit sûre et immédiate.
 *
 * Règle : la phrase ENTIÈRE doit être une formule de clôture, précédée au
 * plus de quelques mots de politesse. « J'ai terminé la tâche du plombier »
 * ou « termine le chantier X » sont des commandes, pas des adieux : elles ne
 * ferment rien. « Stop » ou « arrête » seuls ne ferment pas non plus : c'est
 * ce qu'il dit pour couper Jarvis quand il parle trop, et Google gère déjà
 * l'interruption.
 */

/** Ce qui peut précéder la formule sans changer son sens. */
const PREAMBULE = "(?:(?:ok|okay|bon|bien|merci|jarvis|allez|voila|c est bon|c est bon jarvis|d accord|parfait|super|tres bien|nickel)\\s+)*"
/** Ce qui peut la suivre. */
const SUFFIXE = "(?:\\s+(?:jarvis|merci|pour le moment|pour l instant|pour aujourd hui|pour ce soir))*"

const FORMULES = [
  "termine",
  "c est termine",
  "j ai termine",
  "fin de (?:la )?transmission",
  "fin de (?:la )?conversation",
  "fin de (?:la )?discussion",
  "fin de (?:l )?echange",
  "au revoir",
  "a plus tard",
  "a plus",
  "a bientot",
  "a tout a l heure",
  "a demain",
  "bonne nuit",
  "bonne journee",
  "bonne soiree",
  "c est tout",
  "ce sera tout",
  "on arrete la",
  "on s arrete la",
  "arrete la",
  "on en reste la",
  "coupe",
  "coupe la conversation",
  "coupe le micro",
  "ferme la conversation",
  "termine la conversation",
  "arrete la conversation",
  "stop jarvis",
  "jarvis stop",
  "arrete toi",
  "tu peux te reposer",
  "repos",
]

const MOTIF = new RegExp(`^${PREAMBULE}(?:${FORMULES.join("|")})${SUFFIXE}$`)

/** Minuscules, sans accents, sans ponctuation ni apostrophes : « C'est terminé ! » → « c est termine ». */
export function normaliserPourFin(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Vrai si ce que Raphaël vient de dire est une demande de clore la conversation. */
export function demandeFinDeConversation(texte: string): boolean {
  const propre = normaliserPourFin(texte)
  if (!propre) return false
  return MOTIF.test(propre)
}
