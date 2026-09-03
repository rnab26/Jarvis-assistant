/**
 * Reconnaître « Jarvis » dans ce que la dictée a compris.
 *
 * Deux raisons pour lesquelles le réveil vocal ratait, et elles se cumulent :
 *
 * 1. La dictée française n'écrit presque jamais « Jarvis ». Elle rend
 *    « Jarvice », « Jarvi », « Charvis », « Java », « service »… parce que le
 *    mot n'est dans aucun dictionnaire. Chercher la chaîne exacte, comme on le
 *    faisait, revenait à jeter la moitié des réveils réussis.
 * 2. Le micro n'écoutait que par rafales courtes, avec un trou entre chaque
 *    (voir useSpeechRecognition). Ça, c'est corrigé ailleurs.
 *
 * Ici on traite le premier point : accepter ce qui SONNE comme « Jarvis »,
 * sans accepter n'importe quoi. Le curseur est réglé sur une distance de deux
 * corrections, mesurée mot à mot — assez pour « jarvice » ou « charvis »,
 * pas assez pour « service » (4) ni « j'arrive » (découpé en deux mots dont
 * aucun n'approche).
 */

const MOT_CLE = "jarvis"

/** Au-delà, ce n'est plus une erreur de transcription mais un autre mot. */
const TOLERANCE = 2

/** Trop court : « java », « jari » passeraient sur du bruit ambiant. */
const LONGUEUR_MIN = 5

/**
 * Formes entendues en vrai, que la distance seule ne rattrape pas toujours —
 * soit parce qu'elles sont trop loin, soit parce qu'elles collent un article.
 * À compléter au fil de ce que Raphaël constate.
 */
const VARIANTES = new Set([
  "jarvis",
  "jarvice",
  "jarvisse",
  "jarvys",
  "djarvis",
  "charvis",
  "sharvis",
  "jarvi",
  "jarvie",
  "javis",
  "jervis",
  "garvis",
  "harvis",
])

export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Distance de Levenshtein, bornée : au-delà de `max` on arrête de compter. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1

  let precedente = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const courante = [i]
    let minLigne = i
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      const valeur = Math.min(
        precedente[j] + 1,
        courante[j - 1] + 1,
        precedente[j - 1] + cout,
      )
      courante.push(valeur)
      if (valeur < minLigne) minLigne = valeur
    }
    // Toute la ligne dépasse déjà le seuil : le résultat final aussi.
    if (minLigne > max) return max + 1
    precedente = courante
  }
  return precedente[b.length]
}

function ressembleAuMotCle(mot: string): boolean {
  if (VARIANTES.has(mot)) return true
  if (mot.length < LONGUEUR_MIN) return false
  // La distance seule est trop généreuse : « Marvin » n'est qu'à deux
  // corrections de « jarvis » et déclenchait un réveil en pleine phrase.
  // Un « Jarvis » mal transcrit garde presque toujours son attaque en J —
  // les formes qui la perdent (charvis, sharvis) sont listées une à une
  // au-dessus. Couper la parole à Raphaël pour rien coûte plus cher que
  // rater une variante rare.
  if (!mot.startsWith("j")) return false
  return distance(mot, MOT_CLE, TOLERANCE) <= TOLERANCE
}

export interface Reveil {
  /** Le mot-clé a été reconnu dans la phrase. */
  trouve: boolean
  /** Ce qui reste une fois le mot-clé retiré — la demande, si elle est là. */
  reste: string
}

/**
 * Cherche le mot-clé dans une phrase entendue, et rend ce qui l'accompagne.
 *
 * « Jarvis ajoute une tâche » rend { trouve: true, reste: "ajoute une tâche" }
 * et la demande part directement. « Jarvis » seul rend un reste vide : Jarvis
 * répond « Oui ? » et écoute la suite.
 */
export function chercherMotCle(transcript: string): Reveil {
  const mots = normaliser(transcript).split(" ").filter(Boolean)
  const index = mots.findIndex(ressembleAuMotCle)
  if (index === -1) return { trouve: false, reste: "" }

  // Tout ce qui suit le mot-clé est la demande. Ce qui le précède
  // ("dis donc Jarvis", "eh Jarvis") n'en fait pas partie.
  const reste = mots.slice(index + 1).join(" ").trim()
  return { trouve: true, reste }
}
