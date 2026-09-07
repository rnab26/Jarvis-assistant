/**
 * Vérifie le délai posé entre deux actions d'une même phrase, sans téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-enchainement-actions.ts
 *
 * CE QUI PEUT ÊTRE FAUX EN SILENCE ICI : un clic ou une lecture d'écran
 * exécutés juste après avoir ouvert une autre application lisent encore
 * l'écran PRÉCÉDENT — chantier b57b30ce, 6 sept. 2026, « aller sur YouTube,
 * rechercher un épisode de la série H, cliquer dessus » a raté son clic
 * parce que YouTube n'avait pas fini de s'afficher.
 */
import { delaiAvantAction } from "../src/lib/enchainementActions.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

verifier(
  "ouvrir YouTube puis cliquer sur le résultat : on attend",
  delaiAvantAction("open_app", "screen_action") > 0,
  "c'est exactement le cas raté du 6 sept.",
)
verifier(
  "ouvrir Waze puis cliquer : on attend aussi",
  delaiAvantAction("navigate_to", "screen_action") > 0,
)
verifier(
  "composer un numéro puis cliquer : on attend",
  delaiAvantAction("call_contact", "screen_action") > 0,
)
verifier(
  "préparer un message WhatsApp puis cliquer : on attend",
  delaiAvantAction("send_message", "screen_action") > 0,
)
verifier(
  "poser une question à une IA puis cliquer : on attend",
  delaiAvantAction("ask_ai", "screen_action") > 0,
)
verifier(
  "deux clics d'écran à la suite : aucune attente, l'écran est déjà le bon",
  delaiAvantAction("screen_action", "screen_action") === 0,
  "un clic ne fait pas changer l'application au premier plan, contrairement à open_app",
)
verifier(
  "première action de la phrase : rien avant elle n'a pu changer l'écran",
  delaiAvantAction(null, "screen_action") === 0,
)
verifier(
  "ouvrir une app puis PAS un screen_action : aucune attente à payer pour rien",
  delaiAvantAction("open_app", "add_task") === 0,
  "l'attente ne sert qu'à laisser le temps de lire ou cliquer, pas à ralentir toute action",
)
verifier(
  "ouvrir une app puis relire les tâches : aucune attente",
  delaiAvantAction("open_app", "list_tasks") === 0,
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
