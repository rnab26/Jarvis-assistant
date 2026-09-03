import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DevItemCard } from "@/components/cockpit/DevItemCard"
import type { DevItem, DevItemInput, DevPriority, DevStatus } from "@/types/database"

/** Faute de thème, un chantier n'est pas caché : il est signalé comme à classer. */
export const SANS_THEME = "À classer"

const POIDS_PRIORITE: Record<DevPriority, number> = { high: 3, normal: 2, low: 1 }
/** En cours d'abord : c'est ce qui bouge maintenant. */
const POIDS_STATUT: Record<DevStatus, number> = { in_progress: 3, todo: 2, done: 1 }

/** Les thèmes présents, dans l'ordre où ils apparaissent à l'écran. */
export function themesDe(devItems: DevItem[]): string[] {
  return [...new Set(devItems.map((i) => i.theme).filter((t): t is string => !!t))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  )
}

function trierChantiers(items: DevItem[]) {
  return [...items].sort(
    (a, b) =>
      POIDS_STATUT[b.status] - POIDS_STATUT[a.status] ||
      POIDS_PRIORITE[b.priority] - POIDS_PRIORITE[a.priority] ||
      a.created_at.localeCompare(b.created_at),
  )
}

/**
 * Regroupe par thème, le plus chargé en priorité haute en premier.
 *
 * Le tableau était groupé par statut, ce qui éparpillait un même sujet sur
 * trois colonnes : on corrigeait un symptôme sans voir ses voisins. Le thème
 * devient l'axe principal, le statut et la priorité restent lisibles sur
 * chaque carte.
 */
function grouperParTheme(items: DevItem[]) {
  const groupes = new Map<string, DevItem[]>()
  for (const item of items) {
    const cle = item.theme?.trim() || SANS_THEME
    groupes.set(cle, [...(groupes.get(cle) ?? []), item])
  }

  return [...groupes.entries()]
    .map(([theme, chantiers]) => ({
      theme,
      chantiers: trierChantiers(chantiers),
      urgence: Math.max(...chantiers.map((i) => POIDS_PRIORITE[i.priority])),
    }))
    .sort(
      (a, b) =>
        // "À classer" reste en bas : c'est une liste d'attente, pas un sujet.
        Number(a.theme === SANS_THEME) - Number(b.theme === SANS_THEME) ||
        b.urgence - a.urgence ||
        b.chantiers.length - a.chantiers.length ||
        a.theme.localeCompare(b.theme, "fr"),
    )
}

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
  const themes = themesDe(devItems)
  const groupes = grouperParTheme(devItems.filter((i) => !i.archived_at))
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
      {groupes.map(({ theme, chantiers }) => (
        <Card key={theme}>
          <CardHeader>
            <CardTitle className="text-base">
              {theme} ({chantiers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {chantiers.map((item) => (
              <DevItemCard
                key={item.id}
                item={item}
                themes={themes}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onArchive={onArchive}
              />
            ))}
          </CardContent>
        </Card>
      ))}

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
                themes={themes}
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
