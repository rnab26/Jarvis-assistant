/**
 * Découpe une demande TAPÉE en un titre court et une note complète.
 *
 * Volontairement différent de `decouper()` dans commandeLocale.ts, qui traite
 * une DICTÉE : la dictée arrive sans ponctuation ni retour à la ligne, donc
 * là-bas on compte les mots. Ici Raphaël tape, et le texte tapé porte déjà sa
 * propre structure — un retour à la ligne, un point. La première phrase EST
 * le titre qu'il a écrit ; l'inventer autrement reviendrait à lui retirer un
 * choix qu'il vient de faire.
 *
 * Règle intangible des deux côtés : rien ne se perd. Dès que le titre ne
 * reprend pas tout le texte, le texte entier part dans la note.
 */

/** Au-delà, un titre déborde de la carte sur un écran de téléphone. */
const TITRE_MAX = 80

/** Un titre coupé garde au moins ça, sinon il ne veut plus rien dire. */
const TITRE_MIN = 20

/**
 * Mots-outils sur lesquels un titre tronqué ne doit pas se terminer :
 * « Refaire le visuel du cockpit pour que » se lit mal dans une liste.
 */
const OUTILS = new Set([
  "a", "à", "au", "aux", "de", "du", "des", "la", "le", "les", "un", "une",
  "et", "ou", "que", "qui", "en", "pour", "dans", "sur", "avec", "sans",
  "il", "elle", "je", "ce", "cet", "cette", "mon", "ma", "mes", "son", "sa",
  "ses", "par", "chez", "vers", "est", "sont", "plus", "moins",
])

/** Fin de première phrase : un retour à la ligne, ou une ponctuation forte. */
const FIN_DE_PHRASE = /\n|(?<=[^0-9])[.!?;](?=\s|$)/

function tronquer(texte: string): string {
  if (texte.length <= TITRE_MAX) return texte

  const mots = texte.slice(0, TITRE_MAX).split(/\s+/).filter(Boolean)
  // Le dernier mot est presque toujours coupé en deux par la troncature.
  if (mots.length > 1) mots.pop()
  while (mots.length > 1 && OUTILS.has(mots[mots.length - 1].toLowerCase())) mots.pop()

  const coupe = mots.join(" ")
  // Un titre réduit à trois mots-outils ne vaut pas mieux qu'une coupe brute.
  return coupe.length >= TITRE_MIN ? `${coupe}…` : `${texte.slice(0, TITRE_MAX).trim()}…`
}

export interface DemandeDecoupee {
  titre: string
  /** Le texte intégral, ou null quand le titre le reprend déjà en entier. */
  notes: string | null
}

export function decouperDemande(texte: string): DemandeDecoupee {
  const complet = texte.trim().replace(/\s+\n/g, "\n")
  if (!complet) return { titre: "", notes: null }

  const coupure = complet.search(FIN_DE_PHRASE)
  const premiere = (coupure === -1 ? complet : complet.slice(0, coupure)).trim()

  const titre = tronquer(premiere || complet)
  // La note ne se remplit que si elle apporte quelque chose de plus.
  return { titre, notes: titre === complet ? null : complet }
}
