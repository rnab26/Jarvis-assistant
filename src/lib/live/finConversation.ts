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
 *
 * RÉGLABLE DEPUIS LE 6 SEPT. 2026 (chantier b68f3b21) : la liste des
 * formules, capturée en dur jusque-là, est éditable dans Paramètres. C'est
 * pourquoi elle est maintenant une liste de PHRASES LITTÉRALES plutôt que de
 * fragments de regex : « fin de (?:la )?transmission » n'aurait aucun sens
 * pour Raphaël dans un champ de texte, et n'aurait pas survécu à
 * normaliserPourFin() si on l'y avait fait passer (parenthèses et « ? »
 * disparaissent). Les deux variantes qu'un tel fragment couvrait sont donc
 * désormais deux entrées distinctes de la liste — le comportement accepté
 * est strictement le même, juste écrit autrement.
 */

/** Ce qui peut précéder la formule sans changer son sens. Fixe : ce n'est pas
 * ce qu'il édite, c'est le cadre dans lequel ses formules s'insèrent. */
const PREAMBULE = "(?:(?:ok|okay|bon|bien|merci|jarvis|allez|voila|c est bon|c est bon jarvis|d accord|parfait|super|tres bien|nickel)\\s+)*"
/** Ce qui peut la suivre. */
const SUFFIXE = "(?:\\s+(?:jarvis|merci|pour le moment|pour l instant|pour aujourd hui|pour ce soir))*"

/**
 * Les formules reconnues par défaut — modifiables depuis Paramètres.
 * Phrases littérales, telles qu'on les dirait : ce sont elles que la carte
 * affiche, et qu'un « Remettre la liste par défaut » restaure.
 */
export const FORMULES_PAR_DEFAUT: readonly string[] = [
  "termine",
  "c est termine",
  "j ai termine",
  "fin de transmission",
  "fin de la transmission",
  "fin de conversation",
  "fin de la conversation",
  "fin de discussion",
  "fin de la discussion",
  "fin de echange",
  "fin de l echange",
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

/** Minuscules, sans accents, sans ponctuation ni apostrophes : « C'est terminé ! » → « c est termine ». */
export function normaliserPourFin(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Échappe ce qui pourrait rester de sensible pour une regex. En pratique,
 * normaliserPourFin() ne laisse passer que [a-z0-9 ] : rien à échapper une
 * fois normalisé — mais une formule éditée par Raphaël passe par ici avant
 * normalisation dans certains appels, donc on reste défensif. */
function echapperRegex(motif: string): string {
  return motif.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Construit le motif à partir d'une liste de phrases littérales.
 * `null` si la liste ne contient, une fois normalisée, plus aucune phrase
 * utilisable — c'est le cas « il a tout supprimé » : on ne ferme plus jamais
 * par la voix tant qu'il n'a rien remis, plutôt que de retomber en silence
 * sur la liste par défaut sans le dire.
 */
function construireMotif(formules: readonly string[]): RegExp | null {
  const motifs = formules
    .map((f) => normaliserPourFin(f))
    .filter((f) => f.length > 0)
    .map(echapperRegex)
  if (motifs.length === 0) return null
  return new RegExp(`^${PREAMBULE}(?:${motifs.join("|")})${SUFFIXE}$`)
}

const MOTIF_PAR_DEFAUT = construireMotif(FORMULES_PAR_DEFAUT)

/**
 * Vrai si ce que Raphaël vient de dire est une demande de clore la
 * conversation.
 *
 * @param formulesPersonnalisees  sa liste éditée depuis Paramètres. Omise
 *   (undefined) : on utilise la liste par défaut, inchangée depuis le 4 sept.
 *   Un tableau VIDE est distinct d'`undefined` : c'est lui qui désactive la
 *   clôture vocale (liste vidée volontairement) — ne fais jamais `formules ??
 *   FORMULES_PAR_DEFAUT`, ce serait ignorer qu'il l'a vidée exprès.
 */
export function demandeFinDeConversation(texte: string, formulesPersonnalisees?: readonly string[]): boolean {
  const propre = normaliserPourFin(texte)
  if (!propre) return false
  const motif = formulesPersonnalisees === undefined ? MOTIF_PAR_DEFAUT : construireMotif(formulesPersonnalisees)
  if (!motif) return false
  return motif.test(propre)
}
