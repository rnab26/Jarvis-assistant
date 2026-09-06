// Relatif avec extension : vérifiable sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { motsUtiles } from "./suggestionTheme.ts"
import type { DevItem } from "@/types/database"

/**
 * Les doublons DÉJÀ dans la base — pas ceux qu'on est en train d'écrire.
 *
 * `doublonChantier.ts` prévient pendant la frappe, dans la fenêtre d'envoi.
 * Mais un chantier dicté à la voix ne passe pas par cette fenêtre : il arrive
 * directement en base. C'est comme ça qu'au 5 sept. 2026 deux chantiers
 * strictement identiques cohabitaient — « Sous-sections pour sessions
 * multiples Claude Code », deux fois, mot pour mot. Personne ne les avait vus.
 *
 * DEUX CAS, et le second coûte bien plus cher que le premier :
 *   — deux chantiers OUVERTS qui disent la même chose : une session peut
 *     prendre l'un pendant qu'une autre prend son jumeau ;
 *   — un chantier ouvert identique à un chantier DÉJÀ LIVRÉ : une session le
 *     reprend de zéro, refait ce qui existe, et parfois défait ce qui marchait.
 *
 * POURQUOI CE N'EST PAS LA MÊME MESURE QUE PENDANT LA FRAPPE. Là-bas, on
 * compare un texte partiel à des chantiers entiers : le recouvrement est
 * rapporté au plus court des deux, exprès, pour attraper une phrase à peine
 * commencée. Ici les deux textes sont complets, donc on compare les
 * ensembles de mots des DEUX titres (Jaccard). Mesuré sur les 192 chantiers
 * réels de Raphaël : la mesure de la frappe signale 14 paires dont UNE seule
 * est un vrai doublon — treize cris au loup pour une prise, et sa règle est
 * qu'un avertissement qui se déclenche à tort n'est plus lu du tout. La
 * mesure symétrique, elle, en signale une seule au seuil retenu, et c'est la
 * bonne.
 */

export interface PaireDoublon {
  /** Le plus récent des deux : c'est celui qu'on proposera d'archiver. */
  recent: DevItem
  /** L'autre — l'original, ou la version déjà livrée. */
  original: DevItem
  /** Entre 0 et 1 : la part de vocabulaire commun aux deux titres. */
  score: number
  /** Les mots partagés, pour que la ressemblance se juge d'un œil. */
  motsCommuns: string[]
  /** L'original est archivé : c'est le cas coûteux, on le dit autrement. */
  dejaLivre: boolean
}

/**
 * Le seuil, MESURÉ et non choisi : sur les 192 chantiers réels, 0,30 remonte
 * 7 paires dont 6 sans rapport (« recherche web » ici, « recherche web » là),
 * 0,50 en remonte 2 dont une fausse, et 0,60 exactement une — le vrai doublon.
 * Ne pas le baisser sans refaire la mesure sur des données réelles.
 */
export const SEUIL_DOUBLON = 0.6

/** Sous deux mots utiles, un titre n'a pas de quoi être comparé. */
const MOTS_MINIMUM = 2

/** Combien de paires au maximum : au-delà, ce n'est plus un signalement,
 * c'est une deuxième liste de chantiers à trier. */
const MAX_PAIRES = 5

function quand(item: DevItem): number {
  const t = Date.parse(item.created_at ?? "")
  return Number.isFinite(t) ? t : 0
}

/**
 * Cherche les paires de chantiers qui disent la même chose.
 *
 * `items` porte tout, ouverts et archivés : un chantier ouvert qui répète un
 * chantier livré est précisément ce qu'on veut attraper. En revanche deux
 * chantiers ARCHIVÉS qui se ressemblent n'intéressent personne — c'est du
 * passé, et le signaler noierait le reste.
 */
export function doublonsExistants(items: DevItem[]): PaireDoublon[] {
  const motsDe = new Map<string, Set<string>>()
  for (const item of items) {
    motsDe.set(item.id, new Set(motsUtiles(item.title)))
  }

  const paires: PaireDoublon[] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      // Deux archivés : du passé, personne n'y touchera plus.
      if (a.archived_at && b.archived_at) continue

      const motsA = motsDe.get(a.id)!
      const motsB = motsDe.get(b.id)!
      if (motsA.size < MOTS_MINIMUM || motsB.size < MOTS_MINIMUM) continue

      const communs = [...motsA].filter((m) => motsB.has(m))
      if (communs.length === 0) continue
      const union = new Set([...motsA, ...motsB]).size
      const score = communs.length / union
      if (score < SEUIL_DOUBLON) continue

      // Celui qu'on propose d'archiver est le plus récent, et jamais un
      // archivé : archiver ce qui l'est déjà réécrirait sa date de livraison.
      const [recent, original] = a.archived_at
        ? [b, a]
        : b.archived_at
          ? [a, b]
          : quand(a) >= quand(b)
            ? [a, b]
            : [b, a]

      paires.push({
        recent,
        original,
        score,
        motsCommuns: communs,
        dejaLivre: Boolean(original.archived_at),
      })
    }
  }

  // Le plus ressemblant d'abord, et à égalité le cas « déjà livré », qui coûte
  // le plus cher.
  paires.sort((x, y) => y.score - x.score || Number(y.dejaLivre) - Number(x.dejaLivre))
  return paires.slice(0, MAX_PAIRES)
}
