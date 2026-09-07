/**
 * L'ordre de ses catégories, et ce qu'on refuse d'enregistrer.
 *
 *   node --experimental-strip-types scripts/verifier-ordre-categories.ts
 *
 * SA DEMANDE, 7 sept. 2026 : « un petit crayon [...] pour renommer les
 * sections, les déplacer facilement avec un drag and drop ».
 *
 * CE QUI CASSE EN SILENCE ICI : un ordre qui se réarrange tout seul (il
 * retrouverait son écran mélangé sans avoir rien touché), et un renommage
 * accepté qui rend une catégorie introuvable.
 */
import { categoriesOrdonnees, deplacer, verifierRenommage, MESSAGE_REFUS } from "../src/lib/ordreCategories.ts"
import type { Category } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const cat = (id: string, name: string, position: number | null, cree: string): Category =>
  ({ id, user_id: "u", name, position, created_at: cree }) as Category

console.log("— L'ordre affiché —")

{
  // Le cas du 7 sept. : il n'a JAMAIS rien réorganisé. Son écran ne doit pas
  // bouger d'un pouce, sinon la nouveauté se voit comme un dérangement.
  const jamaisRangees = [
    cat("c", "Achat", null, "2026-09-03T10:00:00Z"),
    cat("a", "Perso", null, "2026-09-01T10:00:00Z"),
    cat("b", "Leads", null, "2026-09-02T10:00:00Z"),
  ]
  verifier(
    "sans aucune position, l'ordre reste celui de la création",
    categoriesOrdonnees(jamaisRangees).map((c) => c.name).join(",") === "Perso,Leads,Achat",
    "son écran se réarrangerait tout seul au premier lancement",
  )
}

{
  const melange = [
    cat("a", "Perso", 2, "2026-09-01T10:00:00Z"),
    cat("b", "Admin", 0, "2026-09-05T10:00:00Z"),
    cat("c", "Notes", 1, "2026-09-02T10:00:00Z"),
  ]
  verifier(
    "les positions choisies gagnent sur la date de création",
    categoriesOrdonnees(melange).map((c) => c.name).join(",") === "Admin,Notes,Perso",
  )
}

{
  const mixte = [
    cat("a", "Rangée", 0, "2026-09-05T10:00:00Z"),
    cat("b", "Nouvelle", null, "2026-09-01T10:00:00Z"),
  ]
  verifier(
    "une catégorie jamais rangée passe APRÈS celles qu'il a classées",
    categoriesOrdonnees(mixte).map((c) => c.name).join(",") === "Rangée,Nouvelle",
    "une nouvelle catégorie s'insérerait au milieu de son classement, alors qu'elle vient d'arriver",
  )
}

console.log("\n— Déplacer —")

{
  const trois = [
    cat("a", "A", 0, "2026-09-01T10:00:00Z"),
    cat("b", "B", 1, "2026-09-02T10:00:00Z"),
    cat("c", "C", 2, "2026-09-03T10:00:00Z"),
  ]
  const apres = deplacer(trois, "c", 0)
  verifier(
    "déplacer la dernière en tête renumérote tout le monde",
    JSON.stringify(apres) === JSON.stringify([
      { id: "c", position: 0 }, { id: "a", position: 1 }, { id: "b", position: 2 },
    ]),
    JSON.stringify(apres),
  )
  verifier(
    "toutes les positions sont réécrites, pas seulement celle qui bouge",
    apres.length === 3,
    "un déplacement dépendrait alors de valeurs héritées, et deux gestes de suite se contrediraient",
  )
  verifier("déplacer à sa propre place n'écrit rien", deplacer(trois, "b", 1).length === 0)
  verifier("un identifiant inconnu n'écrit rien", deplacer(trois, "zzz", 0).length === 0)
  verifier(
    "un index hors liste est ramené dans la liste",
    deplacer(trois, "a", 99)[2].id === "a",
    "sinon le déplacement se perdrait sans rien dire",
  )
}

console.log("\n— Renommer : ce qu'on REFUSE —")

{
  const deux = [
    cat("a", "Perso", 0, "2026-09-01T10:00:00Z"),
    cat("b", "Admin", 1, "2026-09-02T10:00:00Z"),
  ]
  verifier("un nom normal passe", verifierRenommage(deux, "a", "Personnel") === null)
  verifier(
    "un nom vide est refusé",
    verifierRenommage(deux, "a", "   ") === "vide",
    "la catégorie disparaîtrait de l'écran sans être supprimée, avec ses tâches dedans",
  )
  verifier(
    "un nom déjà pris est refusé",
    verifierRenommage(deux, "a", "Admin") === "existe",
    "il ne saurait plus dans laquelle il range",
  )
  verifier(
    "   même avec une autre casse",
    verifierRenommage(deux, "a", "  admin ") === "existe",
  )
  verifier(
    "se renommer avec son propre nom est permis",
    verifierRenommage(deux, "a", "Perso") === null,
    "corriger un accent sans changer le nom serait refusé",
  )
  verifier(
    "les accents distinguent bien deux noms",
    verifierRenommage([cat("a", "Melissa", 0, "x"), cat("b", "B", 1, "y")], "b", "Mélissa") === null,
    "« Melissa » et « Mélissa » sont deux noms qu'il peut vouloir distinguer — ce n'est pas à nous d'en décider",
  )
  verifier(
    "chaque refus a une phrase qui dit pourquoi",
    MESSAGE_REFUS.vide.length > 20 && MESSAGE_REFUS.existe.length > 20,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
