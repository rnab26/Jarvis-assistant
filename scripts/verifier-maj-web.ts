/**
 * Vérifie la mise à jour rapide de l'app (chantier b5d210f9), côté paquet.
 *
 *   node --experimental-strip-types scripts/verifier-maj-web.ts
 *
 * Aucun réseau, aucun téléphone. Ce qui est vérifié ici est exactement ce qui
 * casserait sans se voir :
 *
 * - l'encodage d'un gros fichier binaire. Le bundle principal fait plus d'un
 *   mégaoctet ; un encodage naïf dépasse la pile d'appels et échoue
 *   précisément sur le fichier le plus important, ou pire, abîme quelques
 *   octets d'une police sans rien casser tout de suite.
 * - une archive qui écrit hors de son dossier. Le paquet vient d'internet ;
 *   un chemin « ../../ » écrirait dans les données de l'application.
 * - un paquet sans interface, qui donnerait un écran blanc au redémarrage.
 * - le verdict « peut-on l'appliquer sans réinstaller », qui est la moitié
 *   qui compte de ce chantier : se tromper là, c'est soit refuser toutes les
 *   mises à jour rapides, soit en appliquer une qui appelle un plugin absent.
 *
 * Ce que ce script NE PEUT PAS vérifier, et qui ne se voit que sur
 * l'appareil : le redémarrage de la WebView sur le nouveau dossier. Il est
 * conçu pour échouer sans dégât — le chemin n'est rendu permanent qu'après un
 * démarrage réussi — mais ça reste non vérifié ici.
 */
import { unzipSync, zipSync } from "fflate"
import {
  base64VersOctets,
  cheminSur,
  fichiersDuPaquet,
  octetsVersBase64,
  verdictMajWeb,
} from "../src/lib/majPaquet.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const memesOctets = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i])

// ------------------------------------------------- un vrai paquet, complet

{
  // Un bundle réaliste : de l'HTML, un gros JS, et un binaire qui contient
  // tous les octets possibles — c'est là qu'un encodage approximatif se voit.
  const gros = new Uint8Array(1_400_000)
  for (let i = 0; i < gros.length; i++) gros[i] = (i * 31 + 7) % 256
  const binaire = new Uint8Array(256)
  for (let i = 0; i < 256; i++) binaire[i] = i

  const source: Record<string, Uint8Array> = {
    "index.html": new TextEncoder().encode("<!doctype html><html><body>Jarvis</body></html>"),
    "assets/index-abc.js": gros,
    "assets/geist.woff2": binaire,
    "manifest.webmanifest": new TextEncoder().encode('{"name":"Jarvis"}'),
  }
  const zip = zipSync(source)
  const archive = unzipSync(zip)
  const noms = fichiersDuPaquet(archive)

  verifier(
    "un paquet normal donne tous ses fichiers",
    noms.length === 4 && noms.includes("assets/index-abc.js"),
    `obtenu ${JSON.stringify(noms)}`,
  )

  let identiques = 0
  for (const nom of noms) {
    const relu = base64VersOctets(octetsVersBase64(archive[nom]))
    if (memesOctets(relu, source[nom])) identiques++
  }
  verifier(
    "chaque fichier survit à l'aller-retour base64, octet pour octet",
    identiques === noms.length,
    `${identiques}/${noms.length} fichiers identiques — un octet perdu dans une police ou une image ne se verrait qu'à l'usage`,
  )

  const debut = Date.now()
  octetsVersBase64(gros)
  verifier(
    "encoder 1,4 Mo ne dépasse pas la pile et reste rapide",
    Date.now() - debut < 3000,
    `${Date.now() - debut} ms`,
  )
}

// ------------------------------------------------------- paquets à refuser

{
  const piege = zipSync({
    "index.html": new TextEncoder().encode("<html></html>"),
    "../../evil.js": new TextEncoder().encode("nope"),
  })
  let refuse = false
  try {
    fichiersDuPaquet(unzipSync(piege))
  } catch {
    refuse = true
  }
  verifier(
    "une archive qui remonte d'un dossier est refusée",
    refuse,
    "sans ce refus, un paquet fabriqué écrirait dans les données de l'application",
  )
}

{
  const sansInterface = zipSync({ "assets/index.js": new TextEncoder().encode("x") })
  let refuse = false
  try {
    fichiersDuPaquet(unzipSync(sansInterface))
  } catch {
    refuse = true
  }
  verifier(
    "un paquet sans index.html est refusé AVANT de basculer",
    refuse,
    "l'appliquer donnerait un écran blanc au redémarrage",
  )
}

for (const [nom, attendu] of [
  ["index.html", true],
  ["assets/index-abc.js", true],
  ["../evil.js", false],
  ["a/../../evil.js", false],
  ["/etc/passwd", false],
  ["..\\\\windows", false],
  ["", false],
] as [string, boolean][]) {
  verifier(`chemin « ${nom} » ${attendu ? "accepté" : "refusé"}`, cheminSur(nom) === attendu)
}

// ------------------------------------------------------------- le verdict

const APK = { build: 42, empreinte: "abc123" }
const URL_BUNDLE = "https://exemple/web-bundle.zip"

verifier(
  "même natif : la mise à jour rapide est possible",
  verdictMajWeb("abc123", APK, URL_BUNDLE, true).possible,
)
verifier(
  "natif différent : on exige l'APK",
  verdictMajWeb("zzz999", APK, URL_BUNDLE, true).possible === false,
  "sinon on appliquerait une interface qui appelle un plugin absent de l'APK installée",
)
verifier(
  "pas de paquet publié : on exige l'APK",
  verdictMajWeb("abc123", APK, null, true).possible === false,
)
verifier(
  "empreinte de l'APK inconnue : on ne devine pas, on exige l'APK",
  verdictMajWeb("abc123", { build: 42, empreinte: null }, URL_BUNDLE, true).possible === false,
)
verifier(
  "empreinte publiée absente (ancienne release) : on exige l'APK",
  verdictMajWeb(null, APK, URL_BUNDLE, true).possible === false,
)
verifier(
  "sur le web, la mise à jour rapide n'est jamais proposée",
  verdictMajWeb("abc123", APK, URL_BUNDLE, false).possible === false,
)

{
  const refus = verdictMajWeb("zzz999", APK, URL_BUNDLE, true)
  verifier(
    "un refus dit toujours pourquoi, en français",
    refus.possible === false && refus.raison.length > 20,
    "un bouton qui refuse sans expliquer passe pour cassé",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
