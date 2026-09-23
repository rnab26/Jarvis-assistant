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
  ajuster,
  commandeReglage,
  listeReglagesVoix,
  phraseEtat,
  phraseTousLesReglages,
  REGLAGES_VOIX,
  trouverOptionReglageVoix,
  trouverReglageVoix,
  valeurActuelle,
} from "../src/lib/reglagesVoix.ts"
import { sansAccents } from "../src/lib/dateOrale.ts"
import { interpreterLocalement } from "../src/lib/commandeLocale.ts"
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
  const cas = (nom: string) => {
    const debut = actions.indexOf(`case "${nom}"`)
    return actions.slice(debut, actions.indexOf("case ", debut + 20))
  }
  // L'écriture vit dans UNE fonction, partagée par « mets X » et « plus vite » :
  // deux copies finiraient par ne plus prévenir les mêmes lecteurs.
  const debutAppliquer = actions.indexOf("function appliquerReglage(")
  const appliquer = actions.slice(debutAppliquer, actions.indexOf("\n}\n", debutAppliquer))
  verifier(
    "appliquerReglage fait relire écrans et hooks (REGLAGES_RESTAURES) après avoir écrit",
    appliquer.indexOf("ecrireReglage(") !== -1 &&
      /dispatchEvent\(new Event\(REGLAGES_RESTAURES\)\)/.test(appliquer.slice(appliquer.indexOf("ecrireReglage("))),
  )
  verifier(
    "set_setting ET adjust_setting passent par appliquerReglage, jamais par une écriture à part",
    ["set_setting", "adjust_setting"].every((n) => /appliquerReglage\(/.test(cas(n)) && !/ecrireReglage\(/.test(cas(n))),
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
  jarvis_dialogue_pause_ms: "lu à chaque tour d'écoute (useSpeechRecognition → readDialoguePrefs)",
  jarvis_voice_rate: "lu à chaque phrase dite (parler.ts → readVoicePrefs)",
  jarvis_dialogue_suite_ms: "src/hooks/useDialogueSetting.ts",
}
for (const reglage of REGLAGES_VOIX) {
  const lecteur = RELU_PAR[reglage.cle]
  verifier(`« ${reglage.cle} » a un lecteur qui l'applique tout de suite`, Boolean(lecteur), "ajoute-le à RELU_PAR après l'avoir vérifié")
  if (lecteur?.startsWith("src/")) {
    const source = readFileSync(new URL(`../${lecteur}`, import.meta.url), "utf8")
    verifier(`   …et ${lecteur} se relit bien après restauration`, /useRelireApresRestauration\(/.test(source))
  }
}

// ── Sur le téléphone, sans le serveur (23 sept. 2026 au soir) ─────────────
// Ses mots : « j'aimerais pouvoir régler Jarvis à l'oral, dire “règle ta
// vitesse de réponse” […] elle n'est pas capable de me dire ce que j'ai
// paramétré ». La moitié des contrôles vérifie ce qui ne doit PAS être pris.
{
  const cmd = (p: string) => commandeReglage(sansAccents(p))
  const regle = (p: string, cle: string, valeur: string) => {
    const c = cmd(p)
    verifier(`« ${p} » → ${cle} = ${valeur}`, c?.type === "regler" && c.cle === cle && c.cleValeur === valeur, JSON.stringify(c))
  }
  regle("Règle ta vitesse de réponse sur rapide", "jarvis_dialogue_pause_ms", "rapide")
  regle("mets ta vitesse de réponse en normale", "jarvis_dialogue_pause_ms", "normal")
  regle("active le mode Live", "jarvis_mode_live", "actif")
  regle("coupe le mot-clé de réveil", "jarvis_wake_word_enabled", "inactif")
  regle("mets le thème sombre", "jarvis_theme", "sombre")
  regle("passe en mode sombre", "jarvis_theme", "sombre")
  regle("garde mes conversations trente jours", "jarvis_memoire_retention", "30")
  regle("mets le délai d'annulation à 5 secondes", "jarvis_delai_annulation", "5")
  regle("règle la vitesse de ta voix sur lente", "jarvis_voice_rate", "lente")
  const ajuste = (p: string, cle: string, sens: 1 | -1) => {
    const c = cmd(p)
    verifier(`« ${p} » → ${cle} ${sens > 0 ? "plus" : "moins"}`, c?.type === "ajuster" && c.cle === cle && c.sens === sens, JSON.stringify(c))
  }
  ajuste("réponds plus vite", "jarvis_dialogue_pause_ms", 1)
  ajuste("Réponds-moi plus rapidement", "jarvis_dialogue_pause_ms", 1)
  ajuste("attends plus longtemps avant de répondre", "jarvis_dialogue_pause_ms", -1)
  ajuste("ne me coupe pas la parole", "jarvis_dialogue_pause_ms", -1)
  ajuste("parle plus lentement", "jarvis_voice_rate", -1)
  for (const p of ["Qu'est-ce que j'ai paramétré ?", "quels sont mes réglages", "qu'est-ce que tu peux régler toi-même ?", "comment tu es réglé ?"]) {
    const c = cmd(p)
    verifier(`« ${p} » → l'état de TOUT`, c?.type === "etat" && c.cle === null, JSON.stringify(c))
  }
  const q = cmd("quelle est ta vitesse de réponse ?")
  verifier("« quelle est ta vitesse de réponse ? » → l'état de CE réglage", q?.type === "etat" && q.cle === "jarvis_dialogue_pause_ms", JSON.stringify(q))
  const sansValeur = cmd("règle ta vitesse de réponse")
  verifier("« règle ta vitesse de réponse » sans valeur : il dit où elle en est et ce qu'il peut choisir", sansValeur?.type === "etat" && sansValeur.cle === "jarvis_dialogue_pause_ms")
  for (const [p, pourquoi] of [
    ["coupe le mode live et appelle Yoni", "deux demandes : au serveur"],
    ["coupe la musique", "la musique qui joue, pas un réglage"],
    ["mets de la musique", "idem"],
    ["règle le réveil à 7h", "une alarme"],
    ["ne me coupe pas la musique", "pas la parole"],
    ["mets le thème de la fête d'anniversaire dans mes notes", "un thème de fête n'est pas le thème de l'app"],
    ["montre-moi mes réglages", "« montre-moi » ouvre l'écran, il ne se lit pas à voix haute"],
    ["active la bulle flottante", "exige un geste système, jamais à la voix"],
  ]) {
    verifier(`laisse passer « ${p} » (${pourquoi})`, cmd(p) === null, JSON.stringify(cmd(p)))
  }
  // Et c'est bien la règle LOCALE qui la prend, avant tout autre motif.
  const local = interpreterLocalement("Règle ta vitesse de réponse sur rapide", {})?.[0] as Record<string, unknown> | undefined
  verifier("la commande locale rend set_setting (aucun aller-retour serveur)", local?.action === "set_setting" && local.setting_valeur === "rapide", JSON.stringify(local))
  const plus = interpreterLocalement("réponds plus vite", {})?.[0] as Record<string, unknown> | undefined
  verifier("« réponds plus vite » → adjust_setting sur le téléphone", plus?.action === "adjust_setting" && plus.sens === 1, JSON.stringify(plus))
  const tout = interpreterLocalement("qu'est-ce que j'ai paramétré ?", {})?.[0] as Record<string, unknown> | undefined
  verifier("« qu'est-ce que j'ai paramétré ? » → list_settings sur le téléphone", tout?.action === "list_settings" && !tout.setting_cle, JSON.stringify(tout))

  // La valeur ACTUELLE : une clé absente vaut le défaut de son module.
  const pause = trouverReglageVoix("jarvis_dialogue_pause_ms")!
  verifier("jamais touchée, la vitesse de réponse est « normale » (2 s, DEFAULT_PAUSE_MS)", valeurActuelle(pause, null).option?.cleValeur === "normal")
  verifier("réglée au curseur à 1,5 s, elle se dit telle quelle", valeurActuelle(pause, "1500").dit.startsWith("1,5 seconde"))
  verifier("« plus vite » depuis 2 s → rapide", ajuster(pause, null, 1)?.cleValeur === "rapide")
  verifier("« plus vite » depuis rapide → rien (au bout)", ajuster(pause, "1000", 1) === null)
  verifier("depuis 1,5 s (curseur), « plus vite » va à rapide, « moins vite » à normale — jamais à l'envers", ajuster(pause, "1500", 1)?.cleValeur === "rapide" && ajuster(pause, "1500", -1)?.cleValeur === "normal")
  verifier("la lecture d'une IA relayée : l'ABSENCE de la clé = désactivée", valeurActuelle(trouverReglageVoix("jarvis_ia_relais_lecture")!, null).option?.cleValeur === "inactif")
  verifier("une valeur inconnue retombe sur le défaut, comme ses lecteurs", valeurActuelle(trouverReglageVoix("jarvis_theme")!, "violet").option?.stocke === "system")
  const etat = phraseEtat(pause, "1000")
  verifier("dire UN réglage : sa valeur, puis ce qu'il peut choisir", etat.includes("rapide") && /posée, normale, rapide/.test(etat), etat)
  const liste = phraseTousLesReglages((c) => (c === "jarvis_mode_live" ? "1" : null), ["tes applications par défaut : Waze pour les itinéraires"])
  verifier(
    "« qu'est-ce que j'ai réglé ? » dit les VALEURS, la voix et l'écoute d'abord, et les lignes d'ailleurs",
    liste.indexOf("mode conversation Live : activé") < liste.indexOf("thème") && liste.includes("Waze pour les itinéraires") && REGLAGES_VOIX.every((r) => liste.includes(r.nom)),
    liste.slice(0, 200),
  )
  // Chaque défaut est le MÊME côté serveur : sinon Jarvis dirait une valeur au
  // micro classique et une autre en Live.
  for (const r of REGLAGES_VOIX) {
    const serveur = REGLAGES_MODIFIABLES.find((m) => m.cle === r.cle)
    const attendu = r.defaut ?? "0"
    verifier(`le défaut de ${r.cle} est le même côté serveur (branchements.ts)`, serveur?.defaut === attendu, `${serveur?.defaut} ≠ ${attendu}`)
  }
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
