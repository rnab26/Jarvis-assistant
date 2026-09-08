/**
 * Vérifie l'écran « Ce que Jarvis a le droit de faire », sans téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-autorisations.ts
 *
 * Ce qui se vérifie ici est exactement ce qui peut être FAUX EN SILENCE :
 *
 * 1. Un bouton « Autoriser » là où Android n'affichera plus jamais de
 *    fenêtre. C'est le piège rencontré avec les notifications : refusée une
 *    fois, la demande ne revient pas, et le bouton ne fait plus rien sans que
 *    rien ne le dise. Une ligne bloquée doit envoyer vers les réglages.
 * 2. La position en arrière-plan demandée en même temps que la position.
 *    À partir d'Android 11, le système rejette silencieusement le LOT ENTIER :
 *    aucune fenêtre ne s'affiche et les deux reviennent refusées. Sur un
 *    téléphone, ça se lit comme « Raphaël a refusé ».
 * 3. Une ligne du catalogue que le plugin Android ne connaît pas : elle
 *    afficherait « Pas encore » pour toujours, et son bouton n'aurait aucun
 *    effet.
 *
 * Aucun des trois ne se voit dans un typecheck ni depuis cette machine, qui
 * n'a pas de SDK Android.
 */
import { readFileSync } from "node:fs"
import {
  AUTORISATIONS,
  actionDeLaLigne,
  autorisationParCle,
  clesADemander,
  gestesQuiRestent,
  libelleEtat,
  resumeAutorisations,
  type CleAutorisation,
  type EtatAutorisation,
} from "../src/lib/autorisationsTelephone.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const etat = (
  cle: CleAutorisation,
  accordee: boolean,
  bloquee = false,
  connue = true,
): EtatAutorisation => ({ cle, accordee, bloquee, connue })

// ---------------------------------------------------------------- catalogue

const cles = AUTORISATIONS.map((a) => a.cle)
verifier(
  "aucune autorisation déclarée deux fois",
  new Set(cles).size === cles.length,
  cles.join(", "),
)

for (const a of AUTORISATIONS) {
  verifier(
    `${a.cle} : dit ce que ça permet et ce qu'on perd sans`,
    a.titre.length > 0 && a.usage.length > 0 && a.sansElle.length > 0 && a.technique.length > 0,
    "une ligne qui n'annonce que le nom Android ne permet pas de décider",
  )
  if (a.dependDe) {
    verifier(
      `${a.cle} : dépend d'une autorisation qui existe et vient avant`,
      cles.indexOf(a.dependDe) >= 0 && cles.indexOf(a.dependDe) < cles.indexOf(a.cle),
      "affichée avant celle dont elle dépend, elle propose un bouton qui ne peut pas aboutir",
    )
  }
}

verifier(
  "le micro et les notifications sont proposés d'emblée",
  autorisationParCle("micro")?.essentielle === true &&
    autorisationParCle("notifications")?.essentielle === true,
  "sans micro Jarvis n'entend rien, sans notification rien ne sonne",
)

// ------------------------------------------------- ce qu'on demande vraiment

const rien: EtatAutorisation[] = AUTORISATIONS.map((a) => etat(a.cle, false))

verifier(
  "un téléphone neuf : on demande toutes les autorisations demandables",
  clesADemander(rien).join(",") === "micro,notifications,contacts,telephone,position",
  clesADemander(rien).join(",") || "(rien)",
)

verifier(
  "la position en arrière-plan n'est JAMAIS demandée avec la position",
  !clesADemander(rien).includes("position_fond"),
  "Android 11 rejette le lot entier, sans afficher la moindre fenêtre",
)

const positionOk = rien.map((e) => (e.cle === "position" ? etat("position", true) : e))
verifier(
  "la position accordée, l'arrière-plan devient demandable",
  clesADemander(positionOk).includes("position_fond"),
  clesADemander(positionOk).join(","),
)

verifier(
  "les accès spéciaux ne partent jamais dans une demande",
  !clesADemander(rien).includes("installer_maj"),
  "aucune fenêtre Android ne les accorde : le bouton ne ferait rien",
)

const microBloque = rien.map((e) => (e.cle === "micro" ? etat("micro", false, true) : e))
verifier(
  "une autorisation refusée pour de bon n'est plus redemandée",
  !clesADemander(microBloque).includes("micro"),
  "redemander n'affiche plus rien : le bouton doit envoyer vers les réglages",
)

const toutAccorde: EtatAutorisation[] = AUTORISATIONS.map((a) => etat(a.cle, true))
verifier(
  "tout accordé : plus rien à demander",
  clesADemander(toutAccorde).length === 0,
  clesADemander(toutAccorde).join(","),
)

verifier(
  "seulement les essentielles, quand on le demande",
  clesADemander(rien, true).join(",") === "micro,notifications,contacts,telephone",
  clesADemander(rien, true).join(","),
)

// -------------------------------------------------------- ce que la ligne dit

const decl = (cle: CleAutorisation) => autorisationParCle(cle)!

verifier(
  "accordée : aucun bouton",
  actionDeLaLigne(decl("micro"), etat("micro", true), toutAccorde) === "aucune",
)
verifier(
  "jamais demandée : le bouton Autoriser",
  actionDeLaLigne(decl("micro"), etat("micro", false), rien) === "demander",
)
verifier(
  "refusée pour de bon : les réglages d'Android, pas un bouton mort",
  actionDeLaLigne(decl("micro"), etat("micro", false, true), microBloque) === "reglages",
)
verifier(
  "accès spécial : les réglages d'Android",
  actionDeLaLigne(decl("installer_maj"), etat("installer_maj", false), rien) === "reglages",
)
verifier(
  "état illisible : les réglages, pas un refus annoncé à tort",
  actionDeLaLigne(decl("installer_maj"), etat("installer_maj", false, false, false), rien) ===
    "reglages" && libelleEtat(etat("installer_maj", false, false, false)) === "Non vérifiable",
)
verifier(
  "l'arrière-plan attend la position, et le dit",
  actionDeLaLigne(decl("position_fond"), etat("position_fond", false), rien) === "attend_parent",
)
verifier(
  "les mots d'état se distinguent",
  libelleEtat(etat("micro", true)) === "Accordée" &&
    libelleEtat(etat("micro", false, true)) === "Refusée" &&
    libelleEtat(etat("micro", false)) === "Pas encore",
  "« refusée » et « pas encore » n'appellent pas le même geste",
)

const resume = resumeAutorisations(positionOk)
verifier(
  "le compte affiché correspond à l'état réel",
  resume.total === AUTORISATIONS.length && resume.accordees === 1 && resume.manquantesEssentielles === 4,
  JSON.stringify(resume),
)

// ------------------------------------------- le catalogue et le code Android

const java = readFileSync("android/app/src/main/java/com/raphael/jarvis/AutorisationsPlugin.java", "utf8")

for (const a of AUTORISATIONS) {
  verifier(
    `${a.cle} : connue du plugin Android`,
    java.includes(`"${a.cle}"`),
    "une ligne que le plugin ne connaît pas affiche « Pas encore » pour toujours",
  )
}

const demander = java.slice(
  java.indexOf("public void demander(PluginCall call)"),
  java.indexOf("@PermissionCallback"),
)
verifier(
  "le plugin sort la position en arrière-plan de la demande groupée",
  /if \("position_fond"\.equals\(cle\)\) continue;/.test(demander),
  "demandée dans le même lot que la position, Android rejette les deux en silence",
)
verifier(
  "le plugin ne demande POST_NOTIFICATIONS qu'à partir d'Android 13",
  demander.includes("VERSION_CODES.TIRAMISU"),
  "avant Android 13 la demande revient refusée aussitôt, et la ligne se croit bloquée",
)
verifier(
  "le plugin est enregistré dans MainActivity",
  readFileSync("android/app/src/main/java/com/raphael/jarvis/MainActivity.java", "utf8").includes(
    "registerPlugin(AutorisationsPlugin.class)",
  ),
  "sans enregistrement, chaque appel échoue et l'écran se croit hors de l'app",
)

// ── UN BOUTON « OUVRIR LES RÉGLAGES » NE DOIT JAMAIS ÊTRE MUET ──────────
//
// Raphaël, 8 sept. 2026, capture à l'appui : le bouton de la ligne « Ne pas
// l'endormir en arrière-plan », entouré au feutre rouge, et un mot — « pas
// fonctionnelle ».
//
// LA CAUSE, ET ELLE ÉTAIT DANS LES TROIS PLUGINS À LA FOIS : un pré-contrôle
// `intent.resolveActivity(pm) == null` devant chaque `startActivity`.
// `resolveActivity` est soumis au filtrage de visibilité des paquets depuis
// Android 11 — l'app vise targetSdk 36, et le manifeste ne déclare AUCUNE
// action de réglages dans `<queries>`. Il peut donc rendre null pour un écran
// qui existe, et on renonçait sans essayer. Le repli, la fiche de
// l'application, repassait par le même pré-contrôle : bouton parfaitement
// muet.
//
// La règle d'Android depuis l'API 30 est d'essayer et d'attraper. Ce contrôle
// interdit le retour du pré-contrôle, dans les trois fichiers.
const PLUGINS_QUI_OUVRENT = [
  "AutorisationsPlugin.java",
  "BullePlugin.java",
  "ReglagesSystemePlugin.java",
]
for (const nom of PLUGINS_QUI_OUVRENT) {
  const source = readFileSync(`android/app/src/main/java/com/raphael/jarvis/${nom}`, "utf8")
  // On vise l'APPEL, pas le mot : `resolveActivity` est cité dans les
  // commentaires qui expliquent justement pourquoi on ne s'en sert plus.
  // Chercher le mot resterait vert le jour où quelqu'un remet le pré-contrôle
  // — c'est le piège déjà payé par le sélecteur Playwright et par
  // `Filesystem.mkdir`.
  const appels = source.match(/\.resolveActivity\s*\(/g) ?? []
  verifier(
    `${nom} n'interroge plus Android avant d'ouvrir un écran`,
    appels.length === 0,
    `${appels.length} appel(s) à resolveActivity — filtré depuis Android 11, il rend null pour un écran qui existe`,
  )
  verifier(
    `${nom} passe par EcransReglages`,
    source.includes("EcransReglages.ouvrirLePremierQuiRepond("),
    "sinon le try/catch qui remplace le pré-contrôle n'existe pas",
  )
}

// La batterie a besoin d'un repli QUI CONTIENT LE RÉGLAGE. La fiche de
// l'application ne l'a pas sur toutes les surcouches : entre la fenêtre
// directe et elle, il faut la liste système des optimisations.
{
  const source = readFileSync(
    "android/app/src/main/java/com/raphael/jarvis/AutorisationsPlugin.java",
    "utf8",
  )
  verifier(
    "la batterie a un repli vers la liste système, pas seulement la fiche de l'app",
    source.includes("ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS"),
    "l'action directe est protégée par une permission et plusieurs surcouches la refusent ; sans ce repli il n'atterrit nulle part d'utile",
  )
}

// ── ET IL SAIT CE QU'IL LUI RESTE À TOUCHER ─────────────────────────────
//
// Sa demande d'origine (5 sept.) était de ne plus chercher lui-même dans les
// réglages d'Android. Quand on ne peut pas l'emmener jusqu'au bout — et pour
// la batterie, souvent, on ne peut pas — on lui dit au moins où il atterrit.
verifier(
  "la fenêtre directe ne dit rien de plus : elle se suffit",
  gestesQuiRestent("batterie", "fenetre") === null,
  "un texte de trop après un geste qui a marché se lit comme du bruit",
)
verifier(
  "la liste système dit quoi y chercher",
  /Non optimisé/.test(gestesQuiRestent("batterie", "liste") ?? ""),
  "une liste de toutes les applications ouverte sans un mot, c'est exactement ce qu'il ne veut plus",
)
verifier(
  "la fiche de l'app dit quelle rubrique ouvrir",
  /Batterie/.test(gestesQuiRestent("batterie", "fiche") ?? ""),
)
verifier(
  "une APK trop ancienne, qui ne dit pas où elle a ouvert, ne fait rien inventer",
  gestesQuiRestent("batterie", undefined) === null,
  "une marche à suivre qui ne correspond à rien de ce qu'il a sous les yeux est pire que le silence",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
