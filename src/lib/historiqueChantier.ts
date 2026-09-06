// Relatif avec extension : ce module est vérifié par
// `node --experimental-strip-types scripts/verifier-historique-chantier.ts`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { courtAuteur } from "./journalBord.ts"

/**
 * Ce qui a changé sur un chantier, dit en français.
 *
 * POURQUOI CE MODULE EXISTE. Le CLAUDE.md du projet porte cet avertissement,
 * écrit après coup : « Le 5 sept. puis le 6, deux notes ont été écrasées de
 * cette façon — l'une contenait un retour de Raphaël qui n'était écrit nulle
 * part ailleurs. » La parade était une consigne. Une consigne qu'aucun
 * mécanisme ne soutient finit par être oubliée : c'est arrivé deux fois en
 * deux jours.
 *
 * La trace est écrite par un TRIGGER (migration 0027), donc quel que soit le
 * chemin d'écriture. Ce module ne fait que la rendre lisible — et décider ce
 * qui mérite d'être montré, ce qui est le vrai risque : un historique où tout
 * se ressemble n'est pas lu, et ne sert donc à rien le jour où il faudrait.
 *
 * Pur : ni React, ni Supabase, ni réseau.
 */

export interface LigneHistorique {
  id: string
  item_id: string
  champ: string
  avant: string | null
  apres: string | null
  par: string | null
  change_at: string
}

const LIBELLE_STATUT: Record<string, string> = {
  todo: "à faire",
  in_progress: "en cours",
  done: "fait",
}

const LIBELLE_PRIORITE: Record<string, string> = {
  low: "basse",
  normal: "normale",
  high: "haute",
}

/** Ce qu'une ligne raconte, en une phrase, telle qu'elle s'affiche. */
export function phraseDuChangement(ligne: LigneHistorique): string {
  const qui = ligne.par ? `${courtAuteur(ligne.par)} a ` : ""
  switch (ligne.champ) {
    case "title":
      return `${qui}renommé le chantier`
    case "notes":
      // Le cas qui a motivé tout ça : une note remplacée par une plus COURTE
      // est presque toujours une note écrasée, pas une note complétée.
      return `${qui}${natureDeLaNote(ligne)} la note`
    case "status":
      return `${qui}passé le chantier en « ${LIBELLE_STATUT[ligne.apres ?? ""] ?? ligne.apres} »`
    case "priority":
      return `${qui}mis la priorité en « ${LIBELLE_PRIORITE[ligne.apres ?? ""] ?? ligne.apres} »`
    case "theme":
      return ligne.apres
        ? `${qui}rangé le chantier dans « ${ligne.apres} »`
        : `${qui}sorti le chantier de « ${ligne.avant} »`
    case "archived_at":
      return ligne.apres ? `${qui}archivé le chantier` : `${qui}rouvert le chantier`
    default:
      return `${qui}modifié « ${ligne.champ} »`
  }
}

/**
 * Une note a-t-elle été COMPLÉTÉE ou RÉÉCRITE ?
 *
 * C'est la seule distinction qui compte à l'usage. Une note qui grandit et qui
 * contient encore l'ancienne est une note complétée : il n'y a rien à
 * récupérer. Une note qui rétrécit, ou qui ne contient plus ce qu'il y avait,
 * est une note ÉCRASÉE — et c'est celle-là qu'il faut pouvoir rendre.
 */
export function noteEcrasee(ligne: LigneHistorique): boolean {
  if (ligne.champ !== "notes") return false
  const avant = (ligne.avant ?? "").trim()
  const apres = (ligne.apres ?? "").trim()
  if (!avant) return false
  return !apres.includes(avant)
}

function natureDeLaNote(ligne: LigneHistorique): string {
  if (!(ligne.avant ?? "").trim()) return "écrit"
  return noteEcrasee(ligne) ? "réécrit" : "complété"
}

/**
 * Combien de caractères la note a perdus. Zéro si elle a grandi.
 *
 * Le nombre est ce qui décide, à l'œil, si ça vaut la peine d'aller voir : une
 * note qui perd 40 caractères est une reformulation, une note qui en perd
 * 2 000 a effacé le travail de quelqu'un.
 */
export function caracteresPerdus(ligne: LigneHistorique): number {
  const avant = (ligne.avant ?? "").length
  const apres = (ligne.apres ?? "").length
  return Math.max(0, avant - apres)
}

/** Au-delà, l'app le signale d'elle-même : ce n'est plus une correction. */
export const PERTE_NOTABLE = 200

/**
 * Les réécritures qui méritent qu'on prévienne, les plus lourdes d'abord.
 *
 * Volontairement étroit. Un signal qui se déclenche à tort n'est plus lu du
 * tout — sa règle, écrite pour l'avertissement de doublon et valable ici.
 */
export function reecrituresNotables(lignes: LigneHistorique[]): LigneHistorique[] {
  return lignes
    .filter((l) => noteEcrasee(l) && caracteresPerdus(l) >= PERTE_NOTABLE)
    .sort((a, b) => caracteresPerdus(b) - caracteresPerdus(a))
}

/** L'heure d'un changement, courte, comme partout ailleurs dans le cockpit. */
export function quandCourt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "?"
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
