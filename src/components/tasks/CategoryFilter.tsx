import { Button } from "@/components/ui/button"
import type { Category } from "@/types/database"

const ALL = "all"

interface CategoryFilterProps {
  categories: Category[]
  value: string
  onChange: (value: string) => void
}

export function CategoryFilter({
  categories,
  value,
  onChange,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={value === ALL ? "default" : "outline"}
        onClick={() => onChange(ALL)}
      >
        Toutes
      </Button>
      {categories.map((category) => (
        <Button
          key={category.id}
          size="sm"
          variant={value === category.id ? "default" : "outline"}
          onClick={() => onChange(category.id)}
        >
          {category.name}
        </Button>
      ))}
    </div>
  )
}

export { ALL as ALL_CATEGORIES }
