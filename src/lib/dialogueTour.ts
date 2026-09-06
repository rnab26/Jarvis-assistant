/**
 * Un tour de parole, indépendamment du moteur de reconnaissance vocale.
 *
 * Pourquoi ce module existe : ni Android ni Chrome ne savent dire « la
 * personne a fini de parler ». Ils coupent l'écoute sur LEUR propre minuteur
 * de silence, court et non réglable. C'est la cause commune de trois défauts
 * signalés — la phrase tranchée dès qu'on reprend son souffle, la phrase
 * longue tronquée, et le micro qu'il faut réappuyer entre deux répliques.
 *
 * La réponse durable n'est pas de rallonger un minuteur : c'est de ne plus
 * laisser le moteur décider. On accumule ce qui a été entendu à travers
 * plusieurs sessions de reconnaissance successives, et on ne clôt le tour que
 * sur un silence qu'on mesure nous-mêmes.
 *
 * Volontairement sans horloge ni minuteur interne : chaque fonction reçoit
 * l'instant courant. C'est ce qui rend la décision vérifiable sans micro et
 * sans navigateur (`node --experimental-strip-types scripts/verifier-dialogue.ts`).
 */

export interface OptionsTour {
  /** Silence toléré en pleine phrase avant de considérer le tour terminé. */
  silenceMs: number
  /**
   * Silence suffisant quand DEUX indices concordent : le moteur s'est arrêté
   * de lui-même depuis le dernier mot (il a détecté une fin de parole), et la
   * phrase a l'air finie (voir `phraseSembleFinie`). Absent = jamais.
   *
   * Pourquoi : Raphaël a monté sa pause à 4 s pour ne plus être coupé en
   * pleine phrase — et depuis, Jarvis attend 4 s après CHAQUE phrase, même
   * « ajoute une tâche pour le plombier ». Une phrase suspendue (« … et »,
   * « … pour ») garde la pause complète ; une phrase qui tient debout n'a
   * pas à attendre autant.
   */
  silenceCourtMs?: number
  /** Temps laissé pour commencer à parler avant d'abandonner le tour. */
  premierMotMs: number
  /** Garde-fou absolu, pour ne jamais rester en écoute indéfiniment. */
  maxMs: number
}

export interface EtatTour {
  /** Segments déjà clos (une session de reconnaissance = un segment). */
  segments: string[]
  /** Texte de la session de reconnaissance en cours. */
  courant: string
  /** Instant du dernier mot réellement nouveau — la base du calcul de silence. */
  dernierMotAt: number
  /** Début du tour. */
  debutAt: number
  /** Le moteur s'est arrêté de lui-même depuis le dernier mot entendu : il a
   * jugé la parole finie. Remis à faux dès qu'un mot nouveau arrive. */
  moteurArreteDepuisDernierMot: boolean
}

/**
 * "attendre"    : laisser le moteur continuer.
 * "relancer"    : le moteur s'est arrêté mais la personne n'a pas fini — on
 *                 redémarre une session et on continue d'accumuler.
 * "terminer"    : silence confirmé, on rend le texte accumulé.
 * "abandonner"  : rien n'a été dit.
 */
export type DecisionTour = "attendre" | "relancer" | "terminer" | "abandonner"

export function creerTour(maintenant: number): EtatTour {
  return {
    segments: [],
    courant: "",
    dernierMotAt: maintenant,
    debutAt: maintenant,
    moteurArreteDepuisDernierMot: false,
  }
}

/**
 * Enregistre ce que le moteur vient d'entendre pour la session en cours.
 * Le minuteur de silence n'est remis à zéro que si le texte a réellement
 * changé : Android répète le même résultat partiel plusieurs fois par
 * seconde, et le prendre pour de la parole empêcherait tout silence d'être
 * jamais détecté.
 */
export function noterTexte(etat: EtatTour, texte: string, maintenant: number): EtatTour {
  if (texte === etat.courant) return etat
  return { ...etat, courant: texte, dernierMotAt: maintenant, moteurArreteDepuisDernierMot: false }
}

/**
 * Clôt la session de reconnaissance en cours. Le moteur repart de zéro à la
 * session suivante : ce qu'il a déjà rendu doit donc être mis de côté, sinon
 * le début de la phrase serait perdu à chaque relance.
 */
export function cloturerSegment(etat: EtatTour): EtatTour {
  const arrete = texteDuTour(etat).length > 0
  if (!etat.courant.trim()) return { ...etat, courant: "", moteurArreteDepuisDernierMot: arrete }
  return {
    ...etat,
    segments: [...etat.segments, etat.courant.trim()],
    courant: "",
    moteurArreteDepuisDernierMot: true,
  }
}

/**
 * Mots sur lesquels une phrase parlée ne se termine pas : si le dernier mot
 * entendu est l'un d'eux, la personne cherche la suite. Liste volontairement
 * prudente — un oubli coûte une attente de 4 s, un excès coupe la parole.
 */
const MOTS_SUSPENDUS = new Set([
  "et", "ou", "puis", "mais", "donc", "alors", "ensuite", "aussi", "comme", "si",
  "de", "du", "des", "d", "a", "au", "aux", "pour", "avec", "sans", "sur", "dans",
  "par", "vers", "chez", "en", "entre", "apres", "avant", "pendant",
  "que", "qui", "qu", "le", "la", "les", "l", "un", "une",
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "ne", "n", "me", "te", "se", "y", "lui", "leur",
  "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "ce", "cet", "cette", "ces",
  "plus", "moins", "tres", "trop", "euh", "hum", "ben", "bah", "enfin",
])

/**
 * Sous ce nombre de mots, on ne pr\u00e9tend rien : un seul mot (ou une seule
 * lettre) ne dit pas si la phrase est finie, il n'y a simplement pas encore
 * assez dit pour en juger.
 *
 * TROUV\u00c9 le 6 sept. 2026 (chantier 6b33ee97), en cherchant pourquoi
 * l'\u00e9pellation \u00ab quand j'\u00e9pelle des lettres, il s'arr\u00eate et note n'importe
 * quoi \u00bb : chaque lettre arrive comme un segment isol\u00e9, le moteur se coupe
 * entre deux (moteurArreteDepuisDernierMot), et une lettre seule n'est
 * presque jamais dans MOTS_SUSPENDUS \u2014 phraseSembleFinie() la jugeait donc
 * \u00ab finie \u00bb apr\u00e8s la toute premi\u00e8re lettre, et le tour se terminait avant
 * qu'il ait fini d'\u00e9peler. Le m\u00eame m\u00e9canisme explique une partie de \u00ab coupe
 * la parole en plein milieu des phrases \u00bb : une pause pour respirer apr\u00e8s un
 * mot isol\u00e9 qui ne tient pas debout seul (un nom, un chiffre) pouvait d\u00e9j\u00e0
 * clore le tour sur la foi d'un seul mot.
 */
const MIN_MOTS_POUR_JUGER = 2

/** La phrase a-t-elle l'air finie ? Faux si vide, si le dernier mot est
 * suspendu, ou s'il n'y a pas encore assez de mots pour en juger. */
export function phraseSembleFinie(texte: string): boolean {
  const mots = texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/'/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (mots.length < MIN_MOTS_POUR_JUGER) return false
  return !MOTS_SUSPENDUS.has(mots[mots.length - 1])
}

/** Tout ce qui a été entendu depuis le début du tour. */
export function texteDuTour(etat: EtatTour): string {
  return [...etat.segments, etat.courant]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
}

/**
 * @param moteurArrete true si le moteur vient de s'arrêter de lui-même (ce
 * qui n'est pas la même chose qu'un silence : Android coupe sur une simple
 * respiration).
 */
export function decider(
  etat: EtatTour,
  maintenant: number,
  opts: OptionsTour,
  moteurArrete: boolean,
): DecisionTour {
  const texte = texteDuTour(etat)
  const depuisDebut = maintenant - etat.debutAt

  // Garde-fou : au-delà, on rend ce qu'on a plutôt que d'écouter sans fin.
  if (depuisDebut >= opts.maxMs) return texte ? "terminer" : "abandonner"

  if (!texte) {
    if (depuisDebut >= opts.premierMotMs) return "abandonner"
    return moteurArrete ? "relancer" : "attendre"
  }

  const silence = maintenant - etat.dernierMotAt
  if (silence >= opts.silenceMs) return "terminer"
  if (
    opts.silenceCourtMs !== undefined &&
    etat.moteurArreteDepuisDernierMot &&
    silence >= opts.silenceCourtMs &&
    phraseSembleFinie(texte)
  ) {
    return "terminer"
  }
  return moteurArrete ? "relancer" : "attendre"
}
