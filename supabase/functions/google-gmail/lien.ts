// Aller chercher un reçu au bout d'un lien.
//
// Le cas de Raphaël, mot pour mot : « je reçois une facture lorsque je vais à
// la station essence, ils m'envoient un SMS avec la facture dans le lien ».
// Par mail c'est pareil — beaucoup de fournisseurs n'envoient pas le PDF, ils
// envoient une adresse.
//
// CE QUI REND CETTE PIÈCE DÉLICATE, et pourquoi le garde-fou est séparé et
// testé : l'adresse ne vient pas de Raphaël, elle vient d'un e-mail. N'importe
// qui peut lui écrire, donc n'importe qui peut choisir l'adresse que le
// serveur ira visiter. Sans garde-fou, ça revient à offrir à un inconnu un
// client HTTP qui s'exécute DANS notre infrastructure, avec ce qu'elle voit de
// l'intérieur. C'est la vulnérabilité connue sous le nom de SSRF, et elle ne
// se voit pas à l'usage : tout marche parfaitement jusqu'au jour où quelqu'un
// s'en sert.
//
// D'où : https uniquement, aucune adresse interne, redirections suivies à la
// main et revalidées une par une, taille plafonnée, et seuls des documents
// acceptés en retour.

/** Un reçu qui dépasse ça n'est plus un reçu. Le plafond protège aussi la
 * mémoire de la fonction, qui est petite. */
export const TAILLE_MAX_LIEN = 8 * 1024 * 1024

/** Ce qu'on accepte de rapporter. Une page HTML n'est pas un reçu : si le
 * fournisseur rend une page, c'est à Raphaël de l'ouvrir, pas à Jarvis de
 * deviner ce qu'il y a dedans. */
const TYPES_DOCUMENT = [/^application\/pdf$/i, /^image\/(jpeg|jpg|png|heic|heif|webp)$/i]

export function estTypeDocument(type: string | null): boolean {
  if (!type) return false
  const nu = type.split(";")[0].trim().toLowerCase()
  return TYPES_DOCUMENT.some((r) => r.test(nu))
}

/**
 * Les plages d'adresses qui ne doivent jamais être visitées : boucle locale,
 * réseaux privés, lien-local (169.254.169.254 est l'adresse des métadonnées
 * chez tous les hébergeurs — c'est la cible classique), et les noms internes.
 */
const HOTES_INTERDITS =
  /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i

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

export type Verdict =
  | { ok: true; url: URL }
  | { ok: false; raison: string }

/** Le contrôle, isolé pour être prouvable sans réseau. */
export function lienAutorise(brut: string): Verdict {
  let url: URL
  try {
    url = new URL(brut)
  } catch {
    return { ok: false, raison: "Ce n'est pas une adresse valide." }
  }
  // http en clair : le reçu passerait en clair, et l'adresse peut être
  // détournée en chemin. Les fournisseurs sérieux sont tous en https.
  if (url.protocol !== "https:") {
    return { ok: false, raison: "Je ne vais chercher un document qu'en https." }
  }
  const hote = url.hostname
  if (!hote || HOTES_INTERDITS.test(hote) || estIpInterdite(hote)) {
    return { ok: false, raison: "Cette adresse pointe vers un réseau interne, je ne la suis pas." }
  }
  return { ok: true, url }
}

export type Document = {
  contenu_base64: string
  type: string | null
  taille: number
  url_finale: string
}

/**
 * Récupère le document, en suivant les redirections À LA MAIN : chaque saut est
 * revalidé, sinon une adresse publique pourrait rediriger vers une adresse
 * interne et le garde-fou d'entrée ne servirait à rien.
 */
export async function recupererDocument(
  brut: string,
  options: { sauts?: number; fetch?: typeof globalThis.fetch } = {},
): Promise<Document> {
  const aller = options.fetch ?? fetch
  let verdict = lienAutorise(brut)
  if (!verdict.ok) throw new Error(verdict.raison)

  let cible = verdict.url
  const sautsMax = options.sauts ?? 3

  for (let saut = 0; ; saut++) {
    const reponse = await aller(cible.toString(), {
      redirect: "manual",
      headers: { Accept: "application/pdf,image/*;q=0.9,*/*;q=0.1" },
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
    if (!estTypeDocument(type)) {
      // Le cas courant : le lien mène à une page où il faut se connecter.
      throw new Error(
        "Ce lien mène à une page, pas à un document. Ouvre-le toi-même, je ne sais pas m'y connecter.",
      )
    }

    // Content-Length est une DÉCLARATION du serveur, pas une garantie : on
    // vérifie quand même la taille réelle en lisant.
    const annoncee = Number(reponse.headers.get("content-length") ?? 0)
    if (annoncee > TAILLE_MAX_LIEN) {
      throw new Error("Ce document est trop gros pour que je te le rapporte.")
    }

    const octets = new Uint8Array(await reponse.arrayBuffer())
    if (octets.byteLength > TAILLE_MAX_LIEN) {
      throw new Error("Ce document est trop gros pour que je te le rapporte.")
    }

    let binaire = ""
    for (const o of octets) binaire += String.fromCharCode(o)
    return {
      contenu_base64: btoa(binaire),
      type,
      taille: octets.byteLength,
      url_finale: cible.toString(),
    }
  }
}
