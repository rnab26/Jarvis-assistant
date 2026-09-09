/**
 * Préchauffe la connexion HTTPS vers `live-jeton`, avant que Raphaël n'ouvre
 * le Live — pour que la poignée de main réseau soit déjà faite au moment où
 * elle compte.
 *
 * MESURÉ, PAS SUPPOSÉ (chantier ba140853, 8 sept. 2026, sessionLive.ts) :
 * sur ses ouvertures Live, `ms_jeton` est bimodal (≈1200-1900 ms ou
 * ≈3500-4300 ms) et le temps DANS la fonction est stable (±20 ms) dans les
 * deux cas. Reste, hors de la fonction, le jeton d'auth et le réseau.
 *
 * CE QUI A ÉTÉ MESURÉ DEPUIS, ET CE QUI NE L'A PAS ÉTÉ (relu le 9 sept.) :
 * `ms_session` (`supabase.auth.getSession()`) vaut 1 à 4 ms sur les quatre
 * ouvertures qui le portent — c'est une lecture en mémoire, pas un
 * aller-retour. MAIS CES QUATRE-LÀ SONT TOUTES DANS LE MODE RAPIDE : aucune
 * ouverture lente ne porte encore `ms_session`. La piste du jeton d'auth est
 * donc affaiblie, pas écartée, et ce préchauffage repose sur l'hypothèse
 * réseau — une poignée de main TCP+TLS neuve coûte une à deux secondes sur
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
 *
 * ET AUCUNE DES QUATRE OUVERTURES MESURÉES CI-DESSUS NE JUGE CE MODULE :
 * elles sont du 8 sept. à 21h10-21h50, ce commit est de 22h02. Elles ne
 * prouvent donc rien sur le préchauffage, ni pour ni contre.
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
