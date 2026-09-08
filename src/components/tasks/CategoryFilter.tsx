import { Button } from "@/components/ui/button"
import { SANS_CATEGORIE, totalAFaire } from "@/lib/ordreCategories"
import { cn } from "@/lib/utils"
import type { Category } from "@/types/database"

const ALL = "all"

interface CategoryFilterProps {
  categories: Category[]
  value: string
  onChange: (value: string) => void
  /** Combien de tâches À FAIRE par catégorie (`compterAFaire`). La clé
   * `SANS_CATEGORIE` porte celles qui n'en ont aucune. */
  compte: Map<string, number>
}

/** Le nombre, collé au nom. Discret : c'est un repère, pas la donnée
 * principale — le nom de la catégorie doit rester ce qu'on lit en premier. */
function Compteur({ n, actif }: { n: number; actif: boolean }) {
  return (
    <span
      data-compteur
      className={cn(
        "ml-1 tabular-nums",
        actif ? "text-primary-foreground/70" : "text-muted-foreground",
      )}
    >
      {n}
    </span>
  )
}

export function CategoryFilter({
  categories,
  value,
  onChange,
  compte,
}: CategoryFilterProps) {
  const sansCategorie = compte.get(SANS_CATEGORIE) ?? 0

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={value === ALL ? "default" : "outline"}
        onClick={() => onChange(ALL)}
      >
        Toutes
        <Compteur n={totalAFaire(compte)} actif={value === ALL} />
      </Button>
      {categories.map((category) => (
        <Button
          key={category.id}
          size="sm"
          variant={value === category.id ? "default" : "outline"}
          onClick={() => onChange(category.id)}
        >
          {category.name}
          <Compteur n={compte.get(category.id) ?? 0} actif={value === category.id} />
        </Button>
      ))}
      {/* CE BOUTON N'EXISTAIT PAS, et c'est le compteur qui l'a rendu
          nécessaire : cinq de ses trente-trois tâches n'ont aucune catégorie
          (mesuré le 8 sept. 2026). Sans lui, « Toutes » afficherait un total
          que la somme des autres boutons ne retrouve pas — le compte ne
          tomberait jamais juste sous ses yeux — et ces cinq tâches-là
          resteraient les seules qu'aucun filtre ne peut isoler, alors que la
          liste, elle, leur fait bien une section.

          Il ne s'affiche QUE s'il y en a : un bouton « Sans catégorie 0 »
          serait un contrôle mort, et sa règle vaut ici comme ailleurs — ne
          pas montrer ce qui ne sert à rien. */}
      {sansCategorie > 0 && (
        <Button
          size="sm"
          variant={value === SANS_CATEGORIE ? "default" : "outline"}
          onClick={() => onChange(SANS_CATEGORIE)}
        >
          Sans catégorie
          <Compteur n={sansCategorie} actif={value === SANS_CATEGORIE} />
        </Button>
      )}
    </div>
  )
}

export { ALL as ALL_CATEGORIES }
