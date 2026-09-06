// Relatif avec extension : ce module se vérifie sous
// `node --experimental-strip-types`, qui ne connaît pas l'alias « @/ ».
import { estPourRaphael } from "./journalDestinataire.ts"
import type { DevItem, DevLogEntry } from "@/types/database"

/**
 * Ce qui a bougé dans le cockpit depuis la dernière fois qu'il l'a regardé.
 *
 * POURQUOI. Raphaël ouvre trois ou quatre sessions Claude Code et s'absente —
 * une nuit, une journée. Il revient sur un cockpit où douze chantiers ont été
 * livrés, trois autres sont apparus, et deux sessions attendent une réponse.
 * Rien ne le lui disait : il fallait comparer de tête avec ce qu'il avait vu
 * la veille. C'est la première chose que montre n'importe quel outil de suivi
 * quand on revient — « depuis votre dernière visite ».
 *
 * La date de la dernière visite est propre à l'appareil (voir
 * `STOCKAGE_LOCAL_ASSUME` dans reglages.ts) : ce n'est pas une préférence à
 * retrouver ailleurs, c'est un repère de lecture sur CET écran.
 *
 * Aucun réseau, aucun calcul coûteux : vérifié par
 * `scripts/verifier-depuis-derniere-visite.ts`.
 */

export interface DepuisDerniereVisite {
  /** D'où on compte, et comment le dire : « ton dernier passage » quand le
   * repère vient de cet écran, « ton dernier message » quand il est déduit du
   * journal faute de repère. */
  origine: "passage" | "message"
  depuis: string | null
  /** Chantiers archivés depuis la dernière visite : le travail rendu. */
  livres: DevItem[]
  /** Chantiers créés depuis : ce qu'une session a ouvert en travaillant. */
  nouveaux: DevItem[]
  /**
   * Ce qu'on lui a écrit À LUI : une question, un blocage, une action de son
   * côté. Même règle que le badge du journal et que la colonne « pour toi » de
   * « Où j'en suis » — `estPourRaphael`, jamais une seconde lecture.
   */
  messages: DevLogEntry[]
  /**
   * Les notes que les sessions s'écrivent ENTRE ELLES, comptées et pas
   * déballées.
   *
   * MESURÉ SUR SES VRAIES DONNÉES le 6 sept. : les deux messages que le
   * bandeau dépliait faisaient 2 000 et 2 500 caractères — des comptes rendus
   * techniques d'une session à l'autre. Ils occupaient les deux lignes les
   * plus précieuses de l'écran, juste sous « 14 livrés », et c'est
   * exactement le matin où il a dit ne pas arriver à savoir ce qui avait
   * bougé. Ce qui ne lui est pas adressé se compte, il ne se déballe pas.
   */
  notesEntreSessions: number
  /** Vrai s'il y a quelque chose à annoncer. */
  quelqueChose: boolean
}

/**
 * Ce que Raphaël écrit lui-même ne compte pas comme du nouveau pour lui — et
 * ses messages sont signés de deux façons : « Raphaël » quand il écrit depuis
 * l'app, « raphael (via claude/… ) » quand une session relaie ses mots. Les
 * deux sont de lui ; ne reconnaître que le premier ferait passer sa propre
 * consigne pour un message d'une session, et raterait le repère le plus utile.
 */
function estDeRaphael(auteur: string): boolean {
  return auteur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .startsWith("raphael")
}

export function depuisDerniereVisite(
  items: DevItem[],
  messages: DevLogEntry[],
  depuisISO: string | null,
): DepuisDerniereVisite {
  const vide: DepuisDerniereVisite = {
    origine: "passage",
    depuis: null,
    livres: [],
    nouveaux: [],
    messages: [],
    notesEntreSessions: 0,
    quelqueChose: false,
  }

  // Aucun repère sur cet écran — première ouverture, ou stockage effacé. Son
  // dernier message dans le journal en est un, et c'en est même un bon : il
  // date d'un moment où il regardait le cockpit. Sans ce rattrapage, la
  // première ouverture n'annonce jamais rien, et c'est justement l'ouverture
  // qui suit une absence.
  const origine: "passage" | "message" = depuisISO ? "passage" : "message"
  const repere =
    depuisISO ??
    messages
      .filter((m) => estDeRaphael(m.author))
      .map((m) => m.created_at)
      .sort()
      .at(-1) ??
    null
  if (!repere) return vide

  const depuis = new Date(repere).getTime()
  // Une date illisible ne doit pas faire passer TOUT le cockpit pour nouveau.
  if (Number.isNaN(depuis)) return vide

  const apres = (iso: string | null) => !!iso && new Date(iso).getTime() > depuis

  const livres = items.filter((i) => apres(i.archived_at))
  const nouveaux = items.filter((i) => !i.archived_at && apres(i.created_at))
  const nouveauxMessages = messages.filter((m) => apres(m.created_at) && !estDeRaphael(m.author))
  const pourLui = nouveauxMessages.filter(estPourRaphael)

  return {
    origine,
    depuis: repere,
    livres,
    nouveaux,
    messages: pourLui,
    notesEntreSessions: nouveauxMessages.length - pourLui.length,
    // Les notes entre sessions comptent pour « il s'est passé quelque chose » :
    // les taire complètement laisserait un bandeau vide un jour où trois
    // sessions ont travaillé toute la nuit.
    quelqueChose: livres.length + nouveaux.length + nouveauxMessages.length > 0,
  }
}

/** « il y a 3 h », « hier », « il y a 2 jours » — pour dire de quand on parle. */
export function depuisQuand(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`
  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  const jours = Math.round(heures / 24)
  return jours === 1 ? "hier" : `il y a ${jours} jours`
}
