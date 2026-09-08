import type { TourJarvis } from "@/lib/retours"

/**
 * « Envoie », « c'est bon », « vas-y » après un brouillon de réponse à un
 * mail (prepare_email_reply) : une confirmation nue devient send_email,
 * jamais un second brouillon.
 *
 * MÊME DÉFAUT QUE confirmationEnvoi.ts POUR WHATSAPP (chantier 21cf48d2), ET
 * LA MÊME RAISON : `resolveTranscript` envoie à voice-command la phrase
 * courante SEULE, sans le tour précédent. Le modèle qui reçoit « envoie »
 * tout seul ne peut PAS savoir qu'un mail vient d'être préparé, quelle que
 * soit la consigne écrite pour lui — la reconnaissance doit se faire ICI,
 * avec `dernierTourRef`, que le serveur n'a pas.
 *
 * Volontairement un fichier À PART de confirmationEnvoi.ts plutôt qu'une
 * généralisation : les deux surveillent une préparation différente
 * (send_message vs prepare_email_reply) et doivent pouvoir évoluer sans se
 * marcher dessus — même choix que _shared/destinataire.ts et
 * journalDestinataire.ts, tenues séparées et vérifiées ensemble.
 */

const ACTIONS_PREPARATION = new Set(["prepare_email_reply"])

/** Au-delà, une phrase seule est trop loin du brouillon préparé pour lui être
 * rattachée sans risque — mieux vaut qu'elle reparte vers le serveur. */
const FENETRE_MS = 90_000

const MOTIFS_CONFIRMATION = [
  /^oui\b/i,
  /^envo(?:ie|yer)(\s*-?\s*le)?\b/i,
  /^vas-?\s*y\b/i,
  /^c'est bon\b/i,
  /^confirme\b/i,
]

/** « envoie un mail à Dylan », « écris-lui que… » : une NOUVELLE demande, pas
 * une confirmation de ce qui vient d'être relu. Sans ce garde-fou, une
 * demande qui commence aussi par « envoie » serait avalée à tort. */
const NOUVELLE_DEMANDE = /\bune?\s+(message|mail|e-?mail|sms|texto)\b/i

function neDicteRienDeNouveau(phrase: string): boolean {
  if (/disant|pour (?:lui |leur )?dire|dis-lui|dis-leur|r[ée]ponds-?lui|r[ée]ponds-?leur/i.test(phrase)) {
    return false
  }
  if (NOUVELLE_DEMANDE.test(phrase)) return false
  return true
}

export function estConfirmationEnvoiMail(
  dernierTour: TourJarvis | null,
  phrase: string,
  maintenant: number,
): boolean {
  if (!dernierTour) return false
  if (maintenant - dernierTour.at > FENETRE_MS) return false
  if (!dernierTour.actions.some((a) => ACTIONS_PREPARATION.has(a))) return false
  const texte = phrase.trim()
  if (!texte || !neDicteRienDeNouveau(texte)) return false
  return MOTIFS_CONFIRMATION.some((re) => re.test(texte))
}
