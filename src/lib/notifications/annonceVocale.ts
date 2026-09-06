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
  /** L'app est à l'écran en ce moment : il s'en sert. */
  appVisible?: boolean
  /** Quand il a parlé à Jarvis pour la dernière fois, si on le sait. */
  derniereParole?: Date | null
}

/**
 * Combien de temps « il vient de me parler » reste vrai.
 *
 * Quinze minutes, et le choix se raisonne à partir de SA phrase type :
 * « rappelle-moi dans dix minutes ». Un délai de dix minutes tomberait
 * exactement sur la limite et raterait le cas qu'il décrit ; en dessous, le
 * rappel qu'il vient de demander sortirait muet. Au-delà, on parlerait la
 * nuit longtemps après qu'il a reposé le téléphone — ce que les heures de
 * silence existent justement pour éviter.
 */
export const DELAI_USAGE_MS = 15 * 60 * 1000

/**
 * Est-il en train de s'en servir ?
 *
 * Sa demande du 6 sept. 2026 : « si on l'utilise pour lancer une action, il
 * faudrait que ça marche ». Les heures de silence protègent son sommeil, pas
 * son attention : elles taisent ce que Jarvis INITIE pendant qu'il ne s'en
 * sert pas, jamais ce qu'il a demandé.
 *
 * Deux signes, l'un OU l'autre : l'app est à l'écran, ou il a parlé à Jarvis
 * il y a moins de quinze minutes. Pas d'autre : « le téléphone est déverrouillé »
 * ou « il a bougé » diraient qu'il est réveillé, pas qu'il attend une réponse
 * de Jarvis.
 */
export function ilSenSertMaintenant(ctx: ContexteAnnonce): boolean {
  if (!ctx.prefs.silenceLeveParUsage) return false
  if (ctx.appVisible) return true
  if (!ctx.derniereParole) return false
  const depuis = ctx.maintenant.getTime() - ctx.derniereParole.getTime()
  // Une date dans le futur (horloge décalée, valeur aberrante) ne doit pas
  // lever le silence pour toujours.
  return depuis >= 0 && depuis <= DELAI_USAGE_MS
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
  // Les heures de silence ne s'appliquent QUE s'il ne s'en sert pas. Sa
  // demande du 6 sept. : un rappel qu'il vient de demander doit se dire, même
  // à 23 h. La plage elle-même n'est pas touchée — elle reste juste, et son
  // passage par minuit est protégé par son propre contrôle.
  if (dansLaPlageSilencieuse(ctx.maintenant, ctx.prefs) && !ilSenSertMaintenant(ctx)) {
    return "heures_de_silence"
  }
  if (!propre(notif.title) && !propre(notif.body)) return "rien_a_dire"
  return null
}

/**
 * La phrase à dire, ou null pour se taire.
 *
 * Les quatre raisons de se taire, dans cet ordre :
 *   1. il ne veut pas qu'on parle (l'interrupteur de Paramètres) ;
 *   2. la voix de Jarvis est coupée — ce réglage-là vaut pour tout ;
 *   3. on est dans ses heures de silence ET il ne s'en sert pas : la
 *      notification s'affiche, elle ne se dit pas. S'il s'en sert — app à
 *      l'écran, ou il vient de parler à Jarvis — elle se dit normalement.
 *      C'est sa demande du 6 sept. 2026, et elle REMPLACE la règle
 *      précédente, qui se taisait même quand il venait d'appuyer dessus :
 *      les heures de silence protègent son sommeil, pas son attention ;
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
