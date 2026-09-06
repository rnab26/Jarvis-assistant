/**
 * Vérifie le téléchargement de l'APK, sans téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-telechargement-apk.ts
 *
 * POURQUOI CE CONTRÔLE LIT DU CODE plutôt que d'exécuter quoi que ce soit :
 * il n'y a pas de SDK Android ici, et le défaut vit dans un service système
 * d'Android qu'on ne peut ni installer ni désactiver depuis cet
 * environnement. Ce qu'on PEUT garder, c'est qu'aucun chemin ne redevienne
 * muet — c'est le vrai défaut du 6 sept. 2026, pas le téléchargement lui-même.
 *
 * CE QU'IL S'EST PASSÉ, et qu'on ne veut plus jamais : « Téléchargement… », la
 * barre vide, « 0.0 Mo reçus » indéfiniment. Dix minutes d'attente, aucun
 * message, aucune sortie — et pendant ce temps AUCUN correctif touchant le
 * natif ne pouvait lui parvenir. C'est le blocage qui bloque tous les autres.
 *
 * LES QUATRE RÈGLES TENUES ICI :
 * 1. `enqueue()` ne peut pas lever sans être rattrapé — sur Samsung et Xiaomi
 *    le gestionnaire de téléchargement se désactive, et la promesse restait
 *    alors ni résolue ni rejetée.
 * 2. STATUS_PAUSED doit émettre une progression : sans ça, une attente du
 *    Wi-Fi se lit exactement comme un plantage, puisque le dernier
 *    « 0.0 Mo » reste figé à l'écran.
 * 3. Un téléchargement qui n'a reçu AUCUN octet doit rendre la main vite, pas
 *    au bout de dix minutes.
 * 4. Il doit exister un chemin qui NE DÉPEND PAS de DownloadManager, et un
 *    dernier recours affiché à l'écran quand tout échoue.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const java = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/ApkDownloaderPlugin.java",
  "utf8",
)
const carte = readFileSync("src/components/settings/MettreAJour.tsx", "utf8")
const pont = readFileSync("src/lib/apkDownloader.ts", "utf8")

/** Le corps d'une méthode Java, du nom jusqu'à la méthode suivante. Lire le
 * fichier entier laisserait passer un contrôle qui existe ailleurs — c'est le
 * piège du 4 sept. sur `Filesystem.mkdir`, vert alors que l'APPEL avait
 * disparu. */
function sansCommentaires(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
}

function corps(nom: string): string {
  const debut = java.indexOf(nom)
  if (debut === -1) return ""
  const suite = java.indexOf("\n    private ", debut + nom.length)
  const suite2 = java.indexOf("\n    @PluginMethod", debut + nom.length)
  const fins = [suite, suite2].filter((i) => i > 0)
  return java.slice(debut, fins.length ? Math.min(...fins) : java.length)
}

const download = corps("public void downloadAndInstall")

verifier(
  "enqueue() est protégé : le gestionnaire d'Android peut être désactivé",
  /try\s*\{[\s\S]{0,400}?\.enqueue\(request\)[\s\S]{0,200}?\}\s*catch/.test(download),
  "sans ça la promesse n'est ni résolue ni rejetée, et l'écran reste sur « Téléchargement… » pour toujours",
)
verifier(
  "et un gestionnaire absent (getSystemService null) est traité comme une panne",
  /downloadManager == null/.test(download),
)
verifier(
  "STATUS_PAUSED émet une progression, avec sa raison",
  // La CONDITION d'émission, pas la simple présence du mot : STATUS_PAUSED
  // apparaît aussi dans le calcul de la raison, juste en dessous. Vérifié à
  // l'envers : le retirer de la condition laissait ce contrôle vert.
  // La CONDITION d'émission elle-même. Chercher STATUS_PAUSED n'importe où
  // restait vert quand on le retirait de cette condition : le mot apparaît
  // aussi juste en dessous, pour calculer la raison.
  /if \(status == DownloadManager\.STATUS_RUNNING[\s\S]{0,220}?STATUS_PAUSED\)\s*\{/.test(
    sansCommentaires(download),
  ) && /put\("enPause"/.test(download) && /raisonDePause/.test(java),
  "une attente du Wi-Fi se lisait comme un plantage : le dernier « 0.0 Mo » restait figé",
)
verifier(
  "zéro octet reçu ne fait pas attendre dix minutes",
  /DELAI_SANS_OCTET_MS/.test(java) && /recus <= 0[\s\S]{0,120}DELAI_SANS_OCTET_MS/.test(download),
  "« 0.0 Mo reçus » pendant dix minutes n'est pas un état, c'est une panne muette",
)
verifier(
  "et ce délai reste court (une minute au plus)",
  (() => {
    const m = /DELAI_SANS_OCTET_MS = ([^;]+);/.exec(java)
    if (!m) return false
    const valeur = Function(`"use strict";return (${m[1].replace(/_/g, "")})`)() as number
    return valeur > 0 && valeur <= 60_000
  })(),
)

const repli = corps("private void telechargerNousMemes")
verifier(
  "il existe un chemin qui NE PASSE PAS par DownloadManager",
  repli.length > 0 &&
    /HttpURLConnection/.test(repli) &&
    // Sans les commentaires : le corps EXPLIQUE justement pourquoi
    // DownloadManager ne peut pas être le seul chemin, et le mot y est.
    !/DownloadManager/.test(sansCommentaires(repli)),
  "DownloadManager est une application système à part : pratique, mais elle ne peut pas être le seul chemin",
)
verifier(
  "ce chemin est vraiment APPELÉ quand DownloadManager ne donne rien",
  ["gestionnaire_indisponible", "aucun_octet", "echec_", "absent_de_la_file"].every((r) =>
    new RegExp(`telechargerNousMemes\\([^;]*"${r}`).test(sansCommentaires(download)),
  ),
  "gestionnaire indisponible, aucun octet reçu, échec déclaré, ligne disparue : les quatre doivent y mener",
)
verifier(
  "il émet la progression comme l'autre, sans changer de langage en route",
  /notifyListeners\("progression"/.test(repli),
)
verifier(
  "et il dit qu'il a pris le relais",
  /notifyListeners\("repli"/.test(java) && /"repli"/.test(carte),
  "sinon le passage de l'un à l'autre est un silence de plus",
)
verifier(
  "il suit les redirections : GitHub renvoie vers objects.githubusercontent.com",
  /setInstanceFollowRedirects\(true\)/.test(repli),
)
verifier(
  "et il a des délais, sinon une connexion qui ne répond pas gèle tout autant",
  /setConnectTimeout\(/.test(repli) && /setReadTimeout\(/.test(repli),
)

verifier(
  "le dernier recours existe : ouvrir le lien dans le navigateur",
  /public void ouvrirLienExterne/.test(java) && /ouvrirLienExterne/.test(pont),
  "un <a href download> ordinaire ne sort jamais de la WebView, Capacitor l'intercepte",
)
verifier(
  "et il est PROPOSÉ à l'écran quand le téléchargement échoue",
  // Le BOUTON, pas la fonction : chercher `ouvrirDansLeNavigateur` n'importe
  // où restait vert quand on retirait son onClick — la définition suffisait à
  // faire passer le contrôle. Même piège que `Filesystem.mkdir` le 4 sept.
  /etatApk === "erreur"/.test(carte) && /onClick=\{ouvrirDansLeNavigateur\}/.test(carte),
  "un échec sans issue le laisse exactement là où il était le 6 sept.",
)
verifier(
  "l'échec laisse une trace, sinon on rediagnostiquera à l'aveugle",
  /noterEcoute\("maj_apk"/.test(carte) &&
    /maj_apk/.test(readFileSync("src/lib/erreurs.ts", "utf8")),
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
