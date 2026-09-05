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
  /** Chantiers archivés depuis la dernière visite : le travail rendu. */
  livres: DevItem[]
  /** Chantiers créés depuis : ce qu'une session a ouvert en travaillant. */
  nouveaux: DevItem[]
  /** Messages des sessions, hors les siens : ce qu'on lui a écrit. */
  messages: DevLogEntry[]
  /** Vrai s'il y a quelque chose à annoncer. */
  quelqueChose: boolean
}

/** Ce que Raphaël écrit lui-même ne compte pas comme du nouveau pour lui. */
const AUTEUR_RAPHAEL = "Raphaël"

export function depuisDerniereVisite(
  items: DevItem[],
  messages: DevLogEntry[],
  depuisISO: string | null,
): DepuisDerniereVisite {
  const vide = { livres: [], nouveaux: [], messages: [], quelqueChose: false }
  if (!depuisISO) return vide

  const depuis = new Date(depuisISO).getTime()
  // Une date illisible ne doit pas faire passer TOUT le cockpit pour nouveau.
  if (Number.isNaN(depuis)) return vide

  const apres = (iso: string | null) => !!iso && new Date(iso).getTime() > depuis

  const livres = items.filter((i) => apres(i.archived_at))
  const nouveaux = items.filter((i) => !i.archived_at && apres(i.created_at))
  const nouveauxMessages = messages.filter(
    (m) => apres(m.created_at) && m.author !== AUTEUR_RAPHAEL,
  )

  return {
    livres,
    nouveaux,
    messages: nouveauxMessages,
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
