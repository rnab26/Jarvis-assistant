/**
 * Dans quel état est un chantier, en un mot — ce que Raphaël lit sur la ligne.
 *
 * SA DEMANDE, 7 sept. 2026 : « je n'ai aucune réelle confirmation que les
 * chantiers qui sont dedans où je réponds sont classifiés et sont envoyés à une
 * session afin qu'ils soient traités. » Il a choisi de le voir directement sur
 * la ligne, plutôt qu'une carte de plus (option A).
 *
 * POURQUOI CE FICHIER EXISTE PLUTÔT QU'UN CALCUL DANS LA CARTE. Cette
 * classification était déjà écrite, mais ENFOUIE dans la boucle de
 * `ouJenSuis.ts`, qui en tire quatre nombres par section. L'écrire une seconde
 * fois pour la pastille, c'est accepter qu'un jour la ligne dise « dort »
 * pendant que le résumé du haut le compte dans « bouge ». `ouJenSuis` appelle
 * donc cette fonction-ci : une seule lecture, deux affichages.
 *
 * ELLE NE DIT RIEN DE NEUF : tout se déduit de ce qui est déjà en base — la
 * réservation, `archived_at`, le marqueur de la note, les questions du journal.
 * Aucune colonne ajoutée, rien à saisir, rien qui puisse se désynchroniser.
 */
import { marqueurDe } from "./marqueurChantier.ts"
import type { DevItem } from "@/types/database"

export type EtatChantier =
  /** Archivé. */
  | "livre"
  /** Une session l'a réservé, et sa réservation court encore. */
  | "pris"
  /** Réservé, mais la réservation a expiré : personne n'est dessus, et
   *  pourtant aucune session ne le prendra tant qu'elle n'est pas rendue. */
  | "abandonne"
  /** Il attend une décision de Raphaël — marqueur, ou question sans réponse. */
  | "attend"
  /** Un marqueur dit qu'il n'est pas à prendre (bloqué, reporté, doublon).
   *  Ce n'est pas « il dort » : personne ne l'attend. */
  | "suspens"
  /** Ouvert, personne dessus, rien qui le bloque. */
  | "dort"

export interface EtatLu {
  etat: EtatChantier
  /** La session qui l'a pris, sans le préfixe « claude/ ». Seulement pour
   *  « pris » et « abandonne ». */
  session?: string
}

/** Le nom tel que Raphaël le lit dans « Prise par … ». */
export function nomCourtSession(session: string): string {
  return session.replace(/^claude\//, "")
}

/**
 * Un marqueur qui dit « ce chantier attend une décision de Raphaël » — SAUF
 * s'il a déjà eu le dernier mot dessus (chantier c612ccdc, 7 sept. 2026).
 *
 * Le marqueur est un texte statique en tête des notes : une session l'écrit
 * en posant la question, mais rien ne l'efface quand Raphaël répond — d'où
 * `dernierMessageEstLeSien`, vrai quand le dernier message du journal
 * rattaché à ce chantier est de lui (peu importe le kind). Tant que personne
 * ne reprend la parole après lui sans avoir retiré le marqueur, la décision
 * est prise pour l'instant ; si une session le fait, le chantier « revient »,
 * exactement comme il l'a demandé : « à partir du moment où j'ai répondu, ça
 * doit sortir des chantiers pour moi. Sauf si ça revient par la suite, si ce
 * chantier n'est pas terminé côté Claude Code. »
 *
 * Exportée : `ouJenSuis.ts` s'en sert aussi, pour la même raison que le reste
 * de ce fichier — une seule lecture, deux affichages.
 */
export function attendSaDecision(item: DevItem, dernierMessageEstLeSien = false): boolean {
  const m = marqueurDe(item)
  if (m !== "a_cadrer" && m !== "pour_raphael") return false
  return !dernierMessageEstLeSien
}

export function enSuspens(item: DevItem): boolean {
  const m = marqueurDe(item)
  return m === "bloque" || m === "reporte" || m === "doublon"
}

/**
 * L'ordre des tests compte, et il est le même que celui de `ouJenSuis` :
 * archivé d'abord, puis la réservation, puis ce qui l'attend, puis le reste.
 *
 * `aUneQuestionOuverte` vient du journal (`dev_log.item_id`, sans réponse) :
 * la carte du chantier l'a déjà sous la main, inutile de la recalculer ici.
 * `dernierMessageEstLeSien` sert au marqueur — voir `attendSaDecision`.
 */
export function etatChantier(
  item: DevItem,
  maintenant: number = Date.now(),
  aUneQuestionOuverte = false,
  dernierMessageEstLeSien = false,
): EtatLu {
  if (item.archived_at) return { etat: "livre" }

  const expire = item.claim_expires_at ? new Date(item.claim_expires_at).getTime() : null
  const reserve = Boolean(item.claimed_by) && expire !== null && !Number.isNaN(expire)
  if (reserve) {
    const session = nomCourtSession(item.claimed_by!)
    return { etat: expire! > maintenant ? "pris" : "abandonne", session }
  }

  if (attendSaDecision(item, dernierMessageEstLeSien) || aUneQuestionOuverte) return { etat: "attend" }
  if (enSuspens(item)) return { etat: "suspens" }
  if (item.status === "done") return { etat: "suspens" }
  return { etat: "dort" }
}

/**
 * Ce qui s'affiche sur la ligne. `null` = on n'affiche RIEN, et c'est voulu
 * dans deux cas :
 *
 * - « suspens » : le marqueur de la note est DÉJÀ affiché en étiquette sur la
 *   ligne (« BLOQUÉ PAR … », « REPORTÉ »). Une pastille de plus dirait la même
 *   chose deux fois.
 * - « attend » : la carte « Ce qui attend ta décision » le porte déjà en tête
 *   du cockpit, et la colonne « pour toi » le compte. C'est sa plainte du
 *   5 sept. — « je ne sais plus où mettre le nez » — et on n'y répond pas en
 *   répétant la même information à trois endroits.
 *
 * Il reste donc les trois états qu'il ne pouvait voir NULLE PART : est-ce que
 * quelqu'un est dessus, est-ce que c'est resté en plan, est-ce que c'est fini.
 */
export function pastilleDe(lu: EtatLu): { texte: string; ton: "bouge" | "alerte" | "fini" } | null {
  switch (lu.etat) {
    case "pris":
      return { texte: lu.session ? `prise par ${lu.session}` : "prise", ton: "bouge" }
    case "abandonne":
      return { texte: lu.session ? `laissée par ${lu.session}` : "laissée en plan", ton: "alerte" }
    case "livre":
      return { texte: "livré", ton: "fini" }
    default:
      return null
  }
}
