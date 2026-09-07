// Relatif avec extension, comme suggestionTheme.ts : vérifiable sous node
// sans Vite.
import { motsUtiles } from "./suggestionTheme.ts"
import type { Category, Task } from "@/types/database"

/**
 * À quelle catégorie rattacher une tâche dictée sans qu'il en dise une.
 *
 * Demande de Raphaël, chantier eeca8cca (7 sept. 2026) : « il doit aussi
 * savoir définir dans quel contexte quelle catégorie de tâche il faut
 * l'ajouter si je ne lui dis pas, il doit me le suggérer à voix haute et je
 * lui valide ».
 *
 * MÊME CHOIX QUE suggestionTheme.ts, POUR LA MÊME RAISON : un rangement se
 * calcule sur le vocabulaire de ce qui est déjà classé, hors ligne, sans
 * consommer le quota gratuit du modèle. L'algorithme est le même
 * (recouvrement de mots pondéré par leur rareté), adapté aux tâches et à
 * leurs catégories plutôt qu'aux chantiers et à leurs sections — deux entités
 * différentes, donc pas de fusion des deux modules pour trois lignes
 * communes.
 *
 * Elle ne décide jamais seule : Jarvis l'annonce et attend une validation
 * (« oui », ou le nom d'une autre catégorie) avant d'écrire quoi que ce soit
 * — voir tacheDateEtCategorie.ts.
 */

const SCORE_MINIMUM = 1.2
const AVANCE_MINIMUM = 1.25

interface Corpus {
  categoryId: string
  categoryName: string
  occurrences: Map<string, number>
  nbTaches: number
  motsDuNom: Set<string>
}

function construireCorpus(taches: Task[], categories: Category[]): Corpus[] {
  const corpus = new Map<string, Corpus>()
  for (const cat of categories) {
    corpus.set(cat.id, {
      categoryId: cat.id,
      categoryName: cat.name,
      occurrences: new Map(),
      nbTaches: 0,
      motsDuNom: new Set(motsUtiles(cat.name)),
    })
  }

  const compter = (c: Corpus, texte: string, poids: number) => {
    for (const mot of motsUtiles(texte)) {
      c.occurrences.set(mot, (c.occurrences.get(mot) ?? 0) + poids)
    }
  }

  for (const tache of taches) {
    if (!tache.category_id) continue
    const c = corpus.get(tache.category_id)
    if (!c) continue
    c.nbTaches++
    compter(c, tache.title, 1)
    if (tache.notes) compter(c, tache.notes, 0.3)
  }

  return [...corpus.values()]
}

function poidsDuMot(c: Corpus, mot: string): number {
  const dansLesTaches = (c.occurrences.get(mot) ?? 0) / Math.max(1, c.nbTaches)
  return dansLesTaches + (c.motsDuNom.has(mot) ? 4 : 0)
}

export interface SuggestionCategorie {
  categoryId: string
  categoryName: string
  motsCommuns: string[]
}

/**
 * La catégorie à pré-sélectionner, ou null si rien ne se détache assez.
 * Le doute se dit : une suggestion acceptée sans être relue coûte plus cher
 * qu'une absence de suggestion.
 */
export function suggererCategorie(
  titre: string,
  notes: string | null | undefined,
  taches: Task[],
  categories: Category[],
): SuggestionCategorie | null {
  if (categories.length === 0) return null
  const texte = [titre, notes ?? ""].join(" ")
  const mots = motsUtiles(texte)
  if (mots.length === 0) return null

  const corpus = construireCorpus(taches, categories)
  if (corpus.length === 0) return null

  const rarete = new Map<string, number>()
  for (const mot of mots) {
    const presentes = corpus.filter((c) => poidsDuMot(c, mot) > 0).length
    rarete.set(mot, presentes === 0 ? 0 : Math.log(1 + corpus.length / presentes))
  }

  const classement = corpus
    .map((c) => {
      const motsCommuns: string[] = []
      let score = 0
      for (const mot of mots) {
        const poids = poidsDuMot(c, mot)
        if (!poids) continue
        motsCommuns.push(mot)
        score += Math.sqrt(poids) * (rarete.get(mot) ?? 0)
      }
      score *= 1 + 0.5 * Math.max(0, motsCommuns.length - 1)
      return { c, score: Number(score.toFixed(3)), motsCommuns }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.c.categoryName.localeCompare(b.c.categoryName, "fr"))

  const [premier, second] = classement
  if (!premier || premier.score < SCORE_MINIMUM) return null
  if (premier.motsCommuns.length < 2 && !premier.motsCommuns.some((m) => premier.c.motsDuNom.has(m))) return null
  if (second && premier.score < second.score * AVANCE_MINIMUM) return null

  return {
    categoryId: premier.c.categoryId,
    categoryName: premier.c.categoryName,
    motsCommuns: premier.motsCommuns,
  }
}
