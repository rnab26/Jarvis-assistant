/**
 * Dans quel ordre ses catégories s'affichent, et comment il le change.
 *
 * SA DEMANDE, 7 sept. 2026 : « ajouter dans l'écran d'accueil un petit crayon
 * [...] pour pouvoir bien évidemment renommer les sections, les déplacer
 * facilement avec un drag and drop pour mieux organiser le panel visuel ».
 *
 * PUR, donc vérifiable sans navigateur : c'est ici que vivent les deux choses
 * qui peuvent casser en silence — l'ordre affiché, et le renommage refusé.
 */
import type { Category } from "@/types/database"

/**
 * L'ordre d'affichage : la position choisie d'abord, la date de création
 * ensuite.
 *
 * `position` est NULLABLE exprès (migration 0033) : tant qu'il n'a rien
 * réorganisé, ses catégories gardent l'ordre qu'il connaît. Une catégorie sans
 * position passe donc APRÈS celles qu'il a rangées — elle est nouvelle, elle
 * arrive au bout, elle ne vient pas s'insérer au milieu de son classement.
 */
export function categoriesOrdonnees(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    const pa = a.position ?? null
    const pb = b.position ?? null
    if (pa !== null && pb !== null) return pa - pb
    if (pa !== null) return -1
    if (pb !== null) return 1
    return (a.created_at ?? "").localeCompare(b.created_at ?? "")
  })
}

/**
 * Déplacer une catégorie d'une place à une autre, et rendre la liste complète
 * des positions à écrire.
 *
 * ON RÉÉCRIT TOUTES LES POSITIONS, pas seulement celle qui bouge. Les
 * renuméroter de 0 à n garde l'ordre lisible et évite qu'un déplacement
 * dépende de valeurs héritées — c'est le même choix que `reordonner_sections`
 * pour les sections du cockpit.
 */
export function deplacer(
  categories: Category[],
  idDeplace: string,
  versIndex: number,
): { id: string; position: number }[] {
  const ordre = categoriesOrdonnees(categories)
  const depuis = ordre.findIndex((c) => c.id === idDeplace)
  if (depuis === -1) return []

  const cible = Math.max(0, Math.min(versIndex, ordre.length - 1))
  if (cible === depuis) return []

  const copie = [...ordre]
  const [item] = copie.splice(depuis, 1)
  copie.splice(cible, 0, item)
  return copie.map((c, i) => ({ id: c.id, position: i }))
}

/** Ce qu'on refuse d'enregistrer comme nom, et pourquoi. */
export type RefusRenommage = "vide" | "existe"

/**
 * Un nom vide effacerait la catégorie de l'écran sans rien supprimer — elle
 * existerait encore, invisible, avec ses tâches dedans. Et deux catégories du
 * même nom sont impossibles à distinguer une fois affichées : il ne saurait
 * plus dans laquelle il range.
 *
 * La comparaison ignore la casse et les espaces de bord, mais PAS les accents :
 * « Melissa » et « Mélissa » sont deux noms qu'il peut vouloir distinguer, et
 * ce n'est pas à nous d'en décider.
 */
export function verifierRenommage(
  categories: Category[],
  id: string,
  nouveauNom: string,
): RefusRenommage | null {
  const propre = nouveauNom.trim()
  if (!propre) return "vide"
  const pris = categories.some(
    (c) => c.id !== id && c.name.trim().toLowerCase() === propre.toLowerCase(),
  )
  return pris ? "existe" : null
}

export const MESSAGE_REFUS: Record<RefusRenommage, string> = {
  vide: "Il faut un nom : une catégorie sans nom disparaîtrait de l'écran sans être supprimée.",
  existe: "Tu as déjà une catégorie qui porte ce nom — tu ne saurais plus dans laquelle tu ranges.",
}
