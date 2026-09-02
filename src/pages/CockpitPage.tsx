import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CockpitBoard } from "@/components/cockpit/CockpitBoard"
import { DevItemFormDialog } from "@/components/cockpit/DevItemFormDialog"
import { useJarvisData } from "@/contexts/JarvisDataContext"

export function CockpitPage() {
  const { devItemsState } = useJarvisData()
  const { devItems, loading, addDevItem, updateDevItem, deleteDevItem } = devItemsState

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Chantiers de développement de Jarvis lui-même.
        </p>
        <DevItemFormDialog
          onSubmit={addDevItem}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Chantier
            </Button>
          }
        />
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : (
        <CockpitBoard
          devItems={devItems}
          onUpdate={updateDevItem}
          onDelete={deleteDevItem}
        />
      )}
    </div>
  )
}
