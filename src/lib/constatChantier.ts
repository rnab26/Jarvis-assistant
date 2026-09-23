// Relatif avec extension : ce module doit se vérifier sous
// `node --experimental-strip-types`, qui ne connaît pas l'alias « @/ » de Vite.
import { marqueurDe, marqueurDeCrochet } from "./marqueurChantier.ts"
import type { DevItem } from "@/types/database"

/**
 * Répondre sur un chantier « à constater » (chantier 56b1a074, 23 sept. 2026).
 *
 * SA PHRASE : « Impossible de répondre aux chantiers classés par catégorie
 * avec l'étiquette "à constater" dans le cockpit, contrairement à ce qui est
 * prévu pour les sessions Claude Code. Je peux seulement cliquer et voir
 * l'historique. »
 *
 * Le champ « Envoyer à la session » existait bien sur chaque chantier, mais il
 * n'y avait RIEN au bout : sa réponse partait dans le journal, le chantier
 * restait « à constater », et une confirmation comme « Ca marche tres bien »
 * (17 sept., 93f6ee23) n'a jamais fait archiver quoi que ce soit — c'est
 * mot pour mot sa seconde plainte du matin, fa209b63 (« les chantiers ne sont
 * pas mis à jour quand les sessions terminent »).
 *
 * Ce module calcule la NOTE qui suit sa réponse, et rien d'autre : pur, sans
 * réseau, vérifié par `scripts/verifier-constat-chantier.ts`. L'écriture, elle,
 * passe par `constater_chantier` (migration 0053), d'un seul bloc.
 *
 * DEUX RÈGLES DU PROJET, tenues ici :
 * - « N'écrase jamais une note, ajoute en bas » : sa réponse s'AJOUTE, et le
 *   paragraphe qu'elle forme devient la « dernière mise à jour » affichée
 *   (`derniereMajChantier`).
 * - « Change le CROCHET D'EN-TÊTE, pas seulement le corps » (CLAUDE.md, 18
 *   sept.) : `marqueurDe` ne lit que les crochets du haut. Sans ça, un
 *   chantier qu'il vient de déclarer cassé resterait affiché « à constater »,
 *   et aucune session ne le reprendrait.
 */

export type Verdict = "marche" | "ne_marche_pas"

/** Le crochet qui ouvre la note, lu en comptant les crochets imbriqués. */
export interface CrochetEnTete {
  /** Ce qui est entre le premier « [ » et le « ] » qui le referme. */
  contenu: string
  /** L'index juste après le « ] » fermant, dans la note d'origine. */
  fin: number
  /** Vrai s'il contient lui-même un crochet (« [LIBRE — … (voir [CADRE] …)] »). */
  imbrique: boolean
}

/**
 * Le premier crochet de la note, s'il l'ouvre.
 *
 * PAS la regex de `marqueurDe` (`^\[([^\]]*)\]`), qui s'arrête au premier
 * « ] » venu : le 18 sept., un crochet qui en contenait un autre a été coupé
 * au mauvais endroit par une regex naïve, et il a fallu le réparer à la main
 * (CLAUDE.md, « À LA MAIN, jamais par une regex automatique »). Ici on compte.
 */
export function crochetEnTete(notes: string): CrochetEnTete | null {
  const debut = notes.length - notes.trimStart().length
  if (notes[debut] !== "[") return null
  let profondeur = 0
  let imbrique = false
  for (let i = debut; i < notes.length; i++) {
    const c = notes[i]
    if (c === "[") {
      profondeur++
      if (profondeur > 1) imbrique = true
    } else if (c === "]") {
      profondeur--
      if (profondeur === 0) {
        return { contenu: notes.slice(debut + 1, i), fin: i + 1, imbrique }
      }
    }
  }
  return null // jamais refermé : on ne touche à rien
}

/** « 23/09/2026 » — dans un crochet, court et sans ambiguïté. */
function dateCourte(date: Date): string {
  const jj = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  return `${jj}/${mm}/${date.getFullYear()}`
}

/**
 * Le nouveau crochet d'en-tête.
 *
 * « Ça marche » : un crochet qu'AUCUNE session ne prend pour un marqueur — le
 * chantier est archivé, il n'y a plus rien à faire.
 * « Ça ne marche pas » : `[LIBRE …]`, pour que la session suivante le reprenne
 * tout de suite. Le périmètre avait été tranché AVANT la livraison ; ce qui
 * manque maintenant, c'est ce qu'il vient de dire, et c'est écrit en bas. Les
 * sujets qu'une session autonome ne prend jamais (contrôle du téléphone,
 * messages en son nom…) restent filtrés par `passeAutonome.ts`, pas ici.
 */
export function enteteConstat(verdict: Verdict, date: Date): string {
  return verdict === "marche"
    ? `[CONSTATÉ PAR RAPHAËL LE ${dateCourte(date)} — ÇA MARCHE]`
    : `[LIBRE — RETOUR DE RAPHAËL LE ${dateCourte(date)} : ÇA NE MARCHE PAS, voir en bas]`
}

/**
 * Ses mots, prêts à tenir dans UN paragraphe.
 *
 * `derniereMajChantier` coupe les notes aux lignes VIDES : un commentaire
 * de deux paragraphes ferait que seule sa seconde moitié s'afficherait comme
 * « dernière mise à jour ». On garde les retours à la ligne, pas les vides.
 */
export function parolesSurUnParagraphe(paroles: string): string {
  return paroles
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
}

/** Le paragraphe ajouté en bas de la note : daté, et avec ses mots. */
export function paragrapheConstat(verdict: Verdict, paroles: string, date: Date): string {
  const quand = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  const texte = parolesSurUnParagraphe(paroles)
  const tete =
    verdict === "marche"
      ? `--- ${quand}, RETOUR DE RAPHAËL DEPUIS LE COCKPIT : ÇA MARCHE. Constaté sur son téléphone, chantier archivé.`
      : `--- ${quand}, RETOUR DE RAPHAËL DEPUIS LE COCKPIT : ÇA NE MARCHE PAS. À reprendre à partir de ses mots.`
  return texte ? `${tete}\nSes mots : « ${texte} »` : tete
}

/**
 * La note complète après sa réponse.
 *
 * Le crochet « à constater » du haut est REMPLACÉ quand on sait le faire sans
 * risque (un crochet simple, non imbriqué, qui porte bien ce marqueur). Sinon
 * le nouveau crochet est posé AU-DESSUS, séparé par une ligne de texte :
 * `marqueurDe` lit les deux premiers crochets COLLÉS, et « reste à
 * constater » l'emporterait sur « libre » s'ils se suivaient. La ligne de
 * texte les sépare, et l'ancien crochet reste lisible tel qu'il était.
 */
export function notesApresConstat(
  notes: string | null,
  verdict: Verdict,
  paroles: string,
  date: Date,
): string {
  const base = notes ?? ""
  const entete = enteteConstat(verdict, date)
  const crochet = crochetEnTete(base)

  let corps: string
  if (crochet && !crochet.imbrique && marqueurDeCrochet(crochet.contenu) === "a_constater") {
    corps = entete + base.slice(crochet.fin)
  } else if (base.trim()) {
    corps = `${entete}\n(le crochet d'avant est gardé tel quel ci-dessous)\n\n${base.trimStart()}`
  } else {
    corps = entete
  }

  return `${corps.trimEnd()}\n\n\n${paragrapheConstat(verdict, paroles, date)}`
}

/**
 * Les chantiers qui attendent son essai, dans l'ordre où on les lui propose :
 * la priorité haute d'abord, puis le plus ancien — celui qui attend depuis le
 * plus longtemps est celui qu'on a le plus de chances d'avoir oublié.
 *
 * Même lecture que l'étiquette de la ligne (`marqueurDe`) : c'est elle que la
 * colonne « pour toi » compte déjà, et deux lectures finiraient par ne plus
 * annoncer le même nombre. Une ligne encore dans la file hors ligne n'a pas
 * d'id en base : on ne peut pas y répondre, elle n'y est pas.
 */
export function chantiersAConstater<T extends DevItem>(items: T[]): T[] {
  const rang = { high: 0, normal: 1, low: 2 } as const
  return items
    .filter((i) => !i.archived_at && !i.enAttente && marqueurDe(i) === "a_constater")
    .sort(
      (a, b) =>
        rang[a.priority] - rang[b.priority] || a.created_at.localeCompare(b.created_at),
    )
}
