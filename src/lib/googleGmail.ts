import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/**
 * Gmail, vu depuis l'app. Même principe que googleCalendar.ts : tout passe par
 * la Edge Function google-gmail, le jeton d'accès reste côté serveur, le
 * navigateur ne fait qu'exprimer une intention.
 *
 * `envoyerMessage` demande explicitement une confirmation. Ce n'est pas une
 * précaution de façade : un e-mail part vers l'extérieur au nom de Raphaël, et
 * le serveur refuse l'envoi si le drapeau manque. Ne l'appelle qu'après une
 * validation qu'il a réellement dite.
 */

export class GmailError extends Error {}

export type MessageResume = {
  id: string
  fil_id: string | null
  de: string | null
  objet: string | null
  date: string | null
  extrait: string | null
  non_lu: boolean
}

export type PieceJointe = {
  id: string
  nom: string
  type: string | null
  taille: number | null
}

export type MessageComplet = MessageResume & {
  corps: string
  corps_complet: string
  pieces_jointes: PieceJointe[]
  repondre_a: string | null
  message_id_rfc: string | null
  references: string | null
  objet_reponse: string
}

export type Brouillon = {
  destinataires: string
  copie: string | null
  objet: string
  corps: string
  repond_a_message_id: string | null
  references: string | null
  fil_id: string | null
  pieces_jointes: { nom: string; type: string | null }[]
}

export type Recu = MessageResume & {
  pieces_jointes: PieceJointe[]
  /** Le reçu est parfois au bout d'un lien plutôt qu'en pièce jointe. */
  liens: string[]
}

type Reponse = {
  messages?: MessageResume[]
  recus?: Recu[]
  message?: MessageComplet | string
  brouillon?: Brouillon
  envoye?: { id: string; fil_id: string | null }
  piece_jointe?: { taille: number | null; contenu_base64: string }
  document?: { contenu_base64: string; type: string | null; taille: number; url_finale: string }
  error?: string
}

async function appeler(corps: Record<string, unknown>): Promise<Reponse> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke<Reponse>("google-gmail", { body: corps }),
    20000,
  )

  if (error) {
    const contexte = (error as { context?: Response }).context
    if (contexte && typeof contexte.json === "function") {
      try {
        const detail = (await contexte.json()) as Reponse
        // Les messages du serveur sont écrits pour être dits à voix haute :
        // on les remonte tels quels plutôt que de les reformuler ici.
        if (typeof detail?.message === "string") throw new GmailError(detail.message)
        if (detail?.error === "google") {
          throw new GmailError("Gmail a refusé la demande.")
        }
        if (detail?.error) throw new GmailError(detail.error)
      } catch (e) {
        if (e instanceof GmailError) throw e
      }
    }
    throw new GmailError("Gmail n'a pas répondu.")
  }
  return data ?? {}
}

/** `recherche` accepte la syntaxe Gmail ("from:yoni", "has:attachment"). */
export async function listerMessages(options: {
  recherche?: string
  limite?: number
} = {}): Promise<MessageResume[]> {
  const reponse = await appeler({ action: "list", ...options })
  return reponse.messages ?? []
}

/**
 * Ses reçus et ses factures des derniers jours. Ne rend que les messages qui
 * portent vraiment un document (pièce jointe ou lien) : annoncer « j'en ai
 * trouvé douze » dont dix sans facture ne lui sert à rien.
 */
export async function chercherRecus(options: {
  depuis_jours?: number
  limite?: number
  /** Restreint à un fournisseur précis : « station essence », « Bezeq ». */
  recherche?: string
} = {}): Promise<Recu[]> {
  const reponse = await appeler({ action: "recus", ...options })
  return reponse.recus ?? []
}

export async function lireMessage(
  messageId: string,
  options: { marquer_lu?: boolean } = {},
): Promise<MessageComplet | null> {
  const reponse = await appeler({ action: "read", message_id: messageId, ...options })
  return typeof reponse.message === "object" ? reponse.message : null
}

/** Prépare la réponse SANS l'envoyer, pour qu'il l'entende avant de valider. */
export async function preparerReponse(options: {
  texte: string
  message_id?: string
  destinataires?: string
  copie?: string | null
  objet?: string
  pieces_jointes?: { nom: string; type?: string | null }[]
}): Promise<Brouillon | null> {
  const reponse = await appeler({ action: "preparer", ...options })
  return reponse.brouillon ?? null
}

/**
 * L'envoi réel. `confirme` n'est pas un paramètre à passer machinalement :
 * il atteste que Raphaël a validé ce texte-là, à la voix. Le serveur refuse
 * sans lui.
 */
export async function envoyerMessage(
  brouillon: Brouillon & { pieces_jointes?: { nom: string; type?: string | null; contenu_base64: string }[] },
  confirme: boolean,
): Promise<{ id: string; fil_id: string | null } | null> {
  const reponse = await appeler({
    action: "envoyer",
    confirme,
    destinataires: brouillon.destinataires,
    copie: brouillon.copie,
    objet: brouillon.objet,
    texte: brouillon.corps,
    repond_a_message_id: brouillon.repond_a_message_id,
    references: brouillon.references,
    fil_id: brouillon.fil_id,
    pieces_jointes: brouillon.pieces_jointes ?? [],
  })
  return reponse.envoye ?? null
}

export async function recupererPieceJointe(
  messageId: string,
  pieceJointeId: string,
): Promise<{ taille: number | null; contenu_base64: string } | null> {
  const reponse = await appeler({
    action: "piece_jointe",
    message_id: messageId,
    piece_jointe_id: pieceJointeId,
  })
  return reponse.piece_jointe ?? null
}

/**
 * Le reçu au bout d'un lien — beaucoup de fournisseurs n'envoient pas le PDF,
 * ils envoient une adresse. Le serveur refuse tout ce qui n'est pas un document
 * public en https, et son message dit quoi faire quand le lien mène à une page
 * de connexion : à remonter tel quel, il est écrit pour être dit à voix haute.
 */
export async function recupererDocumentLien(
  url: string,
): Promise<{ contenu_base64: string; type: string | null; taille: number; url_finale: string } | null> {
  const reponse = await appeler({ action: "document_lien", url })
  return reponse.document ?? null
}

/** Gmail tel qu'on l'injecte dans l'exécuteur de commandes vocales. */
export const gmailApi = {
  listerMessages,
  chercherRecus,
  lireMessage,
  preparerReponse,
  envoyerMessage,
  recupererPieceJointe,
  recupererDocumentLien,
}
