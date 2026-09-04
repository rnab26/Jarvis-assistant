// Relatif avec extension, comme sections.ts : vérifiable sous node sans Vite.
import { normaliserRecherche, sectionDe } from "./sections.ts"
import type { DevItem, DevSection } from "@/types/database"

/**
 * À quelle section rattacher un chantier qu'on vient d'écrire.
 *
 * Demande de Raphaël (chantier 41816bdc) : « dans la création de chantier à
 * envoyer à Claude Code en saisie manuelle, des fois on ne sait pas quel est
 * le thème le plus approprié à sélectionner. Jarvis doit pouvoir lui attribuer
 * le bon thème en réfléchissant logiquement quel thème doit lui être
 * attribué. »
 *
 * POURQUOI CE N'EST PAS UN APPEL AU MODÈLE. Chaque appel à Gemini consomme le
 * quota gratuit, et c'est ce quota qui a laissé Raphaël sans Jarvis le
 * 3 sept. à 21h28. Une suggestion de rangement n'a pas à coûter ça : elle doit
 * s'afficher pendant qu'il tape, hors ligne, sans latence. Le classement se
 * fait donc sur ce que les sections contiennent DÉJÀ — le vocabulaire de leurs
 * chantiers —, ce qui a un avantage sur un modèle : la suggestion suit
 * l'évolution réelle du cockpit sans qu'on réécrive quoi que ce soit.
 *
 * Et elle ne décide jamais seule : elle pré-sélectionne, en disant sur quels
 * mots elle s'appuie, et Raphaël peut la refuser d'un geste.
 */

/** Mots trop fréquents pour distinguer une section d'une autre. */
const MOTS_VIDES = new Set([
  "les", "des", "une", "aux", "que", "qui", "pour", "dans", "avec", "sans", "sur",
  "par", "est", "sont", "pas", "plus", "moins", "faire", "fait", "faut", "avoir",
  "etre", "cela", "cette", "ceux", "celle", "quand", "comme", "mais", "donc",
  "car", "son", "sa", "ses", "mon", "ma", "mes", "leur", "leurs", "ils", "elle",
  "elles", "nous", "vous", "chantier", "chantiers", "jarvis", "raphael", "app",
  "application", "quel", "quelle", "tout", "tous", "toute", "toutes", "bien",
  "peut", "pouvoir", "doit", "devoir", "quelque", "chose", "aussi", "encore",
  "deja", "meme", "entre", "vers", "chez", "depuis", "afin", "ainsi", "alors",
])

/** En dessous, un mot ne porte pas de sujet (« du », « le », « ok »). */
const LONGUEUR_MIN = 3

export function motsUtiles(texte: string): string[] {
  return [
    ...new Set(
      normaliserRecherche(texte)
        .split(/[^a-z0-9]+/)
        .filter((m) => m.length >= LONGUEUR_MIN && !MOTS_VIDES.has(m)),
    ),
  ]
}

export interface SuggestionSection {
  /** Le nom de la section, tel qu'il sera écrit dans `dev_items.theme`. */
  nom: string
  score: number
  /** Les mots qui l'ont fait gagner : c'est ce qu'on affiche pour justifier. */
  motsCommuns: string[]
  /** Vrai si au moins un de ces mots est dans le NOM de la section. */
  toucheLeNom: boolean
}

/** Le nom d'une section pèse plus que le contenu d'un de ses chantiers : il a
 * été choisi pour dire ce qu'on y range. */
const POIDS_NOM = 4
const POIDS_DESCRIPTION = 2

/** En dessous, la meilleure section n'est qu'un hasard de vocabulaire. */
const SCORE_MINIMUM = 1.2
/** Et il faut qu'elle se détache : deux sections à égalité, on ne suggère
 * rien plutôt que de ranger au hasard. */
const AVANCE_MINIMUM = 1.25

interface Corpus {
  nom: string
  /** Poids de chaque mot dans cette section. */
  poids: Map<string, number>
  /** Les mots du nom de la section, à part : un mot qui est dans le nom
   * désigne la section, un mot croisé dans un de ses chantiers l'évoque. */
  motsDuNom: Set<string>
}

function construireCorpus(items: DevItem[], sections: DevSection[]): Corpus[] {
  const corpus = new Map<string, Corpus>()

  const pour = (nom: string) => {
    const cle = normaliserRecherche(nom)
    if (!corpus.has(cle)) corpus.set(cle, { nom, poids: new Map(), motsDuNom: new Set() })
    return corpus.get(cle)!
  }

  const ajouter = (c: Corpus, texte: string, poids: number) => {
    for (const mot of motsUtiles(texte)) {
      c.poids.set(mot, (c.poids.get(mot) ?? 0) + poids)
    }
  }

  for (const section of sections) {
    const c = pour(section.nom)
    ajouter(c, section.nom, POIDS_NOM)
    for (const mot of motsUtiles(section.nom)) c.motsDuNom.add(mot)
    if (section.description) ajouter(c, section.description, POIDS_DESCRIPTION)
  }

  for (const item of items) {
    const nom = sectionDe(item)
    // Un chantier non classé ne peut rien apprendre à personne.
    if (!item.theme?.trim()) continue
    const c = pour(nom)
    if (!sections.some((s) => normaliserRecherche(s.nom) === normaliserRecherche(nom))) {
      // Section non déclarée mais réellement utilisée : elle compte quand même.
      ajouter(c, nom, POIDS_NOM)
      for (const mot of motsUtiles(nom)) c.motsDuNom.add(mot)
    }
    ajouter(c, item.title, 1)
    if (item.notes) ajouter(c, item.notes, 0.35)
  }

  return [...corpus.values()]
}

/**
 * Les sections candidates, la mieux placée en premier. Vide si rien ne
 * ressort — mieux vaut ne rien proposer qu'induire un mauvais rangement.
 */
export function classerSections(
  texte: string,
  items: DevItem[],
  sections: DevSection[],
): SuggestionSection[] {
  const mots = motsUtiles(texte)
  if (mots.length === 0) return []

  const corpus = construireCorpus(items, sections)
  if (corpus.length === 0) return []

  // Un mot présent partout ne distingue rien ; un mot présent dans une seule
  // section la désigne. C'est ce qui évite que « cockpit » ou « voix », qui
  // reviennent partout, décident du rangement.
  const rarete = new Map<string, number>()
  for (const mot of mots) {
    const presentes = corpus.filter((c) => c.poids.has(mot)).length
    rarete.set(mot, presentes === 0 ? 0 : Math.log(1 + corpus.length / presentes))
  }

  return corpus
    .map((c) => {
      const motsCommuns: string[] = []
      let score = 0
      for (const mot of mots) {
        const poids = c.poids.get(mot)
        if (!poids) continue
        motsCommuns.push(mot)
        // Racine carrée : dix chantiers qui parlent de « micro » valent plus
        // qu'un seul, mais pas dix fois plus — sinon la plus grosse section
        // gagne toujours.
        score += Math.sqrt(poids) * (rarete.get(mot) ?? 0)
      }
      // Une section qui répond sur PLUSIEURS mots différents est plus
      // probable qu'une autre qui ne répond que sur un seul, même rare.
      // Sans ça, « il oublie les souvenirs de la veille » partait dans
      // « Recherche et veille » — le mot « veille » y est rare, donc lourd,
      // alors qu'il n'a rien à voir avec le sens de la phrase.
      score *= 1 + 0.5 * Math.max(0, motsCommuns.length - 1)
      return {
        nom: c.nom,
        score: Number(score.toFixed(3)),
        motsCommuns,
        toucheLeNom: motsCommuns.some((m) => c.motsDuNom.has(m)),
      }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.nom.localeCompare(b.nom, "fr"))
}

/**
 * La section à pré-sélectionner, ou null si rien ne se détache assez.
 * Le doute se dit : une suggestion fausse coûte plus qu'une absence de
 * suggestion, parce qu'elle est acceptée sans être relue.
 */
export function suggererSection(
  texte: string,
  items: DevItem[],
  sections: DevSection[],
): SuggestionSection | null {
  const classement = classerSections(texte, items, sections)
  const [premier, second] = classement
  if (!premier || premier.score < SCORE_MINIMUM) return null
  // Un seul mot commun, et qui n'est pas dans le nom de la section : c'est un
  // hasard de vocabulaire, pas un rangement. « Corriger le truc dont on a
  // parlé hier » tombait ainsi dans « Messagerie et agenda », parce qu'un de
  // ses chantiers contient le mot « corriger ».
  if (premier.motsCommuns.length < 2 && !premier.toucheLeNom) return null
  if (second && premier.score < second.score * AVANCE_MINIMUM) return null
  return premier
}
