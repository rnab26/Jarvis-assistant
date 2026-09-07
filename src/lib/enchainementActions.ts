/**
 * Le temps qu'il faut laisser à une autre application pour s'afficher avant
 * que Jarvis essaie de lire l'écran ou d'appuyer dessus.
 *
 * D'OÙ ÇA VIENT. journal_ecoute, 6 sept. 2026, 20h23 UTC (dicté comme tâche
 * perso le même jour, remonté en chantier b57b30ce : « ça bloque quand je
 * demande de lancer une série »). Une seule phrase — « aller sur YouTube,
 * rechercher un épisode de la série H, cliquer dessus et le lancer » — a
 * produit DEUX actions à la suite : ouvrir YouTube avec une recherche
 * (`open_app`), puis cliquer sur le résultat (`screen_action`). La seconde a
 * échoué (« introuvable ») parce que le clic a lu l'écran UNE SECONDE après
 * avoir lancé YouTube — trop tôt, l'écran affichait encore WhatsApp (la
 * demande précédente). Il a fallu cinq échanges de rattrapage (revenir en
 * arrière, défiler trois fois, cliquer) pour arriver là où une seule commande
 * aurait dû suffire.
 *
 * Ouvrir une autre application est TOUJOURS asynchrone du point de vue de
 * Jarvis : rien ne dit ici quand Android a fini de l'afficher. On ne peut
 * pas l'éliminer, seulement lui laisser une vraie chance — la règle de
 * sûreté du service d'accessibilité (il relit l'écran et refuse s'il n'est
 * pas sûr) reste le vrai garde-fou si l'attente ne suffit pas.
 */

/** Les actions qui font passer une AUTRE application au premier plan. Une
 * fois l'une d'elles exécutée, l'écran que Jarvis voyait n'est plus le bon. */
const FAIT_PASSER_UNE_AUTRE_APP_AU_PREMIER_PLAN = new Set([
  "open_app",
  "navigate_to",
  "call_contact",
  "send_message",
  "ask_ai",
])

/** Le temps laissé à l'application qui vient de s'ouvrir avant de lire
 * l'écran ou d'y appuyer. Mesuré large plutôt qu'optimiste : une attente de
 * trop coûte quelques centaines de millisecondes, une attente de moins fait
 * échouer le clic en silence, comme le 6 sept. */
const ATTENTE_OUVERTURE_APP_MS = 1200

/**
 * Le délai à observer avant d'exécuter `actionCourante`, sachant que
 * `actionPrecedente` vient d'être exécutée juste avant dans la même phrase.
 * `null` en `actionPrecedente` = c'est la première action de la phrase, rien
 * n'a pu changer l'écran entre-temps.
 */
export function delaiAvantAction(
  actionPrecedente: string | null,
  actionCourante: string,
): number {
  if (actionCourante !== "screen_action") return 0
  if (actionPrecedente === null) return 0
  if (!FAIT_PASSER_UNE_AUTRE_APP_AU_PREMIER_PLAN.has(actionPrecedente)) return 0
  return ATTENTE_OUVERTURE_APP_MS
}
