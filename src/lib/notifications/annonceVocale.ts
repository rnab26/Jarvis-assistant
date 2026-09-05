import { dansLaPlageSilencieuse } from "./plan.ts"
import type { PrefsNotifications } from "./prefs.ts"

/**
 * Ce que Jarvis DIT quand une de ses notifications arrive — au lieu de se
 * contenter de l'afficher.
 *
 * Demande de Raphaël (chantier 7567cd47, ses mots) : « dans la pratique
 * Jarvis doit pouvoir intervenir à l'oral peu importe le moment pour donner
 * une information tel un rappel ». La moitié « notification » a été livrée le
 * 4 sept. ; il restait la voix. Un rappel arrivait, s'affichait, et Jarvis
 * restait muet.
 *
 * CE QUI EST COUVERT ICI, ET SEULEMENT ÇA : l'app est ouverte quand la
 * notification arrive, ou il vient d'appuyer dessus. Parler quand l'app est
 * FERMÉE demanderait un service Android au premier plan — une notification
 * permanente dans la barre d'état, de la batterie — et c'est une décision qui
 * lui revient, pas une que je prends seul.
 *
 * Pur, sans Android ni React : c'est ici que vivent les décisions qui peuvent
 * être fausses en silence (parler la nuit, parler alors que la voix est
 * coupée, répéter deux fois la même phrase). Vérifié par
 * `scripts/verifier-notifications.ts`.
 */

/** Ce que le plugin nous donne d'une notification, réduit à ce qu'on lit. */
export interface NotifRecue {
  title?: string | null
  body?: string | null
}

export interface ContexteAnnonce {
  prefs: PrefsNotifications
  /** La voix de Jarvis est coupée dans les réglages : on n'annonce rien. */
  voixCoupee: boolean
  maintenant: Date
}

/** Au-delà, ce n'est plus une annonce, c'est une lecture — et le point du
 * matin d'une journée chargée dépasserait la minute. */
const LONGUEUR_MAX = 600

function propre(texte: string | null | undefined): string {
  return (texte ?? "").replace(/\s+/g, " ").trim()
}

/**
 * POURQUOI Jarvis se tait, quand il se tait — ou null s'il va parler.
 *
 * Rendue à part pour être ÉCRITE DANS LE JOURNAL D'ÉCOUTE. Sans ça, une
 * annonce muette sur le téléphone de Raphaël est indistinguable, vue d'ici,
 * d'une annonce qui n'a jamais été déclenchée : le pont Android ne se vérifie
 * pas depuis une machine sans téléphone, et « ça n'a pas parlé » n'aurait
 * aucune cause lisible. C'est la même règle que partout dans ce projet : une
 * panne ne doit pas se lire comme une absence.
 */
export type RaisonSilence = "desactive" | "voix_coupee" | "heures_de_silence" | "rien_a_dire"

export function raisonDuSilence(notif: NotifRecue, ctx: ContexteAnnonce): RaisonSilence | null {
  if (!ctx.prefs.direAVoixHaute) return "desactive"
  if (ctx.voixCoupee) return "voix_coupee"
  if (dansLaPlageSilencieuse(ctx.maintenant, ctx.prefs)) return "heures_de_silence"
  if (!propre(notif.title) && !propre(notif.body)) return "rien_a_dire"
  return null
}

/**
 * La phrase à dire, ou null pour se taire.
 *
 * Les quatre raisons de se taire, dans cet ordre :
 *   1. il ne veut pas qu'on parle (l'interrupteur de Paramètres) ;
 *   2. la voix de Jarvis est coupée — ce réglage-là vaut pour tout ;
 *   3. on est dans ses heures de silence : la notification s'affiche, elle ne
 *      se dit pas. Même quand il vient d'appuyer dessus — s'il est réveillé à
 *      3 h du matin, il lit, il n'a pas besoin qu'on parle à côté de lui ;
 *   4. il n'y a rien à dire.
 */
export function phraseAnnonce(notif: NotifRecue, ctx: ContexteAnnonce): string | null {
  if (raisonDuSilence(notif, ctx)) return null

  const titre = propre(notif.title)
  const corps = propre(notif.body)

  // Le corps répète souvent le titre (« Appeler le plombier » / « Appeler le
  // plombier, c'est l'heure ») : le dire deux fois de suite s'entend.
  const phrase =
    !corps || corps === titre
      ? titre
      : !titre || corps.startsWith(titre)
        ? corps
        : `${titre}. ${corps}`

  return phrase.length > LONGUEUR_MAX ? `${phrase.slice(0, LONGUEUR_MAX - 1).trimEnd()}…` : phrase
}
