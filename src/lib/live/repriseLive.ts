/**
 * UNE FERMETURE SUBIE NE DOIT PAS FINIR LA CONVERSATION (chantier dde25deb).
 *
 * Ce qui a été MESURÉ, et rien de plus : `journal_ecoute` porte deux
 * fermetures de session Live avec exactement le même message, indépendantes
 * l'une de l'autre — le 10 sept. 2026 à 20:20:24 UTC après 12,9 s, et le
 * 15 sept. à 06:33:25 après 48,5 s, celle-là capture à l'appui, en plein
 * milieu d'une correction de tâche :
 *
 *     Session fermée : Internal error occurred.
 *
 * LA CAUSE N'EST PAS ÉTABLIE et ce module ne prétend pas la connaître : le
 * message vient tel quel de la fermeture côté Google, pas de notre code. Deux
 * points ne font pas une mesure, et les deux occurrences n'ont en commun ni la
 * durée ni la nature des commandes qui précèdent.
 *
 * MAIS CE QUI SE PASSE ENSUITE EST À NOUS. `maintenirSessionLive` promet « une
 * conversation qui dure » et rouvre déjà la session quand Google la ferme à la
 * limite des quinze minutes. Une fermeture qui porte une RAISON, elle,
 * arrêtait tout : Raphaël se retrouvait devant un cœur éteint, au milieu d'une
 * phrase, et devait rappuyer. Une panne transitoire d'un service tiers n'a pas
 * à coûter la conversation.
 *
 * TROIS BORNES, ET IL FAUT LES TROIS. Sans elles on échangerait une
 * conversation coupée contre une boucle de reconnexions qui ne dit rien :
 *
 *  1. ON NE ROUVRE QUE CE QUI S'ÉTAIT VRAIMENT OUVERT. Une ouverture qui
 *     échoue (jeton refusé, micro tenu par une autre application) ferme AUSSI
 *     avec une raison. La rejouer, c'est répéter le même échec en boucle en
 *     cachant le message qui l'explique — exactement la panne muette que tout
 *     le projet cherche à éviter.
 *  2. DEUX REPRISES APRÈS PANNE, PAS PLUS, et ce compteur est distinct de
 *     celui des reconnexions normales : ces dernières sont le fonctionnement
 *     attendu de Google (une toutes les quinze minutes), on ne veut pas qu'un
 *     quart d'heure de conversation consomme le droit de survivre à une panne,
 *     ni l'inverse.
 *  3. QUAND ON RENONCE, ON LE DIT, et on dit qu'on a essayé. « Session fermée »
 *     après trois tentatives silencieuses se lit comme une panne unique : il
 *     rappuierait pour rien. C'est la règle d'honnêteté du projet appliquée à
 *     notre propre code.
 *
 * ET UNE SEULE DÉCISION POUR LES DEUX ENDROITS QUI LA PRENAIENT. Elle était
 * écrite deux fois dans `maintenirSessionLive` : une première dans `onEtat`,
 * pour savoir s'il faut avaler le « fermee » et laisser le cœur sur
 * « connexion », une seconde après `await courante.finie`, pour savoir s'il
 * faut reboucler. Elles sont d'accord aujourd'hui parce que quelqu'un les a
 * tenues alignées à la main ; le jour où elles divergent, le cœur reste sur
 * « connexion » devant une session qui ne rouvrira jamais, et personne ne le
 * voit. Les deux appellent donc `deciderReprise`.
 */

/** Google ferme une session audio au bout de quinze minutes (doc Live). On en
 * rouvre une sans que ça se voie, tant que c'est lui qui a coupé. */
export const RECONNEXIONS_MAX = 12

/** En dessous, une fermeture SANS raison n'est pas la limite des quinze
 * minutes : c'est une panne, et on ne la rejoue pas. */
export const DUREE_MIN_POUR_RECONNECTER_MS = 30000

/** Combien de fois on survit à une fermeture qui porte une raison, dans une
 * même conversation. Deux : assez pour traverser un hoquet du service de
 * Google, trop peu pour boucler sur une panne installée. */
export const REPRISES_APRES_PANNE_MAX = 2

export interface Fermeture {
  /** La raison telle qu'elle est remontée. Absente quand la session s'est
   * close sans rien dire — c'est la forme de la limite des quinze minutes. */
  raison?: string
  /** Vrai quand c'est Raphaël qui a clos : appui sur le cœur, ou « terminé »
   * à la voix. Sa décision est définitive, on ne la rattrape jamais. */
  parRaphael: boolean
  /** Vrai seulement si cette session s'était vraiment ouverte — le micro pris,
   * `live_debut` écrit, Jarvis en écoute. Voir la borne 1. */
  ouverte: boolean
  /** Ce que la session a tenu. */
  dureeMs: number
  /** Reprises déjà faites dans cette conversation, toutes causes confondues. */
  reprises: number
  /** Celles qui l'ont été après une fermeture avec raison. Sous-ensemble du
   * compteur précédent, tenu à part : voir la borne 2. */
  reprisesApresPanne: number
  /** Raphaël a demandé l'arrêt pendant qu'on décidait. */
  arretDemande: boolean
}

export type Reprise =
  /** On rouvre. `apresPanne` dit lequel des deux compteurs avance. */
  | { reprendre: true; apresPanne: boolean }
  /** On s'arrête. `message` est ce que Raphaël doit lire — `undefined` quand
   * il n'y a rien à dire (c'est lui qui a fermé, ou la limite est atteinte
   * sans qu'aucune panne ne soit survenue). */
  | { reprendre: false; message?: string }

/**
 * Faut-il rouvrir la session ? Pure : aucun réseau, aucune horloge, aucun
 * état caché — tout ce qui décide est dans `f`.
 */
export function deciderReprise(f: Fermeture): Reprise {
  // Sa décision d'abord : ni un arrêt demandé ni une clôture volontaire ne se
  // rattrapent, quoi qu'il se soit passé par ailleurs.
  if (f.arretDemande || f.parRaphael) return { reprendre: false }

  if (f.raison) {
    // Borne 1 : une ouverture qui n'a jamais abouti ne se rejoue pas.
    if (!f.ouverte) return { reprendre: false, message: f.raison }
    // Borne 2, puis borne 3.
    if (f.reprisesApresPanne >= REPRISES_APRES_PANNE_MAX || f.reprises >= RECONNEXIONS_MAX) {
      return { reprendre: false, message: messageApresReprises(f.raison, f.reprisesApresPanne) }
    }
    return { reprendre: true, apresPanne: true }
  }

  // Sans raison : la limite des quinze minutes, et elle seule. Une session qui
  // tombe en moins de trente secondes sans rien dire est une panne muette.
  if (f.dureeMs < DUREE_MIN_POUR_RECONNECTER_MS || f.reprises >= RECONNEXIONS_MAX) {
    return { reprendre: false }
  }
  return { reprendre: true, apresPanne: false }
}

/**
 * Ce qu'on dit en renonçant. Taire les tentatives ferait lire trois pannes
 * comme une seule : il rappuierait sur le cœur pour retomber dessus.
 */
export function messageApresReprises(raison: string, reprisesApresPanne: number): string {
  if (reprisesApresPanne <= 0) return raison
  const fois = reprisesApresPanne === 1 ? "une fois" : `${reprisesApresPanne} fois`
  return `${raison} J'ai rouvert la conversation ${fois} et elle s'est refermée pareil : ce n'est pas toi, c'est le service vocal.`
}
