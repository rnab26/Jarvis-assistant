/**
 * Savoir DANS QUELLE FENÊTRE on démarre, avant de rendre quoi que ce soit.
 *
 * LE BUG, constaté sur son téléphone le 6 sept. 2026 à 8 h 24, journal à
 * l'appui. L'appui long ouvrait bien la fenêtre d'assistance, mais elle
 * affichait « Dis Jarvis pour lancer la conversation » au lieu d'écouter, et
 * rien n'aboutissait. Le journal montrait DEUX rafales d'écoute démarrées à
 * 40 millisecondes d'intervalle, à chaque tentative — 40 ms, c'est le temps
 * d'une promesse de plugin, pas d'un changement d'activité.
 *
 * LA CAUSE : `AssistOverlay.estOverlay()` est ASYNCHRONE. Pendant qu'elle
 * répondait, le routeur rendait déjà la route « / » — donc la coquille de
 * l'app normale, donc un premier micro. Ce micro-là consommait au passage le
 * drapeau « démarre l'écoute » posé par l'activité, puis se faisait démonter
 * par la redirection. Le micro de la fenêtre d'assistance, lui, arrivait une
 * fraction de seconde plus tard, ne trouvait plus le drapeau, et partait en
 * veille en attendant le mot-clé — pendant que les deux se disputaient le
 * micro du téléphone.
 *
 * D'où cette décision, sortie du composant pour être vérifiable sans
 * navigateur : on n'affiche RIEN tant qu'on ne sait pas où on est.
 */

export type OuOnEst = "inconnu" | "overlay" | "normal"

/** Ce qu'il faut rendre, selon ce qu'on sait. */
export type QuoiRendre = "attendre" | "overlay" | "normal"

export function quoiRendre(ou: OuOnEst): QuoiRendre {
  if (ou === "inconnu") return "attendre"
  return ou === "overlay" ? "overlay" : "normal"
}

/**
 * Au-delà, on considère qu'on est dans l'app normale et on affiche.
 *
 * Le filet, et il compte : `estOverlay()` répond en quelques millisecondes,
 * qu'elle réussisse (fenêtre d'assistance) ou qu'elle échoue (plugin absent,
 * donc app normale ou navigateur). Mais si elle ne répondait JAMAIS — un pont
 * Capacitor qui ne se monte pas —, attendre indéfiniment laisserait Raphaël
 * devant un écran blanc, sans rien pour le lui dire. Une app qui s'affiche
 * vaut mieux qu'une app qui attend.
 */
export const DELAI_MAX_MS = 1500
