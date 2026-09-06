import type { TourJarvis } from "@/lib/retours"

/**
 * « Envoie-le », « vas-y », « c'est bon » après un message préparé : une
 * confirmation nue devient un CLIC sur « Envoyer », pas un second brouillon.
 *
 * D'OÙ ÇA VIENT. Chantier 21cf48d2, 6 sept. 2026 : Raphaël a activé le
 * service d'accessibilité, mais le message ne partait toujours pas.
 * `journal_ecoute` a montré pourquoi : deux `send_message` consécutifs pour
 * la même demande, jamais un `screen_action` — le modèle rouvrait le même
 * brouillon WhatsApp au lieu de cliquer.
 *
 * UN PREMIER CORRECTIF (une consigne côté serveur) NE POUVAIT PAS MARCHER,
 * et ça vaut d'être écrit pour ne pas le retenter : `resolveTranscript`
 * envoie à voice-command la phrase courante SEULE, sans le tour précédent
 * (ni son action, ni son résultat). Le modèle qui classe la deuxième phrase
 * n'a donc AUCUN moyen de savoir qu'un message vient d'être préparé, quelle
 * que soit la consigne qu'on lui écrit. La reconnaissance doit se faire ICI,
 * avec l'état que seul l'appareil a (`dernierTourRef` de MicButton, déjà
 * tenu pour `echecSignalePar`) — donc AVANT tout aller-retour au serveur,
 * comme `move_last_entry` dans commandeLocale.ts.
 *
 * POURQUOI CE N'EST PAS UNE RÈGLE DE `commandeLocale.ts` : ces phrases
 * (« vas-y », « c'est bon ») sont beaucoup trop génériques pour être
 * reconnues par leur seul texte — dans n'importe quel autre contexte, elles
 * ne veulent rien dire de précis. Il FAUT le tour précédent pour les
 * désambiguïser, donc la fonction le prend en paramètre plutôt que de
 * deviner depuis la phrase seule.
 */

/** Le tour précédent doit avoir préparé un envoi — pas n'importe quelle
 * action — pour qu'une confirmation nue ait un sens. */
const ACTIONS_PREPARATION = new Set(["send_message"])

/** Au-delà, une phrase seule est trop loin du message préparé pour lui être
 * rattachée sans risque : mieux vaut qu'elle reparte vers le serveur, qui
 * demandera une précision plutôt que de cliquer au hasard. */
const FENETRE_MS = 90_000

/** Les tournures qu'il emploie pour confirmer, sans dicter de nouveau
 * contenu. Volontairement un petit ensemble fermé : un faux négatif renvoie
 * juste la phrase au serveur (qui la traite comme avant), un faux positif
 * cliquerait sur l'écran à sa place.
 *
 * « envo(ie|yer) » couvre les deux formes vues dans `journal_ecoute` le
 * 6 sept. — la reconnaissance vocale a transcrit l'infinitif « Envoyer »
 * là où on attendrait l'impératif « Envoie », dans les DEUX phrases de ce
 * soir-là. Le groupe optionnel ne filtre pas encore le nouveau contenu :
 * c'est `neDicteRienDeNouveau` qui s'en charge, exprès séparément, pour
 * qu'« Envoyer UN message » (nouvelle demande) et « Envoyer LE message »
 * (confirmation) empruntent chacun le bon chemin. */
const MOTIFS_CONFIRMATION = [
  /^envo(?:ie|yer)(\s*-?\s*le)?\b/i,
  /^vas-?\s*y\b/i,
  /^c'est bon\b/i,
  /^confirme\b/i,
  /^appuie sur envoyer\b/i,
]

/** L'article indéfini dit une NOUVELLE demande — « un message », « un sms » —
 * quel que soit le verbe qui l'introduit. */
const NOUVEAU_MESSAGE = /\bune?\s+(message|sms|texto)\b/i

/** Vrai si la phrase NE dicte aucun nouveau contenu — sinon « envoie un
 * message à Dylan pour lui dire que je passe demain » serait pris pour la
 * confirmation d'un message précédent au lieu d'une nouvelle demande. Les
 * marqueurs de contenu dicté sont les mêmes que la règle locale de
 * commandeLocale.ts pour reconnaître un message dicté ("pour dire",
 * "lui dire") ; l'article indéfini est un second signal, indépendant. */
function neDicteRienDeNouveau(phrase: string): boolean {
  if (/disant|pour (?:lui |leur )?dire|dis-lui|dis-leur/i.test(phrase)) return false
  if (NOUVEAU_MESSAGE.test(phrase)) return false
  return true
}

export function estConfirmationEnvoi(
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
