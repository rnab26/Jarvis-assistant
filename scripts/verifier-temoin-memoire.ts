/**
 * Le témoin de la mémoire ne doit pas crier au loup.
 *
 *   node --experimental-strip-types scripts/verifier-temoin-memoire.ts
 *
 * CE QU'IL A SIGNALÉ, 7 sept. 2026, capture à l'appui : « La mémoire de Jarvis
 * ne retient plus rien — 21 échanges dictés depuis la dernière chose retenue ».
 *
 * C'ÉTAIT FAUX, et c'est établi : au moment même de sa capture (18:21 chez
 * lui), un souvenir venait d'être créé — « L'épouse de Raphaël se prénomme
 * Yael », 15:23:17 UTC, avec le journal « mémoire : nouveau » à la seconde.
 *
 * LA CAUSE : `sante_memoire()` comptait TOUS les échanges depuis le dernier
 * souvenir. Or `echangeLocal.ts` écrit aussi les commandes comprises SUR
 * L'APPAREIL, qui ne passent jamais par l'extraction — c'est délibéré et écrit
 * dans le CLAUDE.md. Le compteur montait donc sur des échanges qui ne
 * pouvaient PAS le faire redescendre : plus il dictait de tâches, plus la
 * mémoire avait l'air morte.
 *
 * CE CONTRÔLE LIT LE CODE, comme `verifier-pannes-silencieuses.ts` : ce qui
 * casse ici ne lève aucune exception et ne se voit sur aucun écran de test —
 * un écrivain qui oublie sa `source` remet silencieusement le défaut.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}
const lire = (chemin: string) => readFileSync(chemin, "utf8")

console.log("— Chaque écriture dans `echanges` dit d'où elle vient —")

{
  const local = lire("src/lib/echangeLocal.ts")
  verifier(
    "une commande comprise sur l'appareil se marque « appareil »",
    /source:\s*"appareil"/.test(local),
    "sans ça, elle recompte pour le témoin alors qu'elle ne peut produire aucun souvenir",
  )
}
{
  const serveur = lire("supabase/functions/voice-command/memoire.ts")
  verifier(
    "un échange passé par le serveur se marque « serveur »",
    /source:\s*"serveur"/.test(serveur),
    "compté comme inconnu, il resterait juste — mais la distinction s'effacerait avec le temps",
  )
}

console.log("\n— Le bouton dit ce qu'il fait —")

{
  const banniere = lire("src/components/memoire/SanteMemoire.tsx")
  verifier(
    "« Revérifier » montre qu'il travaille",
    /Vérification…/.test(banniere) && /animate-spin/.test(banniere),
    "sans retour visible, revérifier un état inchangé ne se distingue pas d'un bouton mort — c'est ce qu'il a signalé",
  )
  verifier(
    "   et il dit le résultat même quand rien n'a changé",
    /Vérifié à l'instant/.test(banniere),
    "« chaque action doit dire visiblement qu'elle a réussi ou échoué » — sa règle, y compris quand elle réussit sans rien changer",
  )
  verifier(
    "   et il ne peut pas être appuyé deux fois pendant qu'il tourne",
    /disabled=\{verification === "encours"\}/.test(banniere),
  )
  verifier(
    "une panne de LECTURE reste distincte d'une mémoire en panne",
    /Impossible de savoir si la mémoire tourne/.test(banniere),
    "sinon « je n'ai pas pu lire » se lirait comme « elle ne retient rien » — la panne silencieuse que ce témoin existe pour attraper",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
