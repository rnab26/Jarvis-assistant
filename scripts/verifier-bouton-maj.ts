/**
 * Vérifie qu'on ne propose JAMAIS une mise à jour quand il n'y en a pas.
 *
 *   node --experimental-strip-types scripts/verifier-bouton-maj.ts
 *
 * D'OÙ ÇA VIENT, 15 sept. 2026, capture à l'appui : il entoure à l'écran un
 * bouton NOIR « Mettre à jour » collé au badge « À jour ». Ses mots : « ya
 * confusion car ca propose de mettre la version a jour alors que cest deja a
 * jour ». Vérifié côté GitHub au même instant, pas supposé : la release
 * `latest-debug` était `build: 281 / commit: 26e43f5`, exactement ce qu'il
 * faisait tourner — il n'y avait RIEN à installer. Il a appuyé, c'est la
 * seule chose raisonnable devant un bouton plein, et téléchargé 11,1 Mo
 * d'APK sur sa 4G pour rien.
 *
 * LA MOITIÉ DE CES CONTRÔLES VÉRIFIE UN SILENCE : pas d'action principale
 * quand rien n'attend, et rien du tout tant qu'on ne sait pas.
 */
import { readFileSync } from "node:fs"
import { boutonMaj, pourquoiCeBouton, type EtatVersion } from "../src/lib/boutonMaj.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const natif = (etat: EtatVersion, majRapidePossible = false) =>
  boutonMaj({ natif: true, etat, majRapidePossible })

// ── LE CAS DE SA CAPTURE ─────────────────────────────────────────────────
{
  const b = natif("up-to-date")
  verifier(
    "à jour : AUCUNE action principale",
    b.principal === false,
    `${b.action} / ${b.libelle} / principal=${b.principal}`,
  )
  verifier(
    "à jour : le bouton ne dit plus « Mettre à jour »",
    !/mettre à jour/i.test(b.libelle),
    b.libelle,
  )
  verifier(
    "à jour : il dit ce qu'il FAIT — réinstaller",
    /réinstaller/i.test(b.libelle),
    b.libelle,
  )
  verifier(
    "à jour : et l'écran explique pourquoi ce bouton existe encore",
    /déjà la dernière version/i.test(pourquoiCeBouton(b.action, "up-to-date") ?? ""),
    String(pourquoiCeBouton(b.action, "up-to-date")),
  )
}

// ── Tant qu'on ne sait pas, on ne propose rien ──────────────────────────
{
  const b = natif("checking")
  verifier(
    "pendant la vérification : aucune action proposée",
    b.action === "attendre" && b.principal === false,
    `${b.action} / principal=${b.principal}`,
  )
}
{
  const b = natif("unknown")
  verifier(
    "GitHub injoignable : pas d'action principale non plus",
    b.principal === false,
    "proposer 11 Mo au hasard, c'est deviner — et on devinerait une réinstallation",
  )
  verifier(
    "et on DIT qu'on n'a pas pu comparer",
    /n'ai pas pu joindre/i.test(pourquoiCeBouton(b.action, "unknown") ?? ""),
    String(pourquoiCeBouton(b.action, "unknown")),
  )
}

// ── Et quand une version attend VRAIMENT, rien n'est affaibli ───────────
{
  const rapide = natif("update-available", true)
  verifier(
    "une version attend et la maj rapide suffit : bouton plein",
    rapide.action === "maj_rapide" && rapide.principal === true,
    `${rapide.action} / principal=${rapide.principal}`,
  )
  const apk = natif("update-available", false)
  verifier(
    "une version attend et touche le natif : bouton plein aussi",
    apk.action === "installer_apk" && apk.principal === true,
    `${apk.action} / principal=${apk.principal}`,
  )
  verifier(
    "et là, on n'ajoute PAS d'explication : le bouton est l'action attendue",
    pourquoiCeBouton(apk.action, "update-available") === null,
    "une phrase sous un bouton évident n'est que du bruit",
  )
}

// ── Hors de l'app Android ───────────────────────────────────────────────
{
  const web = boutonMaj({ natif: false, etat: "up-to-date", majRapidePossible: false })
  verifier(
    "sur le site à jour : le lien APK reste, mais discret",
    web.action === "telecharger_web" && web.principal === false,
    `${web.action} / principal=${web.principal}`,
  )
}

// ── Le téléchargement figé, côté natif ──────────────────────────────────
//
// Sa capture précédente du même jour : « 1% · 0.1 / 11.1 Mo », figé, bouton
// grisé. Le garde-fou du 6 sept. testait `recus <= 0` — 0,1 Mo était déjà
// arrivé, il ne pouvait donc PAS se déclencher, et rien ne sortait avant les
// dix minutes du délai maximum. Faute de SDK Android ici, on lit le code, et
// on vise l'APPEL et la CONDITION, jamais la présence du mot.
{
  const java = readFileSync(
    new URL("../android/app/src/main/java/com/raphael/jarvis/ApkDownloaderPlugin.java", import.meta.url),
    "utf8",
  )
  verifier(
    "le garde-fou mesure la STAGNATION, pas le niveau du compteur",
    /System\.currentTimeMillis\(\) - dernierProgresA\[0\] > DELAI_SANS_PROGRES_MS/.test(java),
    "« recus <= 0 » ne peut rien attraper une fois le premier octet arrivé",
  )
  verifier(
    "le repère de progrès est remis à jour dès que le compteur avance",
    /if \(recus > dernierNiveau\[0\]\) \{[\s\S]{0,160}?dernierProgresA\[0\] = System\.currentTimeMillis\(\)/.test(java),
  )
  verifier(
    "une PAUSE d'Android n'est pas prise pour un blocage",
    /status != DownloadManager\.STATUS_PAUSED\s*\n?\s*&& System\.currentTimeMillis\(\) - dernierProgresA\[0\]/.test(java),
    "en pause, Android annonce sa raison et reprendra : télécharger par-dessus doublerait tout",
  )
  verifier(
    "et le repli nomme le cas, pour qu'on sache lequel des deux s'est produit",
    /recus <= 0 \? "aucun_octet" : "fige_a_" \+ recus/.test(java),
  )

  // ── Arrêter ──
  verifier(
    "le téléchargement peut être ARRÊTÉ",
    /public void annuler\(PluginCall call\)\s*\{\s*annulationDemandee = true;/.test(java),
  )
  verifier(
    "le drapeau est relu DANS la boucle de suivi",
    /if \(annulationDemandee\) \{[\s\S]{0,260}?downloadManager\.remove\(downloadId\)/.test(java),
  )
  verifier(
    "et aussi dans le repli, qui tourne sur son propre fil",
    /while \(\(lus = entree\.read\(tampon\)\) != -1\) \{\s*\n\s*if \(annulationDemandee\)/.test(java),
    "sans ça, « Arrêter » ne ferait rien sur le chemin qui sert justement quand l'autre a échoué",
  )
  verifier(
    "le drapeau est remis à faux à CHAQUE départ",
    /annulationDemandee = false;/.test(java),
    "sinon un arrêt demandé la fois d'avant tuerait le téléchargement suivant avant qu'il commence",
  )
}

// ── L'écran s'en sert vraiment ──────────────────────────────────────────
{
  const ecran = readFileSync(
    new URL("../src/components/settings/MettreAJour.tsx", import.meta.url),
    "utf8",
  )
  verifier(
    "l'écran passe par la décision plutôt que de refaire la sienne",
    /const bouton = boutonMaj\(\{ natif: isNative, etat: status, majRapidePossible \}\)/.test(ecran),
  )
  verifier(
    "le bouton APK suit « principal » pour son apparence",
    /variant=\{bouton\.principal \? "default" : "outline"\}/.test(ecran),
    "c'est toute la correction : plein quand ça attend, discret sinon",
  )
  verifier(
    "le bouton Arrêter APPELLE vraiment l'annulation",
    /ApkDownloader\.annuler\?\.\(\)/.test(ecran),
  )
  verifier(
    "les trois versions se déplient dès qu'elles ne concordent pas",
    /open=\{status === "update-available" \|\| versionsDiscordantes\}/.test(ecran),
    "« pourquoi il me redemande une mise à jour » ne se répond qu'en voyant les trois nombres",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
