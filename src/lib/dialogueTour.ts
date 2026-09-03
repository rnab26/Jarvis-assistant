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
  return { segments: [], courant: "", dernierMotAt: maintenant, debutAt: maintenant }
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
  return { ...etat, courant: texte, dernierMotAt: maintenant }
}

/**
 * Clôt la session de reconnaissance en cours. Le moteur repart de zéro à la
 * session suivante : ce qu'il a déjà rendu doit donc être mis de côté, sinon
 * le début de la phrase serait perdu à chaque relance.
 */
export function cloturerSegment(etat: EtatTour): EtatTour {
  if (!etat.courant.trim()) return { ...etat, courant: "" }
  return { ...etat, segments: [...etat.segments, etat.courant.trim()], courant: "" }
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

  if (maintenant - etat.dernierMotAt >= opts.silenceMs) return "terminer"
  return moteurArrete ? "relancer" : "attendre"
}
