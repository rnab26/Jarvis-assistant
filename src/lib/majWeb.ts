import { Capacitor, WebView } from "@capacitor/core"
import { Directory, Filesystem } from "@capacitor/filesystem"
import { Preferences } from "@capacitor/preferences"
import { unzipSync } from "fflate"
import type { ProgressionTelechargement } from "@/lib/apkDownloader"
import {
  base64VersOctets,
  fichiersDuPaquet,
  octetsVersBase64,
  verdictMajWeb,
  type IdentiteApk,
  type VerdictMajWeb,
} from "@/lib/majPaquet"
import { BUILD_NUMBER, NATIVE_EMPREINTE } from "@/lib/version"

/**
 * Mettre à jour l'app SANS la réinstaller.
 *
 * Demande de Raphaël (chantier b5d210f9), ses mots : « Plutôt que de
 * retélécharger l'application et de la réinstaller […] sauf si les mises à
 * jour sont trop lourdes ou nécessitent l'exécution d'une installation
 * complète. Vu le nombre de mises à jour qui sont faites. »
 *
 * COMMENT ÇA MARCHE. Une app Capacitor, c'est une coquille Android (le code
 * natif : plugins, permissions, widget) autour d'une interface web. La quasi-
 * totalité des chantiers ne touche QUE l'interface web. Capacitor sait servir
 * cette interface depuis un dossier du téléphone plutôt que depuis l'APK
 * (WebView.setServerBasePath) : on télécharge donc le paquet web publié par
 * la CI (~700 Ko compressés, contre ~10 Mo d'APK), on l'écrit sur le
 * téléphone, et l'app redémarre dessus. Aucune réinstallation, aucune
 * autorisation « sources inconnues », rien à confirmer dans un installateur.
 *
 * QUAND ÇA NE SUFFIT PAS, et c'est la moitié qui compte. Si la mise à jour
 * touche le code natif (un nouveau plugin, une permission, le widget), la
 * coquille installée ne sait pas exécuter la nouvelle interface : le bouton
 * ajouté appellerait un plugin absent. La CI publie donc une EMPREINTE du
 * natif avec chaque build ; si celle du paquet publié diffère de celle de
 * l'APK installée, la mise à jour rapide est refusée et l'app dit clairement
 * qu'il faut installer l'APK. C'est exactement le « sauf si » de sa demande,
 * décidé sur une vraie mesure et pas sur une estimation de poids.
 *
 * POURQUOI ON NE PEUT PAS SE RETROUVER AVEC UNE APP MORTE. Le chemin n'est
 * rendu permanent (persistServerBasePath) qu'APRÈS que le nouveau paquet a
 * démarré et exécuté ce fichier. Un paquet cassé ne démarre pas, donc ne
 * confirme jamais : il suffit de fermer et rouvrir l'app pour retomber sur la
 * version précédente. Et Capacitor efface lui-même le chemin enregistré quand
 * l'APK change (Bridge.isNewBinary), donc installer une APK reprend toujours
 * la main sur un paquet téléchargé.
 */

const CLE_IDENTITE_APK = "jarvis_apk_identite"
const CLE_BUNDLE_ACTIF = "jarvis_bundle_actif"
const CLE_ESSAI = "jarvis_bundle_essai"
const CLE_ECHEC = "jarvis_bundle_echec"

/** Le dossier des assets de l'APK, tel que Capacitor le sert par défaut
 * (Bridge.DEFAULT_WEB_ASSET_DIR). Y revenir, c'est revenir à l'interface
 * livrée avec l'application installée. */
const ASSETS_EMBARQUES = "public"

const RACINE_BUNDLES = "bundles"

export const majWebDisponible = () => Capacitor.isNativePlatform()

/** L'identité de l'APK réellement installée. Relevée pendant que l'interface
 * embarquée tourne — c'est le seul moment où le code qui s'exécute EST celui
 * de l'APK, donc le seul moment où on peut l'affirmer. */
export type { IdentiteApk, VerdictMajWeb }

export interface BundleActif {
  build: number | null
  version: string | null
  commit: string | null
  chemin: string
  /** Quand il a été appliqué, ISO. */
  applique: string
}

export interface EchecBundle {
  build: number | null
  quand: string
}

export interface EtatMajWeb {
  disponible: boolean
  identiteApk: IdentiteApk | null
  actif: BundleActif | null
  dernierEchec: EchecBundle | null
}

async function lireJson<T>(cle: string): Promise<T | null> {
  try {
    const { value } = await Preferences.get({ key: cle })
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

async function ecrireJson(cle: string, valeur: unknown) {
  try {
    await Preferences.set({ key: cle, value: JSON.stringify(valeur) })
  } catch {
    // Stockage natif indisponible : la mise à jour rapide sera simplement
    // proposée à nouveau au prochain lancement.
  }
}

async function effacer(cle: string) {
  try {
    await Preferences.remove({ key: cle })
  } catch {
    // Idem : sans conséquence.
  }
}

async function cheminServi(): Promise<string> {
  try {
    const { path } = await WebView.getServerBasePath()
    return path ?? ""
  } catch {
    return ""
  }
}

/**
 * À appeler UNE FOIS au démarrage de l'app, le plus tôt possible.
 *
 * Trois choses, dans cet ordre :
 * 1. Si on vient de démarrer sur un paquet fraîchement téléchargé, on le
 *    confirme — c'est ce qui le rend permanent. Le fait d'arriver jusqu'ici
 *    EST la preuve qu'il fonctionne.
 * 2. Si un essai était en attente et qu'on a démarré ailleurs, c'est qu'il a
 *    échoué : on le note (Paramètres le dira) et on ne le rejouera pas en
 *    boucle.
 * 3. Si on tourne sur l'interface embarquée, on relève l'identité de l'APK :
 *    son numéro de build et l'empreinte de son code natif.
 */
export async function demarrerMajWeb(): Promise<void> {
  if (!majWebDisponible()) return

  const chemin = await cheminServi()
  const essai = await lireJson<BundleActif>(CLE_ESSAI)

  if (essai) {
    if (chemin === essai.chemin) {
      try {
        await WebView.persistServerBasePath()
        await ecrireJson(CLE_BUNDLE_ACTIF, essai)
        await effacer(CLE_ECHEC)
      } catch {
        // Sans confirmation, le prochain démarrage repartira sur la version
        // précédente : c'est le comportement voulu, rien à réparer ici.
      }
      await effacer(CLE_ESSAI)
      await nettoyerAnciens(essai.build)
    } else {
      await ecrireJson(CLE_ECHEC, { build: essai.build, quand: new Date().toISOString() })
      await effacer(CLE_ESSAI)
      await supprimerDossier(essai.build)
    }
  }

  if (chemin === "" || chemin === ASSETS_EMBARQUES) {
    // On tourne sur l'interface livrée avec l'APK. C'est ici, et nulle part
    // ailleurs, que BUILD_NUMBER et NATIVE_EMPREINTE décrivent vraiment
    // l'application installée : une fois un paquet appliqué, ces constantes
    // sont celles du paquet, pas celles de l'APK.
    const identite: IdentiteApk = {
      build: BUILD_NUMBER ? Number(BUILD_NUMBER) : null,
      empreinte: NATIVE_EMPREINTE,
    }
    if (identite.build !== null || identite.empreinte !== null) {
      await ecrireJson(CLE_IDENTITE_APK, identite)
    }
    // Capacitor efface le chemin enregistré dès que l'APK change : si on est
    // sur l'embarqué, aucun paquet n'est actif, quoi qu'on ait noté avant.
    await effacer(CLE_BUNDLE_ACTIF)
  }
}

let promesseDemarrage: Promise<void> | null = null

/** Le démarrage, joué une seule fois quoi qu'il arrive : `main.tsx` le lance
 * au plus tôt, et l'écran de Paramètres attend la même promesse plutôt que
 * de relire un état encore en cours d'écriture. */
export function demarrageMajWeb(): Promise<void> {
  if (!promesseDemarrage) promesseDemarrage = demarrerMajWeb()
  return promesseDemarrage
}

export async function lireEtatMajWeb(): Promise<EtatMajWeb> {
  if (!majWebDisponible()) {
    return { disponible: false, identiteApk: null, actif: null, dernierEchec: null }
  }
  const [identiteApk, actif, dernierEchec] = await Promise.all([
    lireJson<IdentiteApk>(CLE_IDENTITE_APK),
    lireJson<BundleActif>(CLE_BUNDLE_ACTIF),
    lireJson<EchecBundle>(CLE_ECHEC),
  ])
  return { disponible: true, identiteApk, actif, dernierEchec }
}

/** Le verdict, avec la disponibilité de la plateforme déjà résolue. La
 * décision elle-même vit dans majPaquet.ts, vérifiable sans téléphone. */
export function verdictMaj(
  empreintePubliee: string | null,
  identite: IdentiteApk | null,
  urlBundle: string | null,
): VerdictMajWeb {
  return verdictMajWeb(empreintePubliee, identite, urlBundle, majWebDisponible())
}

/** Une étape de l'application d'un paquet, telle qu'elle s'affiche. */
export type EtapeMaj = "telechargement" | "installation" | "redemarrage"

async function supprimerDossier(build: number | null) {
  if (build === null) return
  try {
    await Filesystem.rmdir({
      directory: Directory.Data,
      path: `${RACINE_BUNDLES}/${build}`,
      recursive: true,
    })
  } catch {
    // Déjà absent : c'est le résultat voulu.
  }
}

/** Ne garde que le paquet en cours : les précédents ne servent plus à rien et
 * pèsent quelques mégaoctets chacun. */
async function nettoyerAnciens(buildAGarder: number | null) {
  try {
    const { files } = await Filesystem.readdir({
      directory: Directory.Data,
      path: RACINE_BUNDLES,
    })
    for (const fichier of files) {
      const nom = typeof fichier === "string" ? fichier : fichier.name
      if (nom === String(buildAGarder)) continue
      if (nom.endsWith(".zip")) {
        await Filesystem.deleteFile({ directory: Directory.Data, path: `${RACINE_BUNDLES}/${nom}` }).catch(
          () => {},
        )
        continue
      }
      await Filesystem.rmdir({
        directory: Directory.Data,
        path: `${RACINE_BUNDLES}/${nom}`,
        recursive: true,
      }).catch(() => {})
    }
  } catch {
    // Dossier absent au premier usage : rien à nettoyer.
  }
}

/**
 * Télécharge le paquet web publié, l'installe, et redémarre l'app dessus.
 *
 * Ne rend jamais la main en cas de succès : la dernière ligne relance la
 * WebView. En cas d'échec, lève avec un message affichable tel quel.
 */
export async function appliquerBundle(
  paquet: { url: string; build: number | null; version: string | null; commit: string | null },
  surEtape: (etape: EtapeMaj) => void = () => {},
  surProgression: (progression: ProgressionTelechargement) => void = () => {},
): Promise<void> {
  if (!majWebDisponible()) throw new Error("La mise à jour rapide n'existe que dans l'app Android.")
  const build = paquet.build ?? Date.now()
  const dossier = `${RACINE_BUNDLES}/${build}`
  const archive = `${RACINE_BUNDLES}/${build}.zip`

  surEtape("telechargement")
  // Téléchargement natif plutôt que fetch() : pas de question de CORS sur le
  // fichier de la release, et le fichier arrive directement sur le disque au
  // lieu de transiter par la mémoire de la WebView.
  await supprimerDossier(build)
  const poignee = await Filesystem.addListener("progress", (p) =>
    surProgression({ recus: p.bytes, total: p.contentLength }),
  ).catch(() => null)
  try {
    await Filesystem.downloadFile({
      url: paquet.url,
      path: archive,
      directory: Directory.Data,
      recursive: true,
      progress: true,
    })
  } finally {
    await poignee?.remove().catch(() => {})
  }

  surEtape("installation")
  const { data } = await Filesystem.readFile({ directory: Directory.Data, path: archive })
  if (typeof data !== "string") throw new Error("Paquet illisible.")
  const fichiers = unzipSync(base64VersOctets(data))

  const noms = fichiersDuPaquet(fichiers)

  for (const nom of noms) {
    await Filesystem.writeFile({
      directory: Directory.Data,
      path: `${dossier}/${nom}`,
      data: octetsVersBase64(fichiers[nom]),
      recursive: true,
    })
  }

  const { uri } = await Filesystem.getUri({ directory: Directory.Data, path: dossier })
  const chemin = uri.replace(/^file:\/\//, "")

  // Noté AVANT de basculer : c'est ce marqueur que le prochain démarrage
  // cherchera pour confirmer — ou pour constater que le paquet ne démarre pas.
  await ecrireJson(CLE_ESSAI, {
    build: paquet.build,
    version: paquet.version,
    commit: paquet.commit,
    chemin,
    applique: new Date().toISOString(),
  } satisfies BundleActif)

  await Filesystem.deleteFile({ directory: Directory.Data, path: archive }).catch(() => {})

  surEtape("redemarrage")
  await WebView.setServerBasePath({ path: chemin })
}

/**
 * Revenir à l'interface livrée avec l'APK installée.
 *
 * Le bouton « défaire » de ce chantier : une mise à jour rapide qui a
 * démarré mais se comporte mal doit pouvoir être annulée depuis l'app, sans
 * réinstaller quoi que ce soit.
 *
 * On repasse le serveur local sur les assets de l'APK, puis on enregistre :
 * ce que Capacitor gardera alors n'est pas un vrai dossier, donc au prochain
 * lancement il l'ignorera et servira les assets — exactement ce qu'on veut.
 */
export async function revenirALAPK(): Promise<void> {
  if (!majWebDisponible()) return
  await effacer(CLE_ESSAI)
  await effacer(CLE_BUNDLE_ACTIF)
  await WebView.setServerAssetPath({ path: ASSETS_EMBARQUES })
  try {
    await WebView.persistServerBasePath()
  } catch {
    // Non enregistré : le prochain lancement repartirait sur le paquet. On
    // ne prétend pas que c'est fait — l'appelant relit l'état.
  }
}
