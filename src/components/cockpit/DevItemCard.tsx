import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DevItemFormDialog } from "@/components/cockpit/DevItemFormDialog"
import type { DevItem, DevItemInput, DevPriority } from "@/types/database"

const PRIORITY_LABEL: Record<DevPriority, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
}

const PRIORITY_VARIANT: Record<DevPriority, "secondary" | "outline" | "destructive"> = {
  low: "secondary",
  normal: "outline",
  high: "destructive",
}

interface DevItemCardProps {
  item: DevItem
  onUpdate: (id: string, input: DevItemInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onArchive?: (id: string) => Promise<void>
  onUnarchive?: (id: string) => Promise<void>
}

export function DevItemCard({
  item,
  onUpdate,
  onDelete,
  onArchive,
  onUnarchive,
}: DevItemCardProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border p-3">
      <div className="flex-1">
        <p>{item.title}</p>
        {item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}
        <Badge variant={PRIORITY_VARIANT[item.priority]} className="mt-1">
          {PRIORITY_LABEL[item.priority]}
        </Badge>
      </div>
      {onArchive && item.status === "done" && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Archiver"
          onClick={() => onArchive(item.id)}
        >
          <Archive className="size-4" />
        </Button>
      )}
      {onUnarchive && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Désarchiver"
          onClick={() => onUnarchive(item.id)}
        >
          <ArchiveRestore className="size-4" />
        </Button>
      )}
      <DevItemFormDialog
        item={item}
        onSubmit={(input) => onUpdate(item.id, input)}
        trigger={
          <Button variant="ghost" size="icon" aria-label="Modifier">
            <Pencil className="size-4" />
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Supprimer"
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
