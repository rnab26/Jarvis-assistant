/**
 * Préchauffe la connexion HTTPS vers `live-jeton`, avant que Raphaël n'ouvre
 * le Live — pour que la poignée de main réseau soit déjà faite au moment où
 * elle compte.
 *
 * MESURÉ, PAS SUPPOSÉ (chantier ba140853, 8 sept. 2026, sessionLive.ts) :
 * sur ses ouvertures Live, `ms_jeton` est bimodal (≈1200-1900 ms ou
 * ≈3500-4300 ms), le temps DANS la fonction est stable (±20 ms) dans les
 * deux cas, et `ms_session` (le renouvellement du jeton d'auth,
 * `supabase.auth.getSession()`) reste petit (1-4 ms) dans les deux cas
 * aussi — la piste du jeton d'auth est donc écartée. Il ne reste que le
 * réseau : une poignée de main TCP+TLS neuve coûte une à deux secondes sur
 * un réseau mobile, une connexion déjà ouverte ne coûte rien.
 *
 * On ne peut pas chronométrer une poignée de main depuis l'app — seulement
 * la provoquer plus tôt. `OPTIONS` est la requête la plus légère possible :
 * `live-jeton` y répond en tout premier, avant la moindre lecture ni
 * authentification (voir `index.ts`), donc sans consommer ni quota ni
 * temps de calcul. Sans authentification, `no-cors` : on n'a besoin
 * d'aucune réponse, seulement que la connexion existe.
 *
 * NON VÉRIFIÉ SUR APPAREIL : que la connexion reste réutilisable jusqu'à la
 * vraie ouverture. C'est un comportement standard de la pile réseau
 * (Chromium, qui sert aussi la WebView d'Android), pas une hypothèse sur
 * l'API Supabase — mais seul un usage réel dira si la fenêtre de réutilisation
 * suffit. Si `ms_jeton` reste bimodal après ce correctif, cette piste est
 * morte à son tour et il faudra le dire plutôt que de la retenter.
 */

// `?.` : sous Node (scripts/verifier-prechauffage.ts), `import.meta.env`
// n'existe pas — seul Vite le fournit. Lu en dehors de toute fonction pure,
// donc ce module reste chargeable pour vérifier `doitPrechauffer()`.
const supabaseUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL

/** Espacement minimal entre deux préchauffages : inutile de rouvrir une
 * connexion déjà chaude, et ça éviterait de solliciter le réseau à chaque
 * rendu si l'appelant est rappelé souvent. */
const DELAI_MIN_MS = 20000

/** Pur, pour rester vérifiable sans réseau ni horloge système
 * (`scripts/verifier-prechauffage.ts`). */
export function doitPrechauffer(dernierAppelAt: number, maintenant: number): boolean {
  return maintenant - dernierAppelAt >= DELAI_MIN_MS
}

let dernierAppelAt = 0

export function prechaufferConnexionLive() {
  if (!supabaseUrl) return
  const maintenant = Date.now()
  if (!doitPrechauffer(dernierAppelAt, maintenant)) return
  dernierAppelAt = maintenant
  fetch(`${supabaseUrl}/functions/v1/live-jeton`, { method: "OPTIONS", mode: "no-cors" }).catch(() => {
    // Best-effort : un échec ne doit rien empêcher, l'ouverture réelle
    // retentera sa propre connexion de toute façon.
  })
}
