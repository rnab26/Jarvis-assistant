// Relatif avec extension : vérifiable sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { chantiersProches } from "./doublonChantier.ts"
import { motsUtiles } from "./suggestionTheme.ts"
import type { DevItem } from "@/types/database"

/**
 * « Ça existe déjà », mais à la voix.
 *
 * CE QUI S'EST PASSÉ, sur ses vraies données le 5 sept. 2026 : à 18 h 29 il
 * dicte « dans les sections de chantier […] créer des sous-sections », à
 * 18 h 30 il redit « diviser les thèmes de chantier avec des sous-sections
 * maintenant ». Deux chantiers au titre IDENTIQUE, aux notes identiques. Il
 * avait reformulé en croyant que le premier n'avait pas pris — il avait pris.
 *
 * La saisie MANUELLE du cockpit a un garde-fou depuis le 4 sept. : elle
 * montre les chantiers proches pendant qu'il écrit, archivés compris. À la
 * voix, rien — alors que c'est justement à la voix qu'il reformule, parce
 * qu'il ne voit pas le résultat.
 *
 * POURQUOI ON NE POSE PAS DE QUESTION. Sa décision du 5 sept. sur le contrôle
 * du téléphone est explicite : pas de fenêtre de confirmation, « il doit
 * faire tout ce que je demande ». Alors on ne demande rien — on DIT. Une
 * redite quasi littérale d'un chantier ouvert n'est pas recréée et Jarvis
 * nomme celui qui existe ; tout le reste est créé, en signalant simplement ce
 * qui y ressemble. Dans les deux cas il apprend en une phrase ce qu'il
 * n'avait aucun moyen de savoir.
 *
 * Comparaison LOCALE, jamais un appel au modèle : ranger un chantier n'a pas
 * à consommer le quota gratuit qui l'a déjà laissé sans Jarvis le 3 sept.
 */

/**
 * Au-dessus, c'est la même demande redite : on ne recrée pas.
 *
 * Volontairement bien plus haut que le seuil d'affichage de la saisie
 * manuelle (0,34) : là-bas une suggestion de trop ne coûte rien, elle
 * s'ignore d'un coup d'œil. Ici, refuser à tort perdrait une demande — donc
 * on ne refuse que sur une redite quasi littérale.
 */
const SEUIL_REFUS = 0.75

/** En dessous, on crée quand même, mais on signale ce qui y ressemble. */
const SEUIL_AVERTISSEMENT = 0.55

/**
 * En dessous de ce nombre de mots utiles, on n'oppose JAMAIS un refus.
 *
 * Un titre de deux ou trois mots (« sous-sections », « mode hors ligne »)
 * partage vite tout son vocabulaire avec un chantier existant sans dire la
 * même chose. Refuser à tort perd une demande en silence — bien pire que le
 * doublon qu'on essaie d'éviter. En dessous, on avertit et on crée.
 */
const MOTS_MINIMUM_REFUS = 4

export type DecisionDoublonVocal =
  /** Rien de proche : on crée sans rien dire de plus. */
  | { verdict: "creer" }
  /** On crée, et Jarvis prévient de ce qui existait déjà. */
  | { verdict: "creer_en_avertissant"; proche: DevItem; phrase: string }
  /** On ne recrée pas : c'est la même demande, redite. */
  | { verdict: "refuser"; proche: DevItem; phrase: string }

/**
 * Ce qu'on fait d'un chantier dicté qui ressemble à un chantier existant.
 *
 * Un chantier ARCHIVÉ n'est jamais un motif de refus : le redemander veut
 * souvent dire qu'il a régressé, ou qu'il n'a pas été livré comme il
 * l'imaginait. On le crée, en disant qu'il a déjà été livré — c'est
 * l'information qui manque, pas l'autorisation.
 */
export function deciderDoublonVocal(
  titre: string,
  notes: string | null | undefined,
  items: DevItem[],
): DecisionDoublonVocal {
  const proches = chantiersProches(`${titre} ${notes ?? ""}`.trim(), items, 3)
  const meilleur = proches[0]
  if (!meilleur || meilleur.score < SEUIL_AVERTISSEMENT) return { verdict: "creer" }

  const archive = meilleur.item.archived_at !== null

  const assezLong = motsUtiles(titre).length >= MOTS_MINIMUM_REFUS

  if (!archive && assezLong && meilleur.score >= SEUIL_REFUS) {
    return {
      verdict: "refuser",
      proche: meilleur.item,
      phrase: `Tu as déjà « ${meilleur.item.title} » dans le cockpit, qui dit la même chose — je ne le recrée pas. Si tu en veux vraiment un second, ajoute-le depuis le cockpit.`,
    }
  }

  if (archive) {
    return {
      verdict: "creer_en_avertissant",
      proche: meilleur.item,
      phrase: `Attention : « ${meilleur.item.title} » a déjà été livré et archivé. Je l'ajoute quand même.`,
    }
  }

  return {
    verdict: "creer_en_avertissant",
    proche: meilleur.item,
    phrase: `Ça ressemble à « ${meilleur.item.title} », déjà ouvert. Je l'ajoute quand même.`,
  }
}
