/**
 * Le paquet web d'une mise à jour rapide : ce qu'on accepte d'en faire, et
 * ce qu'on refuse.
 *
 * Volontairement séparé de `majWeb.ts` : ici, aucun appel à Capacitor, à
 * Android ou au disque. C'est donc la seule partie de la mise à jour rapide
 * qui puisse être vérifiée sans téléphone — et c'est là que vivent les deux
 * erreurs qui ne se verraient pas à l'usage : une archive qui écrit hors de
 * son dossier, et un encodage qui abîme un fichier binaire (une police, une
 * image) sans rien casser de visible tout de suite.
 *
 * Vérifié par `scripts/verifier-maj-web.ts`.
 */

/** Nom du paquet web dans la release GitHub, écrit par android-build.yml. */
export const NOM_BUNDLE = "web-bundle.zip"

export interface IdentiteApk {
  build: number | null
  empreinte: string | null
}

export type VerdictMajWeb = { possible: true } | { possible: false; raison: string }

/**
 * Décide si le paquet publié peut être appliqué sans réinstaller l'APK.
 *
 * Le seul cas qui bloque : le code natif a changé. On le lit sur l'empreinte
 * publiée par la CI, jamais sur le poids du téléchargement — un paquet léger
 * peut très bien appeler un plugin absent de l'APK installée, et un paquet
 * lourd n'être que du texte. C'est le « sauf si » de la demande de Raphaël,
 * tranché sur une mesure et pas sur une impression.
 */
export function verdictMajWeb(
  empreintePubliee: string | null,
  identite: IdentiteApk | null,
  urlBundle: string | null,
  disponible: boolean,
): VerdictMajWeb {
  if (!disponible) {
    return { possible: false, raison: "La mise à jour rapide n'existe que dans l'app Android." }
  }
  if (!urlBundle) {
    return {
      possible: false,
      raison:
        "Cette version a été publiée sans paquet web : seule l'installation de l'APK peut l'appliquer.",
    }
  }
  if (!identite?.empreinte || !empreintePubliee) {
    return {
      possible: false,
      raison:
        "Impossible de comparer le code natif de l'app installée à celui de la nouvelle version. Par sécurité, passe par l'APK.",
    }
  }
  if (identite.empreinte !== empreintePubliee) {
    return {
      possible: false,
      raison:
        "Cette mise à jour touche le cœur de l'application (un plugin, une permission, le widget) : elle demande d'installer l'APK.",
    }
  }
  return { possible: true }
}

/**
 * Une entrée d'archive ne doit jamais pouvoir écrire ailleurs que dans son
 * dossier. Une archive fabriquée avec un chemin « ../../ » écrirait dans les
 * données de l'application. L'archive arrive d'internet : on ne lui fait pas
 * confiance, même publiée par notre propre CI.
 */
export function cheminSur(nom: string): boolean {
  if (nom === "" || nom.startsWith("/") || nom.includes("\\")) return false
  if (nom.includes("\0")) return false
  return !nom.split("/").some((partie) => partie === ".." || partie === "")
}

/**
 * Les fichiers à écrire, ou une erreur explicite.
 *
 * Un paquet sans index.html appliqué tel quel donnerait un écran blanc au
 * redémarrage : mieux vaut refuser avant de basculer que constater après.
 */
export function fichiersDuPaquet(archive: Record<string, Uint8Array>): string[] {
  const noms = Object.keys(archive).filter((nom) => !nom.endsWith("/"))
  if (!noms.includes("index.html")) {
    throw new Error("Ce paquet ne contient pas d'interface (index.html manquant).")
  }
  const suspect = noms.find((nom) => !cheminSur(nom))
  if (suspect) throw new Error(`Paquet refusé : chemin suspect « ${suspect} ».`)
  return noms
}

export function base64VersOctets(base64: string): Uint8Array {
  const binaire = atob(base64)
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return octets
}

/** String.fromCharCode(...tableau) dépasse la pile d'appels au-delà de
 * quelques dizaines de milliers d'octets, et le bundle principal fait plus
 * d'un mégaoctet : on encode par tranches. Sans ça, la mise à jour échouerait
 * exactement sur le fichier le plus important. */
export function octetsVersBase64(octets: Uint8Array): string {
  const TRANCHE = 8192
  let binaire = ""
  for (let i = 0; i < octets.length; i += TRANCHE) {
    binaire += String.fromCharCode(...octets.subarray(i, i + TRANCHE))
  }
  return btoa(binaire)
}
