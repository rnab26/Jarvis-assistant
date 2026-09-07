import { GmailError, recupererDocumentLien } from "@/lib/googleGmail"
import { nomDocumentDepuisLien } from "@/lib/documentLien"
import { noterEcoute } from "@/lib/journalEcoute"

/**
 * Va chercher le document au bout d'un lien (voix ou partage Android) et
 * l'enregistre — chantier 13c39a9b. Le téléchargement lui-même, avec ses
 * garde-fous, vit dans `google-gmail/lien.ts` (action `document_lien`) ; ce
 * module ne fait que l'appeler et enregistrer ce qu'il rapporte, comme
 * `garderReponseEcran.ts` le fait pour la réponse d'une IA.
 *
 * `document_lien` NE DÉPEND PAS d'un compte Google branché (elle ne touche
 * pas Gmail) : `recupererDocumentLien` peut donc être appelée même si
 * Raphaël n'a jamais connecté son compte.
 *
 * `ok` distingue succès et échec pour l'appelant qui affiche un toast (une
 * réussite au vert, un échec en rouge) — la voix, elle, dit `message` dans
 * les deux cas sans distinction, comme partout ailleurs dans le projet.
 */
export type ResultatLien = { ok: boolean; message: string }

export async function lireDocumentLien(
  url: string,
  saveBinaryDocument: (filename: string, base64: string, contentType: string | null) => Promise<void>,
): Promise<ResultatLien> {
  try {
    const doc = await recupererDocumentLien(url)
    if (!doc) {
      noterEcoute("document_lien", { resultat: "vide", url })
      return { ok: false, message: "Je n'ai rien reçu au bout de ce lien." }
    }
    const nom = nomDocumentDepuisLien(doc.url_finale, doc.type, new Date())
    await saveBinaryDocument(nom, doc.contenu_base64, doc.type)
    noterEcoute("document_lien", { resultat: "garde", url, type: doc.type, taille: doc.taille })
    return { ok: true, message: `C'est gardé dans Documents, sous le nom « ${nom} ».` }
  } catch (err) {
    // Les messages de GmailError sont déjà écrits pour être dits à voix
    // haute (google-gmail/lien.ts) : on les reprend tels quels.
    const message = err instanceof GmailError ? err.message : "Je n'ai pas réussi à récupérer ce lien."
    noterEcoute("document_lien", { resultat: "echec", url, message })
    return { ok: false, message }
  }
}
