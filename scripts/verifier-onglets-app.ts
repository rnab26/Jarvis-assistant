/**
 * Changer d'onglet dans l'app, à la voix (chantier a9c75d52) — et surtout ne
 * pas prendre pour un onglet ce qui n'en est pas un.
 *
 *   node --experimental-strip-types scripts/verifier-onglets-app.ts
 *
 * Aucun réseau. MESURÉ le 23 sept. 2026 avant ce correctif : « ouvre le
 * cockpit » cherchait une APPLICATION DU TÉLÉPHONE nommée « Le cockpit »,
 * « va dans le cockpit » ouvrait la section cockpit de Paramètres, et
 * « emmène-moi dans mes notes » n'était pas compris.
 */
import { interpreterLocalement } from "../src/lib/commandeLocale.ts"
import { ongletDemande } from "../src/lib/ongletsApp.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}
const action = (p: string) =>
  interpreterLocalement(p, { taches: [], chantiers: [], notes: [] })?.[0] as Record<string, unknown> | undefined

// ── Les cas mesurés : un onglet, pas une application ni une section ──
for (const [phrase, chemin] of [
  ["ouvre le cockpit", "/cockpit"],
  ["va dans le cockpit", "/cockpit"],
  ["ouvre la mémoire", "/memoire"],
  ["ouvre les paramètres", "/settings"],
  ["emmène-moi dans mes notes", "/notes"],
  ["va dans mes tâches", "/"],
  ["ouvre l'onglet notes", "/notes"],
  ["montre-moi les messages programmés", "/programme"],
  ["affiche mes documents", "/documents"],
  ["retourne sur le cockpit dev", "/cockpit"],
] as const) {
  const a = action(phrase)
  verifier(`« ${phrase} » ouvre l'onglet ${chemin}`, a?.action === "navigate_tab" && a.chemin === chemin, JSON.stringify(a))
}

// ── Le silence : ce qui n'est PAS un changement d'onglet ──
verifier("« ouvre WhatsApp » reste une application du téléphone", action("ouvre WhatsApp")?.action === "open_app")
verifier("« ouvre Samsung Notes » aussi (pas l'onglet Notes)", action("ouvre Samsung Notes")?.action === "open_app")
verifier(
  "« emmène-moi à la villa Dan » reste un itinéraire",
  action("emmène-moi à la villa Dan")?.action === "navigate_to",
)
verifier(
  "« va voir les réglages du cockpit » reste la section de Paramètres",
  action("va voir les réglages du cockpit")?.action === "navigate_settings",
)
verifier(
  "« emmène-moi dans les notifications » reste la section de Paramètres",
  action("emmène-moi dans les notifications")?.action === "navigate_settings",
)
verifier("« montre-moi mes tâches » les LIT toujours", action("montre-moi mes tâches")?.action === "list_tasks")
verifier("« lis mes notes » les LIT toujours", action("lis mes notes")?.action === "list_notes")
verifier("« ouvre les notes de Mélissa » n'est pas deviné", ongletDemande("ouvre les notes de melissa") === null)
verifier("un verbe seul n'ouvre rien", ongletDemande("ouvre") === null)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
