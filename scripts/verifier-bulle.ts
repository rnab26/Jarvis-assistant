/**
 * Vérifie la bulle flottante, sans téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-bulle.ts
 *
 * Ce qui peut être faux en silence ici :
 *
 * 1. Un interrupteur qui affiche « Activé » au-dessus d'un écran vide.
 *    L'autorisation « afficher par-dessus les autres applications » se retire
 *    depuis Android sans que l'app en sache rien, et la bulle se range d'un
 *    appui long sans passer par Paramètres. L'état doit venir du SYSTÈME, pas
 *    du réglage.
 * 2. Un bouton « Autoriser » là où aucune fenêtre de demande n'existe : cet
 *    accès est spécial, il ne s'obtient que dans un écran de réglages.
 * 3. Le service absent du manifeste, ou sans son type de premier plan :
 *    depuis Android 14 il refuse de démarrer, et la bulle ne s'affiche jamais
 *    — sans le moindre message.
 */
import { readFileSync } from "node:fs"
import { phraseBulle, situationBulle, type EtatBulle } from "../src/lib/bulleFlottante.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const etat = (autorisee: boolean, active: boolean): EtatBulle => ({ autorisee, active })

verifier(
  "hors de l'app, la carte ne prétend rien",
  situationBulle(false, null) === "hors_app" && situationBulle(true, null) === "hors_app",
)
verifier(
  "sans autorisation, on le dit — même si le service se croyait actif",
  situationBulle(true, etat(false, true)) === "sans_autorisation",
  "l'autorisation se retire depuis Android : l'état du service ne suffit pas",
)
verifier(
  "autorisée mais rangée : c'est un troisième cas, pas « éteinte »",
  situationBulle(true, etat(true, false)) === "rangee",
)
verifier(
  "autorisée et affichée",
  situationBulle(true, etat(true, true)) === "affichee",
)

for (const s of ["hors_app", "sans_autorisation", "rangee", "affichee"] as const) {
  verifier(`« ${s} » dit quelque chose d'utile`, phraseBulle(s).length > 30, phraseBulle(s))
}
verifier(
  "sans autorisation, la phrase envoie vers les réglages d'Android",
  /réglages/i.test(phraseBulle("sans_autorisation")),
  "aucune fenêtre de demande n'existe pour cet accès : sans ça, on cherche un bouton qui n'existe pas",
)
verifier(
  "affichée, elle explique l'appui long — le seul moyen de la ranger sans l'app",
  /appui long/i.test(phraseBulle("affichee")),
)

// ------------------------------------------------------------ côté Android

const manifeste = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")
verifier(
  "l'autorisation d'affichage par-dessus est déclarée",
  manifeste.includes("android.permission.SYSTEM_ALERT_WINDOW"),
  "sans elle, canDrawOverlays reste faux quoi qu'il fasse dans les réglages",
)
verifier(
  "le service est déclaré",
  /android:name="\.BulleService"/.test(manifeste),
  "un service absent du manifeste ne démarre pas, et rien ne le dit",
)
verifier(
  "avec son type de premier plan et son sous-type",
  /android:foregroundServiceType="specialUse"/.test(manifeste) &&
    manifeste.includes("PROPERTY_SPECIAL_USE_FGS_SUBTYPE"),
  "depuis Android 14, un service de premier plan sans type refuse de démarrer",
)
verifier(
  "les permissions de service de premier plan sont déclarées",
  manifeste.includes("android.permission.FOREGROUND_SERVICE") &&
    manifeste.includes("android.permission.FOREGROUND_SERVICE_SPECIAL_USE"),
)

const service = readFileSync("android/app/src/main/java/com/raphael/jarvis/BulleService.java", "utf8")
verifier(
  "la bulle ne vole pas le clavier de l'application en dessous",
  service.includes("FLAG_NOT_FOCUSABLE"),
  "sans ce drapeau, taper un message dans une autre app devient impossible",
)
verifier(
  "sans autorisation, le service s'arrête au lieu de planter",
  service.includes("if (!peutAfficher(this))") && service.includes("stopSelf()"),
  "addView lève une exception qui tue le processus de l'app",
)
verifier(
  "la position de la bulle est retenue",
  service.includes("putInt(POS_X"),
  "la retrouver ailleurs à chaque démarrage rendrait le déplacement inutile",
)
verifier(
  "le plugin est enregistré dans MainActivity",
  readFileSync("android/app/src/main/java/com/raphael/jarvis/MainActivity.java", "utf8").includes(
    "registerPlugin(BullePlugin.class)",
  ),
)

// ── Un appui ACTIVE ou DÉSACTIVE le micro, sans fenêtre (15 sept. 2026) ──
//
// Sa décision, mot pour mot : « Moi l'utilisateur j'appuie pour activer
// jarvis ». Piste (a) retenue dans la note du chantier 468734ad : une
// activity overlay invisible qui n'héberge que la WebView pendant l'écoute,
// PAS la fenêtre d'assistance de l'appui long (AssistOverlayActivity, qui
// reste inchangée pour son propre chemin).
verifier(
  "BulleEcouteActivity existe",
  (() => {
    try {
      readFileSync("android/app/src/main/java/com/raphael/jarvis/BulleEcouteActivity.java", "utf8")
      return true
    } catch {
      return false
    }
  })(),
)
verifier(
  "BulleEcoutePlugin existe",
  (() => {
    try {
      readFileSync("android/app/src/main/java/com/raphael/jarvis/BulleEcoutePlugin.java", "utf8")
      return true
    } catch {
      return false
    }
  })(),
)
verifier(
  "ouvrirJarvis() BASCULE : un appui pendant l'écoute l'ARRÊTE au lieu d'en ouvrir une seconde",
  service.includes("BulleEcouteActivity.estActive()") && service.includes("arreterSiActive()"),
  "sans ça, un second appui pendant que ça écoute empilerait une deuxième fenêtre invisible",
)
verifier(
  "et l'ouverture vise BulleEcouteActivity, pas la fenêtre d'assistance de l'appui long",
  /new Intent\(this, BulleEcouteActivity\.class\)/.test(service),
  "AssistOverlayActivity reste le chemin de l'appui long — les deux chemins ont des décisions différentes",
)
verifier(
  "la bulle montre qu'elle écoute (son icône change)",
  service.includes("static void setEnEcoute") && service.includes("setColorFilter"),
  "aucune fenêtre ne s'ouvrant, c'est la SEULE façon de le voir",
)

const manifesteBulle = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")
verifier(
  "BulleEcouteActivity est déclarée dans le manifeste",
  /android:name="\.BulleEcouteActivity"/.test(manifesteBulle),
)
verifier(
  "et elle N'EST PAS exportée : rien d'extérieur ne doit pouvoir l'ouvrir",
  new RegExp(
    'android:name="\\.BulleEcouteActivity"[\\s\\S]{0,300}?android:exported="false"',
  ).test(manifesteBulle),
  "elle n'est lancée que par notre propre BulleService, jamais par un intent externe",
)

const activiteEcoute = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/BulleEcouteActivity.java",
  "utf8",
)
verifier(
  "elle démarre l'écoute au montage, même mécanisme que le widget",
  activiteEcoute.includes("JarvisWidgetPlugin.demarrerEcoute = true"),
)
verifier(
  "elle prévient la bulle en s'ouvrant ET en se refermant",
  /onCreate[\s\S]*setEnEcoute\(true\)/.test(activiteEcoute) &&
    /onDestroy[\s\S]*setEnEcoute\(false\)/.test(activiteEcoute),
  "sinon l'icône resterait « en écoute » après la fin de l'échange, ou ne changerait jamais",
)
// Chantier efe7e44c, 17 sept. 2026 : la première version posait 2 dip
// (quelques pixels réels), jamais essayée sur un vrai téléphone — un WebView
// créé dans une surface aussi petite est un cas limite connu (rendu qui
// échoue selon l'appareil). L'invisibilité vient de la classe CSS `sr-only`
// posée par OverlayMicContent, PAS de la taille de la fenêtre Android :
// rien n'empêche de lui laisser une taille ordinaire.
verifier(
  "la fenêtre invisible a une taille de WebView ordinaire, pas quelques pixels",
  (() => {
    const m = activiteEcoute.match(/int taille = Math\.round\((\d+) \* metrics\.density\)/)
    return m !== null && Number(m[1]) >= 40
  })(),
  "un WebView de 2 dip n'a jamais été essayé sur un vrai téléphone ; l'invisibilité ne dépend pas de sa taille",
)
verifier(
  "elle enregistre EtatLivePlugin, comme AssistOverlayActivity",
  /registerPlugin\(EtatLivePlugin\.class\)/.test(activiteEcoute),
  "sans lui, la veille de la bulle ne sait jamais qu'une Live tourne dans l'autre fenêtre (chantier 2a5b7802)",
)

const bridgeSrc = readFileSync("src/lib/bulleEcoutePlugin.ts", "utf8")
verifier(
  "le pont JS déclare le bon nom de plugin",
  /registerPlugin<BulleEcoutePlugin>\("BulleEcoute"\)/.test(bridgeSrc),
  "un nom différent du @CapacitorPlugin(name=...) côté Java et l'appel échoue toujours",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
