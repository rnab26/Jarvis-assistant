// Import relatif avec extension : ce module est lu par
// `scripts/verifier-sessions-autonomes.ts` sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { AUTONOMIE_PAR_DEFAUT } from "./passeAutonome.ts"
import { ecrireReglage } from "./reglages.ts"

/**
 * L'interrupteur des sessions autonomes.
 *
 * Il commande une dépense — chaque passe consomme son crédit Claude Code — et
 * du code poussé pendant qu'il dort. C'est donc la première chose que lit une
 * session autonome, avant même de regarder s'il y a du travail, et c'est aussi
 * la seule chose dont il ait besoin pour tout arrêter sans nous.
 *
 * La valeur voyage jusqu'à la base comme les autres réglages (table
 * `reglages`), et c'est LÀ que la session la lit : elle ne tourne pas sur son
 * téléphone. D'où l'importance de passer par `ecrireReglage` et pas par
 * `localStorage.setItem` — une écriture directe resterait sur l'appareil, et
 * l'éteindre n'éteindrait rien du tout.
 */
export const AUTONOMIE_KEY = "jarvis_sessions_autonomes"

export function lireAutonomie(): boolean {
  try {
    const v = localStorage.getItem(AUTONOMIE_KEY)
    if (v === null || v === "") return AUTONOMIE_PAR_DEFAUT
    return v !== "false"
  } catch {
    return AUTONOMIE_PAR_DEFAUT
  }
}

export function ecrireAutonomie(actif: boolean) {
  ecrireReglage(AUTONOMIE_KEY, actif ? "true" : "false")
}
