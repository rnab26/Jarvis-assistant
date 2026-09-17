/**
 * Vérifie la résolution d'une cible de navigation vers une section de
 * Paramètres (chantier `aac9a0dd`, « emmène-moi dans les notifications »).
 *
 *   node --experimental-strip-types scripts/verifier-navigation-parametres.ts
 *
 * Aucun réseau. Ce que ce contrôle couvre, et ce qu'il NE couvre PAS :
 *
 * - Il couvre `resoudreCibleParametres()`, la moitié « application » de ce
 *   chantier : une cible déjà propre (une clé exacte, ou un mot qui désigne
 *   sans ambiguïté une section) doit ouvrir LA bonne section, jamais une
 *   autre, et se taire plutôt que deviner quand rien ou plusieurs sections
 *   correspondent.
 * - Il ne couvre PAS la reconnaissance de la phrase parlée elle-même
 *   (« emmène-moi dans… », « va voir… ») : extraire le mot-clé d'une phrase
 *   entière est le même travail que `commandeLocale.ts` (isoler la
 *   commande du verbe qui l'introduit) et vit hors du périmètre de cette
 *   session — voir dev_log, chantier aac9a0dd.
 */
import { resoudreCibleParametres, SECTIONS_PARAMETRES } from "../src/lib/sectionsParametres.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// Une clé exacte se retrouve toujours, même si elle ressemble aussi à un
// mot ordinaire du catalogue (« app » est aussi présent dans les mots-clés
// d'autres sections).
for (const cle of Object.keys(SECTIONS_PARAMETRES)) {
  const trouve = resoudreCibleParametres(cle)
  verifier(`clé exacte « ${cle} » se retrouve`, trouve === cle, `obtenu : ${trouve}`)
}

// Un seul mot-clé net, sans ambiguïté, doit désigner la bonne section — les
// mots employés sont ceux d'une phrase réelle, débarrassés du verbe qui
// l'introduit (« emmène-moi dans les notifications » → « notifications »).
const DOIT_RESOUDRE: [string, string][] = [
  ["notifications", "notifications"],
  ["mémoire", "memoire"],
  ["memoire", "memoire"],
  ["waze", "apps"],
  ["whatsapp", "apps"],
  ["thème sombre", "apparence"],
  ["gmail", "comptes"],
  ["widget", "taches"],
  ["quota", "consommation"],
  ["autorisations", "autorisations"],
  ["apk", "app"],
]
for (const [cible, attendu] of DOIT_RESOUDRE) {
  const trouve = resoudreCibleParametres(cible)
  verifier(`« ${cible} » → ${attendu}`, trouve === attendu, `obtenu : ${trouve}`)
}

// La moitié qu'on oublie toujours : se taire plutôt que d'ouvrir la
// mauvaise section. Ouvrir la mauvaise section serait pire que ne rien
// ouvrir — Raphaël devrait d'abord comprendre qu'il est au mauvais endroit
// avant de pouvoir se corriger. Les trois premiers ne sont pas construits :
// mesuré sur le vrai catalogue, ces mots-là vivent réellement dans les
// mots-clés de DEUX sections à la fois.
const NE_DOIT_RIEN_RESOUDRE = [
  "notification", // "autorisations" (permission de notifier) ET "notifications"
  "google", // "voix" (moteur de reconnaissance) ET "comptes" (agenda, mail)
  "mise à jour", // "app" (l'APK) ET "autorisations" (mise à jour du système)
  "",
  "   ",
  "jarvis", // dans le vocabulaire de plusieurs sections à la fois
  "voix jarvis notifications", // deux sections à la fois, aucune ne l'emporte
  "quelque chose qui n'existe dans aucune section",
]
for (const cible of NE_DOIT_RIEN_RESOUDRE) {
  const trouve = resoudreCibleParametres(cible)
  verifier(
    `« ${cible.trim() || "(vide)"} » ne résout rien`,
    trouve === null,
    `a résolu vers « ${trouve} » — une section ouverte à tort`,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
