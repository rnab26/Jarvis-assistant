import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react"
import { alreadyNotified } from "@/lib/notifyError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DevItemFormDialog } from "@/components/cockpit/DevItemFormDialog"
import type { DevItem, DevItemInput, DevPriority, DevStatus } from "@/types/database"

/** « Normale » reste implicite : c'est la priorité de presque tous les
 * chantiers, l'afficher sur chacun ne distingue rien et mange la place du
 * titre. Même raisonnement que pour « À faire » ci-dessous. */
const PRIORITY_LABEL: Partial<Record<DevPriority, string>> = {
  low: "Basse",
  high: "Haute",
}

/** Le tableau est groupé par thème : le statut, lui, se lit sur la carte.
 * "À faire" reste implicite — c'est le cas de la plupart, l'afficher n'ajoute
 * que du bruit sur un écran de téléphone. */
const STATUS_LABEL: Partial<Record<DevStatus, string>> = {
  in_progress: "En cours",
  done: "Terminé",
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
  /** Thèmes déjà utilisés, proposés à la saisie lors d'une modification. */
  themes?: string[]
  onUpdate: (id: string, input: DevItemInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onArchive?: (id: string) => Promise<void>
  onUnarchive?: (id: string) => Promise<void>
}

export function DevItemCard({
  item,
  themes,
  onUpdate,
  onDelete,
  onArchive,
  onUnarchive,
}: DevItemCardProps) {
  // Même densité que les tâches (option « compact » choisie par Raphaël le
  // 3 sept. 2026) : plus de cadre par chantier, un filet entre deux, les
  // étiquettes dans la ligne du titre. Deux listes qui se ressemblent doivent
  // se lire pareil — sinon le cockpit paraît inachevé à côté des tâches.
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        {/* Une seule ligne, donc au plus deux étiquettes courtes à droite du
            titre : à trois, elles écrasaient le titre jusqu'à le faire
            disparaître sur un écran de téléphone. « Prise par … » descend donc
            avec la note, dont elle a la nature — un détail qu'on lit après
            avoir trouvé le chantier, pas un critère pour le trouver. */}
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm" title={item.title}>
            {item.title}
          </span>
          {STATUS_LABEL[item.status] && (
            <Badge variant="default" className="shrink-0 px-1.5 text-xs font-normal">
              {STATUS_LABEL[item.status]}
            </Badge>
          )}
          {PRIORITY_LABEL[item.priority] && (
            <Badge
              variant={PRIORITY_VARIANT[item.priority]}
              className="shrink-0 px-1.5 text-xs font-normal"
            >
              {PRIORITY_LABEL[item.priority]}
            </Badge>
          )}
        </div>
        {reservePar(item) && (
          <p className="truncate text-xs text-muted-foreground">
            Prise par {reservePar(item)}
          </p>
        )}
        {item.notes && (
          // Trois lignes ici, contre deux pour une tâche : les notes d'un
          // chantier portent le cadrage, et c'est ce qu'on vient y lire.
          <p className="line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">
            {renderNotes(item.notes)}
          </p>
        )}
      </div>
      {onArchive && item.status === "done" && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Archiver"
          onClick={() => onArchive(item.id).catch(alreadyNotified)}
        >
          <Archive className="size-3.5" />
        </Button>
      )}
      {onUnarchive && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Désarchiver"
          onClick={() => onUnarchive(item.id).catch(alreadyNotified)}
        >
          <ArchiveRestore className="size-3.5" />
        </Button>
      )}
      <DevItemFormDialog
        item={item}
        themes={themes}
        onSubmit={(input) => onUpdate(item.id, input)}
        trigger={
          <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Modifier">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="Supprimer"
        onClick={() => onDelete(item.id).catch(alreadyNotified)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
