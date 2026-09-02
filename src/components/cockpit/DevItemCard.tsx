import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react"
import { alreadyNotified } from "@/lib/notifyError"
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

/**
 * Les notes archivées finissent souvent par "Commit <hash>." — on rend ce
 * hash cliquable vers GitHub pour retrouver le code réel en un clic
 * (visibilité cockpit → code).
 */
function renderNotes(notes: string) {
  const match = notes.match(/^([\s\S]*commit )([0-9a-f]{7,40})(\.?)$/i)
  if (!match) return notes
  const [, prefix, hash, suffix] = match
  return (
    <>
      {prefix}
      <a
        href={`https://github.com/rnab26/Jarvis-assistant/commit/${hash}`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {hash}
      </a>
      {suffix}
    </>
  )
}

/**
 * Session qui travaille actuellement sur ce chantier, si la réservation court
 * toujours. Une réservation expirée ne compte pas : la session qui l'avait
 * prise a pu être arrêtée sans la libérer.
 */
function reservePar(item: DevItem) {
  if (!item.claimed_by || !item.claim_expires_at) return null
  if (new Date(item.claim_expires_at).getTime() < Date.now()) return null
  return item.claimed_by.replace(/^claude\//, "")
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
        {item.notes && (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{renderNotes(item.notes)}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={PRIORITY_VARIANT[item.priority]}>
            {PRIORITY_LABEL[item.priority]}
          </Badge>
          {reservePar(item) && (
            <Badge variant="secondary">Prise par {reservePar(item)}</Badge>
          )}
        </div>
      </div>
      {onArchive && item.status === "done" && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Archiver"
          onClick={() => onArchive(item.id).catch(alreadyNotified)}
        >
          <Archive className="size-4" />
        </Button>
      )}
      {onUnarchive && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Désarchiver"
          onClick={() => onUnarchive(item.id).catch(alreadyNotified)}
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
        onClick={() => onDelete(item.id).catch(alreadyNotified)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
