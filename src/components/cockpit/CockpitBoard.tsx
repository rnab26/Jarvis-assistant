import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DevItemCard } from "@/components/cockpit/DevItemCard"
import type { DevItem, DevItemInput, DevStatus } from "@/types/database"

const COLUMNS: { status: DevStatus; label: string }[] = [
  { status: "todo", label: "À faire" },
  { status: "in_progress", label: "En cours" },
  { status: "done", label: "Terminé" },
]

interface CockpitBoardProps {
  devItems: DevItem[]
  onUpdate: (id: string, input: DevItemInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onUnarchive: (id: string) => Promise<void>
}

export function CockpitBoard({
  devItems,
  onUpdate,
  onDelete,
  onArchive,
  onUnarchive,
}: CockpitBoardProps) {
  const active = devItems.filter((i) => !i.archived_at)
  const archived = devItems
    .filter((i) => i.archived_at)
    .sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""))

  if (devItems.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Aucun chantier pour l'instant.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {COLUMNS.map((column) => {
        const items = active.filter((i) => i.status === column.status)
        if (items.length === 0) return null

        return (
          <Card key={column.status}>
            <CardHeader>
              <CardTitle className="text-base">
                {column.label} ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {items.map((item) => (
                <DevItemCard
                  key={item.id}
                  item={item}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onArchive={onArchive}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}

      {archived.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              Archivées ({archived.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {archived.map((item) => (
              <DevItemCard
                key={item.id}
                item={item}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onUnarchive={onUnarchive}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
