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

// ── Combien de tâches dans chaque catégorie ───────────────────────────────

/** La clé du groupe « Sans catégorie », la même que dans TaskList. */
export const SANS_CATEGORIE = "none"

/**
 * Le nombre de tâches À FAIRE par catégorie, y compris celles qui n'en ont
 * aucune.
 *
 * Sa demande : « Ajouter un compteur a côté des catégories de taches afin
 * d'avoir une idée du nombre de tache par catégorie. »
 *
 * ON COMPTE CE QUI RESTE À FAIRE, PAS TOUT, et c'est mesuré sur ses vraies
 * tâches (8 sept. 2026 : 33 tâches, dont 5 faites, réparties sur 9 catégories
 * plus 5 sans catégorie). La question qu'il se pose devant cet écran est
 * « combien il m'en reste là-dedans » ; un total qui compte aussi les faites
 * ne fait que grossir avec le temps et finit par ne plus rien vouloir dire.
 * Une catégorie soldée affiche donc 0 — ce qui est exactement la bonne
 * réponse, pas une absence d'information.
 *
 * ON REND AUSSI LES CATÉGORIES VIDES. « Notes » n'a aucune tâche chez lui :
 * la laisser sans chiffre ferait lire « on ne sait pas » là où la réponse est
 * « zéro », et c'est justement ce qui lui dirait qu'elle ne sert à rien.
 */
export function compterAFaire(
  taches: readonly { category_id: string | null; status: string }[],
  categories: readonly Category[],
): Map<string, number> {
  const compte = new Map<string, number>()
  for (const c of categories) compte.set(c.id, 0)
  compte.set(SANS_CATEGORIE, 0)
  for (const t of taches) {
    if (t.status === "done") continue
    // Une tâche rangée dans une catégorie supprimée entre-temps ne doit pas
    // fabriquer une entrée fantôme : elle compte comme sans catégorie, ce
    // qu'elle est devenue à l'écran.
    const dite = t.category_id ?? SANS_CATEGORIE
    const cle = compte.has(dite) ? dite : SANS_CATEGORIE
    compte.set(cle, (compte.get(cle) ?? 0) + 1)
  }
  return compte
}

/** Le total à faire, toutes catégories confondues. Calculé ici plutôt que
 * dans l'écran : « Toutes » doit dire la somme de ce qu'affichent les autres
 * boutons, sinon le compte ne tombe jamais juste sous ses yeux. */
export function totalAFaire(compte: Map<string, number>): number {
  let total = 0
  for (const n of compte.values()) total += n
  return total
}
