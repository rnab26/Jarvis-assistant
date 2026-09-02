/** Au-delà, on préfère afficher une erreur et un bouton Réessayer. */
const DEFAULT_TIMEOUT_MS = 8000

/**
 * Borne un appel réseau dans le temps.
 *
 * supabase-js réessaie tout seul un appel qui échoue, pendant près d'une
 * minute (mesuré : 58 s, une douzaine de tentatives). Sans cette borne,
 * l'écran reste sur "Chargement..." tout ce temps au lieu de dire ce qui ne
 * va pas et de proposer de réessayer.
 */
// PromiseLike et non Promise : les requêtes supabase-js sont des "thenables"
// (query builders), pas de vraies promesses.
export function withTimeout<T>(promise: PromiseLike<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Le serveur ne répond pas. Vérifie ta connexion.")),
      ms,
    )
  })
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer))
}
