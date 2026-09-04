// Construire la requête Gmail qui retrouve un reçu. Sorti de index.ts pour la
// même raison que message.ts : aucune dépendance Deno, donc
// scripts/verifier-gmail.mjs le prouve sous Node, sans réseau et sans jeton.
//
// POURQUOI CETTE LOGIQUE EST ICI ET PAS DANS LA CONSIGNE DU MODÈLE.
// Raphaël ne demande pas toujours la même chose de la même façon : « retrouve
// mes reçus », « la facture que ma femme m'a envoyée », « le justificatif de
// la station essence », « celle de Bezeq ». Faire porter la traduction en
// syntaxe Gmail au modèle, c'est la refaire dépendre de son humeur et d'un
// quota — et la rendre invérifiable. Ici, elle se teste.
//
// Rien de personnel n'y est codé en dur : ni un nom, ni un destinataire, ni un
// prestataire. Jarvis sert Raphaël comme il sert sa femme, et « finbot » n'est
// qu'un contact que l'un d'eux a nommé — jamais une constante du code.

/** Les mots qui désignent un reçu, dans les deux langues qu'il reçoit.
 * Gmail ignore les accents dans la recherche : « recu » couvre « reçu ». */
export const MOTS_RECU = [
  "facture",
  "recu",
  "receipt",
  "invoice",
  "ticket",
  "justificatif",
  "note de frais",
]

/** Les opérateurs Gmail : leur présence veut dire que l'appelant a déjà écrit
 * une requête, et on ne la réécrit pas par-dessus. */
const OPERATEUR_GMAIL = /\b(from|to|subject|has|is|in|label|filename|after|before|newer_than|older_than|cc|bcc):/i

/** « la facture de MA FEMME » : le déterminant n'aide pas Gmail à trouver un
 * expéditeur, il ne fait que diluer la recherche. */
const DETERMINANTS = /^(?:l[ae]s?|d[eu]s?|d'|mon|ma|mes|son|sa|ses|notre|nos|un|une)\s+/i

function nettoyer(valeur: string): string {
  let v = valeur.trim().replace(/\s+/g, " ")
  // Deux passes : « de la station essence » perd « de » puis « la ».
  v = v.replace(DETERMINANTS, "").replace(DETERMINANTS, "")
  return v.trim()
}

export type OptionsRecus = {
  /** Qui, ou quel fournisseur. Une personne, une enseigne, ou déjà de la
   * syntaxe Gmail. Absent = tous ses reçus de la période. */
  recherche?: string | null
  /** Sur combien de jours en arrière. */
  jours?: number
}

/**
 * La requête Gmail correspondante.
 *
 * Quand une personne ou une enseigne est nommée, on cherche `from:X OR X` :
 * `from:` compare aussi le NOM AFFICHÉ de l'expéditeur, pas seulement son
 * adresse — c'est ce qui permet de retrouver « la facture de Melissa » sans
 * connaître son adresse. Et le terme seul rattrape le cas où le nom est dans
 * l'objet plutôt que chez l'expéditeur (une facture transférée).
 */
export function construireRequeteRecus({ recherche, jours = 30 }: OptionsRecus = {}): string {
  const periode = `newer_than:${Math.min(Math.max(Math.round(jours), 1), 365)}d`
  // Ses propres envois et les fils promotionnels ne sont jamais des reçus.
  const exclusions = "-in:sent -in:chats -category:promotions"
  const motsOuPiece = `(${MOTS_RECU.map((m) => (m.includes(" ") ? `"${m}"` : m)).join(" OR ")} OR has:attachment)`

  const brut = (recherche ?? "").trim()
  if (!brut) return `${periode} ${motsOuPiece} ${exclusions}`

  // Déjà une requête Gmail : on la respecte telle quelle.
  if (OPERATEUR_GMAIL.test(brut)) return `${periode} (${brut}) ${motsOuPiece} ${exclusions}`

  const qui = nettoyer(brut)
  if (!qui) return `${periode} ${motsOuPiece} ${exclusions}`

  const echappe = qui.includes(" ") ? `"${qui}"` : qui
  return `${periode} (from:${echappe} OR ${echappe}) ${motsOuPiece} ${exclusions}`
}

/** Un reçu est un PDF ou une image ; une signature en PNG et un .ics n'en
 * sont pas, et pollueraient chaque résultat. */
export function estDocument(type: string | null, nom: string): boolean {
  const t = (type ?? "").toLowerCase()
  if (t === "application/pdf" || t.startsWith("image/")) return true
  return /\.(pdf|jpe?g|png|heic|webp)$/i.test(nom)
}

/** Le cas de sa station essence : « ils m'envoient un SMS avec la facture
 * dans le lien ». Par mail c'est pareil — le reçu est au bout d'un lien, pas
 * en pièce jointe. On ne suit aucun lien ici, on les rend seulement. */
export function liensDocuments(texte: string): string[] {
  const liens = texte.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []
  const interessants = liens.filter((l) =>
    /facture|recu|reçu|receipt|invoice|ticket|justificatif|document|pdf|download|telecharger/i.test(l),
  )
  // Dédoublonné : un mail met souvent le même lien dans le texte et le bouton.
  return [...new Set(interessants)].slice(0, 5)
}
