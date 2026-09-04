// Relatif avec extension : vérifiable sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { motsUtiles } from "./suggestionTheme.ts"
import { normaliserRecherche } from "./sections.ts"
import type { DevItem } from "@/types/database"

/**
 * « Ça existe déjà » : les chantiers proches de ce qu'on est en train
 * d'écrire.
 *
 * POURQUOI. Raphaël dicte ses chantiers au fil de l'eau, souvent en marchant,
 * et redemande la même chose à quelques jours d'intervalle sans s'en souvenir.
 * La base en porte la trace : plusieurs chantiers commencent par
 * « [DOUBLON — traité par… ] », écrits à la main par des sessions qui l'ont
 * découvert après coup. Et le cas coûteux n'est pas le doublon entre deux
 * chantiers ouverts — celui-là se voit — c'est le chantier DÉJÀ LIVRÉ qu'on
 * redemande : une session le reprend de zéro, refait ce qui existe, et parfois
 * défait au passage ce qui marchait.
 *
 * Les outils de suivi montrent tous les tickets proches au moment où on en
 * ouvre un. C'est ce que fait ce module — localement, sans appel au modèle,
 * pendant la frappe.
 *
 * CE QU'IL SAIT FAIRE, ET CE QU'IL NE SAIT PAS. Il compare des MOTS. Deux
 * demandes qui disent la même chose avec un vocabulaire différent
 * (« retrouver une conversation passée » et « mémoire longue durée ») ne se
 * ressemblent pas pour lui, et il ne les signalera pas. Il ne remplace donc
 * pas la lecture du cockpit : il attrape la redite littérale, qui est le cas
 * fréquent, et il se tait le reste du temps plutôt que d'alerter à tort.
 */

export interface ChantierProche {
  item: DevItem
  /** Entre 0 et 1 : la part de vocabulaire commun. */
  score: number
  /** Les mots partagés, affichés pour que la ressemblance se juge d'un œil. */
  motsCommuns: string[]
}

/** En dessous, deux textes se croisent par hasard (un « micro » commun). */
const SEUIL = 0.34

/** Un titre trop court n'a pas assez de mots pour qu'on compare quoi que ce
 * soit : deux mots communs sur deux suffiraient à crier au doublon. */
const MOTS_MINIMUM = 2

/**
 * Les chantiers qui ressemblent au texte en cours de saisie, le plus proche
 * en premier. Les archivés sont inclus — c'est même le cas le plus utile.
 */
export function chantiersProches(
  texte: string,
  items: DevItem[],
  limite = 3,
): ChantierProche[] {
  const mots = new Set(motsUtiles(texte))
  if (mots.size < MOTS_MINIMUM) return []

  const propre = normaliserRecherche(texte)

  return items
    .map((item) => {
      const motsItem = new Set(motsUtiles(`${item.title} ${item.notes ?? ""}`))
      const motsTitre = new Set(motsUtiles(item.title))
      if (motsTitre.size === 0) return null

      const communsTitre = [...mots].filter((m) => motsTitre.has(m))
      const communs = [...mots].filter((m) => motsItem.has(m))

      // Rapporté au plus court des deux : « réveil vocal Jarvis » saisi seul
      // doit retrouver « Réveil vocal "Jarvis" en arrière-plan (écran
      // éteint) », dont le titre est bien plus long.
      const base = Math.min(mots.size, motsTitre.size)
      let score = communsTitre.length / base
      // Le titre porte le sujet ; la note ne vient qu'appuyer.
      if (communs.length > communsTitre.length) score += 0.08

      // Une redite mot pour mot, à la ponctuation près : c'est le même.
      if (propre.includes(normaliserRecherche(item.title))) score = 1

      return { item, score: Number(score.toFixed(3)), motsCommuns: communsTitre }
    })
    .filter((p): p is ChantierProche => p !== null && p.score >= SEUIL)
    .sort(
      (a, b) =>
        b.score - a.score ||
        // À ressemblance égale, ce qui est DÉJÀ LIVRÉ passe devant : c'est
        // l'information qui change le plus ce qu'on va faire.
        Number(!!b.item.archived_at) - Number(!!a.item.archived_at),
    )
    .slice(0, limite)
}
