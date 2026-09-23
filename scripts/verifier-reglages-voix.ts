/**
 * Les réglages que Jarvis peut lire ET changer lui-même (chantier f7137b0c).
 *
 *   node --experimental-strip-types scripts/verifier-reglages-voix.ts
 *
 * Trois choses peuvent diverger en silence, et c'est ce qui est vérifié ici :
 * la décision pure (src/lib/reglagesVoix.ts) fait ce qu'elle annonce, elle
 * reste alignée avec ce que `_shared/branchements.ts` sait LIRE (même liste
 * de clés, sinon Jarvis pourrait changer un réglage sans jamais dire sa
 * valeur actuelle, ou l'inverse), et avec ce que le schéma envoyé au modèle
 * (`supabase/functions/voice-command/index.ts`) connaît vraiment — sans quoi
 * une clé ajoutée d'un côté resterait invisible du modèle, en silence.
 */
import { readFileSync } from "node:fs"
import {
  listeReglagesVoix,
  REGLAGES_VOIX,
  trouverOptionReglageVoix,
  trouverReglageVoix,
} from "../src/lib/reglagesVoix.ts"
import { REGLAGES_MODIFIABLES } from "../supabase/functions/_shared/branchements.ts"
import { CLES_REGLAGES } from "../src/lib/reglages.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── La décision pure ────────────────────────────────────────────────────────

verifier(
  "chaque réglage voix a au moins deux options (sinon rien à choisir)",
  REGLAGES_VOIX.every((r) => r.options.length >= 2),
)

verifier(
  "aucune valeur stockée n'est dupliquée dans un même réglage",
  REGLAGES_VOIX.every((r) => new Set(r.options.map((o) => o.stocke)).size === r.options.length),
)

verifier(
  "trouver un réglage connu le rend",
  trouverReglageVoix("jarvis_theme")?.nom === "le thème de l'application",
)
verifier("un réglage inconnu ne rend rien", trouverReglageVoix("jarvis_n_importe_quoi") === undefined)

verifier(
  "activer le mot-clé de réveil stocke bien « 1 »",
  trouverOptionReglageVoix("jarvis_wake_word_enabled", "actif")?.stocke === "1",
)
verifier(
  "le désactiver stocke bien « 0 », pas null ni « false »",
  trouverOptionReglageVoix("jarvis_wake_word_enabled", "inactif")?.stocke === "0",
)
verifier(
  "le thème sombre stocke « dark », comme le lit next-themes",
  trouverOptionReglageVoix("jarvis_theme", "sombre")?.stocke === "dark",
)
verifier(
  "la mémoire « sans limite » stocke « illimite », ce que lit retention_jours() en SQL",
  trouverOptionReglageVoix("jarvis_memoire_retention", "illimite")?.stocke === "illimite",
)
verifier(
  "le délai « immédiat » stocke 0 en millisecondes, pas une chaîne vide",
  trouverOptionReglageVoix("jarvis_delai_annulation", "immediat")?.stocke === "0",
)
verifier(
  "5 secondes stocke bien 5000, l'unité de DELAIS_ANNULATION",
  trouverOptionReglageVoix("jarvis_delai_annulation", "5")?.stocke === "5000",
)
verifier(
  "le moteur de langue et les sessions autonomes stockent « true »/« false », pas « 1 »/« 0 »",
  trouverOptionReglageVoix("jarvis_moteur_auto", "actif")?.stocke === "true" &&
    trouverOptionReglageVoix("jarvis_sessions_autonomes", "inactif")?.stocke === "false",
)
verifier(
  "désactiver la lecture d'une IA relayée RETIRE la clé (null), elle ne la met pas à « 0 »",
  trouverOptionReglageVoix("jarvis_ia_relais_lecture", "inactif")?.stocke === null,
)

verifier(
  "une option qui n'existe pas pour ce réglage ne rend rien",
  trouverOptionReglageVoix("jarvis_theme", "violet") === undefined,
)
verifier(
  "et la même cleValeur pour un AUTRE réglage n'est pas confondue",
  trouverOptionReglageVoix("jarvis_delai_annulation", "actif") === undefined,
)

verifier(
  "la liste parlée cite bien tous les réglages",
  REGLAGES_VOIX.every((r) => listeReglagesVoix().includes(r.nom)),
)

// ── Alignement avec ce qui existe ailleurs ──────────────────────────────────

const clesVoix = REGLAGES_VOIX.map((r) => r.cle).sort()

verifier(
  "chaque réglage voix est bien déclaré dans src/lib/reglages.ts (sinon il ne survivrait pas à une réinstallation)",
  clesVoix.every((c) => CLES_REGLAGES.includes(c)),
  clesVoix.filter((c) => !CLES_REGLAGES.includes(c)).join(", "),
)

const clesLisibles = REGLAGES_MODIFIABLES.map((r) => r.cle).sort()
verifier(
  "la liste qu'on sait CHANGER (reglagesVoix.ts) est exactement celle qu'on sait LIRE (branchements.ts)",
  JSON.stringify(clesVoix) === JSON.stringify(clesLisibles),
  `voix seulement : ${clesVoix.filter((c) => !clesLisibles.includes(c)).join(", ") || "aucune"} — branchements seulement : ${clesLisibles.filter((c) => !clesVoix.includes(c)).join(", ") || "aucune"}`,
)

// Contrôle textuel, plus faible que les précédents mais réel : il lit le
// VRAI fichier envoyé au modèle, pas une copie recopiée ici. Une clé ou une
// valeur oubliée d'un côté resterait invisible du modèle, en silence — comme
// pour toute consigne de ce projet qui vit dans plusieurs fichiers.
const indexTs = readFileSync(
  new URL("../supabase/functions/voice-command/index.ts", import.meta.url),
  "utf8",
)
for (const reglage of REGLAGES_VOIX) {
  verifier(`le schéma envoyé au modèle connaît « ${reglage.cle} »`, indexTs.includes(reglage.cle))
  for (const option of reglage.options) {
    verifier(
      `… et sa valeur « ${option.cleValeur}` +
        ` » (${reglage.cle})`,
      indexTs.includes(option.cleValeur),
    )
  }
}

// ── Ça s'applique TOUT DE SUITE (chantier 8e1da88b, 23 sept. 2026) ─────────
// `ecrireReglage` ne prévient que la sauvegarde en base : sans l'événement de
// relecture, « mets le thème sombre » écrivait la valeur et l'écran restait
// clair jusqu'au redémarrage. Contrôle qui LIT le code, et vise l'appel dans
// le cas set_setting, pas la simple présence du mot dans le fichier.
{
  const actions = readFileSync(new URL("../src/lib/voiceActions.ts", import.meta.url), "utf8")
  const debut = actions.indexOf('case "set_setting"')
  const cas = actions.slice(debut, actions.indexOf("case ", debut + 20))
  verifier(
    "set_setting fait relire écrans et hooks (REGLAGES_RESTAURES) après avoir écrit",
    cas.indexOf("ecrireReglage(") !== -1 &&
      /dispatchEvent\(new Event\(REGLAGES_RESTAURES\)\)/.test(cas.slice(cas.indexOf("ecrireReglage("))),
  )
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
  verifier(
    "le thème se relit à la RACINE de l'app, pas seulement quand Paramètres est ouvert",
    /<ThemeEnDirect \/>/.test(app) && app.indexOf("<ThemeEnDirect />") > app.indexOf("<ThemeProvider"),
  )
  const carte = readFileSync(new URL("../src/components/settings/Theme.tsx", import.meta.url), "utf8")
  verifier(
    "…et une seule fois : la carte Thème n'en garde pas de copie",
    !/useRelireApresRestauration\(/.test(carte),
  )
}

// Chaque nouveau réglage vocal doit être RELU par quelqu'un après
// l'événement, sinon le dire ne change rien avant un redémarrage. Les
// lecteurs connus, relevés le 23 sept. — un réglage ajouté sans lecteur ici
// fait rougir ce contrôle, c'est voulu : prouve d'abord qu'il s'applique.
const RELU_PAR: Record<string, string> = {
  jarvis_wake_word_enabled: "src/hooks/useWakeWordSetting.ts",
  jarvis_geofence_enabled: "écrit par le hook lui-même (setGeofenceEnabled)",
  jarvis_theme: "src/components/ThemeEnDirect.tsx",
  jarvis_memoire_retention: "lu en base par purger_echanges",
  jarvis_delai_annulation: "lu à chaque action (actionsTelephoneFenetre)",
  jarvis_maj_auto: "lu au démarrage de la vérification de mise à jour",
  jarvis_moteur_auto: "lu en base par moteur-veille",
  jarvis_sessions_autonomes: "lu en base par etat_pour_passe_autonome",
  jarvis_ia_relais_lecture: "lu à chaque réponse d'IA (relaisIA.ts)",
  jarvis_voice_confirmer_resultat: "src/hooks/useVoiceSetting.ts",
  jarvis_mode_live: "src/components/voice/MicButton.tsx",
  jarvis_live_cloture_actif: "lu à l'ouverture de chaque session Live (sessionLive.ts)",
  jarvis_cockpit_simplifie: "src/pages/CockpitPage.tsx",
  jarvis_cockpit_fenetre: "src/components/cockpit/OuJenSuis.tsx",
}
for (const reglage of REGLAGES_VOIX) {
  const lecteur = RELU_PAR[reglage.cle]
  verifier(`« ${reglage.cle} » a un lecteur qui l'applique tout de suite`, Boolean(lecteur), "ajoute-le à RELU_PAR après l'avoir vérifié")
  if (lecteur?.startsWith("src/")) {
    const source = readFileSync(new URL(`../${lecteur}`, import.meta.url), "utf8")
    verifier(`   …et ${lecteur} se relit bien après restauration`, /useRelireApresRestauration\(/.test(source))
  }
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
