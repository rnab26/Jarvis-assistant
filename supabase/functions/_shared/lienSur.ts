// Aller chercher quelque chose au bout d'une adresse, sans offrir un client
// HTTP à un inconnu.
//
// POURQUOI CE FICHIER EXISTE À PART, ET POURQUOI IL EST PARTAGÉ. Ce garde-fou
// était écrit dans `google-gmail/lien.ts`, pour les reçus qu'un fournisseur
// envoie par lien. Le 6 sept. 2026, un second appelant est arrivé
// (`lire-document`, chantier 73f06a28 : lire une page ou un PDF qu'on partage
// à Jarvis). Recopier le garde-fou aurait été le pire des choix : deux copies
// d'une protection de sécurité, c'est la garantie qu'on n'en corrigera qu'une,
// et que personne ne s'en apercevra.
//
// CE QUI REND CETTE PIÈCE DÉLICATE : l'adresse ne vient pas de Raphaël. Elle
// vient d'un e-mail, d'un SMS, d'une application qui partage. N'importe qui
// peut donc choisir l'adresse que NOTRE serveur ira visiter, avec ce qu'il voit
// de l'intérieur de l'infrastructure. C'est la vulnérabilité connue sous le nom
// de SSRF, et elle ne se voit pas à l'usage : tout marche parfaitement jusqu'au
// jour où quelqu'un s'en sert.
//
// D'où, et il faut TOUT garder : https uniquement, aucune adresse interne,
// redirections suivies à la main et revalidées une par une, taille plafonnée,
// et seuls les types de contenu que l'appelant a explicitement demandés.

/** Au-delà, ce n'est plus un document qu'on rapporte. Protège aussi la mémoire
 * de la fonction, qui est petite. */
export const TAILLE_MAX_LIEN = 8 * 1024 * 1024

/**
 * Les plages d'adresses qui ne doivent jamais être visitées : boucle locale,
 * réseaux privés, lien-local (169.254.169.254 est l'adresse des métadonnées
 * chez tous les hébergeurs — c'est la cible classique), et les noms internes.
 */
const HOTES_INTERDITS = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i

function estIpInterdite(hote: string): boolean {
  // IPv6 entre crochets, ou notation abrégée : on refuse tout ce qui n'est pas
  // manifestement public plutôt que d'essayer d'être malin.
  if (hote.includes(":")) {
    const nu = hote.replace(/^\[|\]$/g, "").toLowerCase()
    return nu === "::1" || nu.startsWith("fc") || nu.startsWith("fd") || nu.startsWith("fe80")
  }
  const octets = hote.split(".")
  if (octets.length !== 4 || !octets.every((o) => /^\d{1,3}$/.test(o))) return false
  const [a, b] = octets.map(Number)
  if (octets.some((o) => Number(o) > 255)) return true
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

export type Verdict = { ok: true; url: URL } | { ok: false; raison: string }

/** Le contrôle, isolé pour être prouvable sans réseau. */
export function lienAutorise(brut: string): Verdict {
  let url: URL
  try {
    url = new URL(brut)
  } catch {
    return { ok: false, raison: "Ce n'est pas une adresse valide." }
  }
  // http en clair : le contenu passerait en clair, et l'adresse peut être
  // détournée en chemin. Les sites sérieux sont tous en https.
  if (url.protocol !== "https:") {
    return { ok: false, raison: "Je ne vais chercher un document qu'en https." }
  }
  const hote = url.hostname
  if (!hote || HOTES_INTERDITS.test(hote) || estIpInterdite(hote)) {
    return { ok: false, raison: "Cette adresse pointe vers un réseau interne, je ne la suis pas." }
  }
  return { ok: true, url }
}

export interface Ressource {
  octets: Uint8Array
  type: string | null
  url_finale: string
}

export interface OptionsRessource {
  /** Ce que l'appelant accepte de recevoir. Rien d'autre ne passe. */
  accepte: (type: string | null) => boolean
  /** Ce que Jarvis dit quand le type ne convient pas. C'est l'appelant qui le
   * sait : un reçu et une page à résumer n'ont pas la même bonne réponse. */
  refusDeType: string
  /** L'en-tête Accept envoyé, pour que le serveur d'en face serve la bonne chose. */
  entetesAccept?: string
  sauts?: number
  tailleMax?: number
  fetch?: typeof globalThis.fetch
}

/**
 * Récupère la ressource, en suivant les redirections À LA MAIN.
 *
 * Chaque saut est REVALIDÉ : sinon une adresse publique pourrait rediriger vers
 * une adresse interne, et le garde-fou d'entrée ne servirait strictement à
 * rien. C'est le point le plus facile à casser en refactorant, et le seul dont
 * la casse ne se voie jamais à l'usage.
 */
export async function recupererRessource(
  brut: string,
  options: OptionsRessource,
): Promise<Ressource> {
  const aller = options.fetch ?? fetch
  const tailleMax = options.tailleMax ?? TAILLE_MAX_LIEN
  let verdict = lienAutorise(brut)
  if (!verdict.ok) throw new Error(verdict.raison)

  let cible = verdict.url
  const sautsMax = options.sauts ?? 3

  for (let saut = 0; ; saut++) {
    const reponse = await aller(cible.toString(), {
      redirect: "manual",
      headers: { Accept: options.entetesAccept ?? "*/*" },
    })

    if (reponse.status >= 300 && reponse.status < 400) {
      const suivant = reponse.headers.get("location")
      if (!suivant) throw new Error("Le fournisseur redirige sans dire où.")
      if (saut >= sautsMax) throw new Error("Trop de redirections pour arriver au document.")
      verdict = lienAutorise(new URL(suivant, cible).toString())
      if (!verdict.ok) throw new Error(verdict.raison)
      cible = verdict.url
      continue
    }

    if (!reponse.ok) {
      throw new Error(`Le document n'est pas accessible (erreur ${reponse.status}).`)
    }

    const type = reponse.headers.get("content-type")
    if (!options.accepte(type)) throw new Error(options.refusDeType)

    // Content-Length est une DÉCLARATION du serveur, pas une garantie : on
    // vérifie quand même la taille réelle en lisant.
    const annoncee = Number(reponse.headers.get("content-length") ?? 0)
    if (annoncee > tailleMax) {
      throw new Error("Ce document est trop gros pour que je te le rapporte.")
    }

    const octets = new Uint8Array(await reponse.arrayBuffer())
    if (octets.byteLength > tailleMax) {
      throw new Error("Ce document est trop gros pour que je te le rapporte.")
    }

    return { octets, type, url_finale: cible.toString() }
  }
}

/** Des octets vers du base64, par tranches : `String.fromCharCode(...tableau)`
 * sur huit mégaoctets fait sauter la pile d'appels. */
export function enBase64(octets: Uint8Array): string {
  let binaire = ""
  const TRANCHE = 0x8000
  for (let i = 0; i < octets.length; i += TRANCHE) {
    binaire += String.fromCharCode(...octets.subarray(i, i + TRANCHE))
  }
  return btoa(binaire)
}
