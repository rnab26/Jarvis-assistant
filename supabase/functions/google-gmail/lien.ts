// Aller chercher un reçu au bout d'un lien.
//
// Le cas de Raphaël, mot pour mot : « je reçois une facture lorsque je vais à
// la station essence, ils m'envoient un SMS avec la facture dans le lien ».
// Par mail c'est pareil — beaucoup de fournisseurs n'envoient pas le PDF, ils
// envoient une adresse.
//
// LE GARDE-FOU N'EST PLUS ICI, il est dans `../_shared/lienSur.ts`, parce
// qu'un second appelant est arrivé le 6 sept. 2026 (`lire-document`). Deux
// copies d'une protection SSRF, c'est la garantie qu'on n'en corrigera qu'une.
// Ce fichier ne garde que ce qui est propre AU REÇU : quels types de contenu
// on accepte, et ce qu'on répond quand ce n'en est pas un.

import {
  TAILLE_MAX_LIEN,
  type Verdict,
  enBase64,
  lienAutorise,
  recupererRessource,
} from "../_shared/lienSur.ts"

// Réexportés : `google-gmail/index.ts` et `scripts/verifier-gmail.mjs` les
// prennent ici depuis le début, et ce chantier ne change pas leur contrat.
export { TAILLE_MAX_LIEN, lienAutorise }
export type { Verdict }

/**
 * Ce qu'on accepte de rapporter comme REÇU.
 *
 * Une page HTML n'en est pas un : si le fournisseur rend une page, c'est à
 * Raphaël de l'ouvrir, pas à Jarvis de deviner ce qu'il y a dedans. C'est un
 * choix propre à ce chemin-là — `lire-document`, lui, accepte les pages,
 * puisque les résumer est justement son travail.
 */
const TYPES_DOCUMENT = [/^application\/pdf$/i, /^image\/(jpeg|jpg|png|heic|heif|webp)$/i]

export function estTypeDocument(type: string | null): boolean {
  if (!type) return false
  const nu = type.split(";")[0].trim().toLowerCase()
  return TYPES_DOCUMENT.some((r) => r.test(nu))
}

export type Document = {
  contenu_base64: string
  type: string | null
  taille: number
  url_finale: string
}

/**
 * Récupère le reçu. Les redirections sont suivies à la main et revalidées une
 * par une — voir `_shared/lienSur.ts`, qui porte cette mécanique.
 */
export async function recupererDocument(
  brut: string,
  options: { sauts?: number; fetch?: typeof globalThis.fetch } = {},
): Promise<Document> {
  const r = await recupererRessource(brut, {
    accepte: estTypeDocument,
    // Le cas courant : le lien mène à une page où il faut se connecter.
    refusDeType:
      "Ce lien mène à une page, pas à un document. Ouvre-le toi-même, je ne sais pas m'y connecter.",
    entetesAccept: "application/pdf,image/*;q=0.9,*/*;q=0.1",
    sauts: options.sauts,
    fetch: options.fetch,
  })
  return {
    contenu_base64: enBase64(r.octets),
    type: r.type,
    taille: r.octets.byteLength,
    url_finale: r.url_finale,
  }
}
