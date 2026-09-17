import { notesSansMarqueur } from "./marqueurChantier.ts"

/**
 * La dernière mise à jour d'un chantier, extraite du pavé de notes.
 *
 * Plainte de Raphaël, 17 sept. 2026, captures à l'appui : déplier un
 * chantier montre TOUT l'historique brut accumulé par chaque session qui l'a
 * touché — sur un chantier ancien (fa16146d), plusieurs milliers de
 * caractères, plusieurs sessions citées avec leurs dates, du jargon
 * technique. « je ne comprends même pas, donc j'avance même pas dessus. »
 *
 * MESURÉ sur plusieurs vraies notes avant de coder ce découpage (fa16146d,
 * ba140853, 920ff758…) : chaque session ajoute sa mise à jour à la SUITE des
 * précédentes, séparée du reste par une ou plusieurs lignes vides — que la
 * session l'introduise par un « --- <date> », un « MISE À JOUR DU… », un
 * crochet « [EN COURS, <session>, <date>] » ou rien de tout ça. Aucun de ces
 * en-têtes n'est systématique ; la ligne vide, elle, l'est. Le DERNIER
 * paragraphe du texte est donc toujours la mise à jour la plus récente, et
 * c'est elle qui dit où en est le chantier MAINTENANT.
 *
 * Le marqueur et l'intro d'origine ([BLOQUÉ PAR…], [À CADRER…]) ouvrent la
 * note — ce sont donc le PREMIER paragraphe, jamais le dernier. Ils ne
 * risquent donc pas d'être pris pour la dernière mise à jour.
 *
 * Rien n'est perdu : cette fonction ne fait QUE choisir quoi montrer en
 * premier. Le texte complet reste lisible tel quel ailleurs — cf. CLAUDE.md,
 * « un chantier garde ce qu'on y a écrit ».
 */
export function derniereMajChantier(notes: string | null): string | null {
  const texte = notesSansMarqueur(notes)
  if (!texte) return null
  const blocs = paragraphesNotes(texte)
  if (blocs.length === 0) return null
  return blocs[blocs.length - 1]
}

/**
 * Découpe un texte en paragraphes séparés par une ou plusieurs lignes vides
 * (vides, ou ne contenant que des espaces/tabulations).
 *
 * Exportée pour le contrôle : c'est elle qui dit s'il existe un historique
 * derrière la dernière mise à jour (plus d'un paragraphe), donc si l'app doit
 * proposer « Voir tout l'historique » ou se taire — un accordéon qui ne cache
 * rien de plus que ce qui est déjà affiché ne sert à rien.
 */
export function paragraphesNotes(texte: string): string[] {
  return texte
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}
