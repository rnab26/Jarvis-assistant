/**
 * Le document au bout d'un lien : reconnaître l'adresse dans ce qu'il dit ou
 * partage, et décider comment l'enregistrer (chantier 13c39a9b, LECTURE DE
 * LIENS ET DE PDF — la recherche, elle, est livrée depuis le 6 sept.).
 *
 * D'OÙ ÇA VIENT. `supabase/functions/google-gmail/lien.ts` sait déjà aller
 * chercher un document (PDF ou image) au bout d'une adresse https, avec ses
 * garde-fous (SSRF, taille, type). Il ne manquait qu'un moyen de lui DONNER
 * ce lien : à la voix, ou par le partage Android. Ce module est cette
 * pièce-là, et rien d'autre — NE RÉÉCRIS PAS le téléchargement, il vit déjà
 * dans lien.ts / google-gmail/index.ts (action `document_lien`), avec ses dix
 * contrôles vérifiés par `verifier-gmail.mjs`.
 *
 * Module PUR : aucun réseau, aucun appel à Capacitor. Vérifié par
 * `scripts/verifier-documents.ts`.
 */

/** Une adresse http(s), avec la ponctuation de fin de phrase retirée — sinon
 * « regarde ce document : https://exemple.com/facture.pdf. » retiendrait le
 * point final dans l'adresse. */
const MOTIF_URL = /https?:\/\/[^\s]+/i

export function urlDansLaPhrase(phrase: string): string | null {
  const trouve = phrase.match(MOTIF_URL)
  if (!trouve) return null
  return trouve[0].replace(/[.,;!?)\]]+$/, "")
}

/**
 * Un texte partagé qui N'EST QUE le lien — le cas courant du menu Partager
 * d'un navigateur ou de Gmail — plutôt qu'un message qui CONTIENT une adresse
 * au milieu d'autre chose. Sert à distinguer « ranger ce document » (chantier
 * 13c39a9b) de « garder ce que je viens de partager » (le partage ordinaire,
 * useShareReceiver.ts, inchangé).
 */
export function texteEstUnLien(texte: string): string | null {
  const propre = texte.trim()
  if (!propre) return null
  const url = urlDansLaPhrase(propre)
  return url === propre ? url : null
}

/** Ce qu'on accepte de rapporter, exactement les mêmes types que le serveur
 * (google-gmail/lien.ts) — pas la peine de le redire ici avec des mots
 * différents qui finiraient par diverger. */
export function extensionPourType(type: string | null): string {
  const nu = (type ?? "").split(";")[0].trim().toLowerCase()
  if (nu === "application/pdf") return "pdf"
  if (nu === "image/jpeg" || nu === "image/jpg") return "jpg"
  if (nu === "image/png") return "png"
  if (nu === "image/heic") return "heic"
  if (nu === "image/heif") return "heif"
  if (nu === "image/webp") return "webp"
  return "bin"
}

/** Le nom sous lequel un document récupéré au bout d'un lien est enregistré.
 * Pas de titre venu d'une IA ici (contrairement à `titreDepuisQuestion`) :
 * juste de quoi le retrouver — le site d'où il vient, et quand. */
export function nomDocumentDepuisLien(url: string, type: string | null, quand: Date): string {
  let site = "Document"
  try {
    site = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    // Une adresse illisible ne devrait jamais arriver ici (lienAutorise l'a
    // déjà validée côté serveur) : le nom générique reste correct.
  }
  const h = quand
  const pad = (n: number) => String(n).padStart(2, "0")
  const horodatage = `${h.getFullYear()}${pad(h.getMonth() + 1)}${pad(h.getDate())}-${pad(h.getHours())}${pad(h.getMinutes())}`
  return `${site} ${horodatage}.${extensionPourType(type)}`
}
