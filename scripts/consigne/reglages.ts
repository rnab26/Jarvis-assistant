/**
 * Un réglage demandé en phrase libre, que le téléphone ne reconnaît pas seul,
 * doit devenir set_setting (ou list_settings) côté serveur — jamais « je ne
 * peux pas ».
 *
 *   scripts/essayer-consigne.sh reglages
 *
 * Les tournures directes (« règle ta vitesse de réponse sur rapide », « réponds
 * plus vite », « qu'est-ce que j'ai paramétré ? ») sont prises sur le TÉLÉPHONE
 * (src/lib/reglagesVoix.ts) et n'arrivent jamais ici. Ce fichier couvre le
 * reste : ses mots quand ils s'écartent du vocabulaire fermé.
 */
import { CONSIGNES, VOICE_ACTION_TOOL, normaliserAction } from "./voice-command/consignes-extraites.ts"
import { appelerModele } from "./_shared/modele.ts"

async function demander(phrase: string) {
  const { args, echec } = await appelerModele({
    role: "commande",
    systeme: `${CONSIGNES}\n\nDate du jour : 2026-09-23. Heure locale actuelle (Israël) : mercredi 23 septembre 2026 à 18:00.\nTâches existantes de l'utilisateur : [].`,
    texte: phrase,
    outil: VOICE_ACTION_TOOL,
    maxTokens: 4096,
    essai: true,
  })
  if (echec || !args) return { echec: echec?.statut ?? "sans appel d'outil" }
  const brutes = Array.isArray(args.actions) ? args.actions : [args]
  return brutes.map((a: Record<string, unknown>) => normaliserAction(a, { idsContacts: new Set(), transcript: phrase }))
}

type Action = Record<string, unknown>
const CAS: { phrase: string; ok: (a: Action[]) => boolean; attendu: string }[] = [
  {
    phrase: "mets-toi en mode réponse rapide s'il te plaît",
    ok: (a) => a.some((x) => x.action === "set_setting" && x.setting_cle === "jarvis_dialogue_pause_ms" && x.setting_valeur === "rapide"),
    attendu: "set_setting jarvis_dialogue_pause_ms = rapide",
  },
  {
    phrase: "je voudrais que tu parles un peu moins vite",
    ok: (a) => a.some((x) => x.action === "set_setting" && x.setting_cle === "jarvis_voice_rate" && x.setting_valeur === "lente"),
    attendu: "set_setting jarvis_voice_rate = lente",
  },
  {
    phrase: "tu peux me dire tous mes réglages actuels",
    ok: (a) => a.some((x) => x.action === "list_settings"),
    attendu: "list_settings",
  },
  {
    phrase: "après m'avoir répondu, arrête de m'écouter",
    ok: (a) => a.some((x) => x.action === "set_setting" && x.setting_cle === "jarvis_dialogue_suite_ms" && x.setting_valeur === "coupe"),
    attendu: "set_setting jarvis_dialogue_suite_ms = coupe",
  },
  // L'inverse : une musique n'est pas un réglage.
  {
    phrase: "mets de la musique de Booba sur YouTube",
    ok: (a) => !a.some((x) => x.action === "set_setting" || x.action === "list_settings"),
    attendu: "aucun réglage touché",
  },
]

const seulement = Deno.args[0]
let echecs = 0
for (const c of CAS) {
  if (seulement && !c.phrase.includes(seulement)) continue
  const r = await demander(c.phrase)
  const ok = Array.isArray(r) && c.ok(r)
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} « ${c.phrase} » → ${c.attendu}\n      ${JSON.stringify(r).slice(0, 220)}`)
  await new Promise((res) => setTimeout(res, 4000))
}
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
Deno.exit(echecs === 0 ? 0 : 1)
