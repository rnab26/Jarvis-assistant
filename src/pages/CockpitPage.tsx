import { LoadError } from "@/components/LoadError"
import { CockpitBoard, themesDe } from "@/components/cockpit/CockpitBoard"
import { DevLogFeed } from "@/components/cockpit/DevLogFeed"
import { EnvoyerAClaudeCode } from "@/components/cockpit/EnvoyerAClaudeCode"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { useAuth } from "@/hooks/useAuth"
import { useDevLog } from "@/hooks/useDevLog"

/**
 * Le cockpit, de haut en bas : ce qu'on envoie, ce qu'on se dit entre
 * sessions, ce qui est en cours. Le journal est collé à la fenêtre d'envoi —
 * les deux servent à PILOTER les sessions, pas à consulter la liste des
 * chantiers — plutôt que séparé d'elle par tout le tableau (Raphaël, 3 sept. :
 * « cette fenêtre est complètement perdue, autant la rapprocher de la fenêtre
 * qui crée les chantiers »).
 *
 * Le bouton « + Chantier » qui ouvrait un formulaire à cinq champs a été
 * retiré : il faisait exactement la même chose que la fenêtre d'envoi, en
 * plus laborieux, et deux chemins vers le même résultat obligent à choisir
 * avant d'agir. Le formulaire complet reste accessible là où il sert vraiment
 * — le crayon d'une carte, pour retoucher un chantier existant.
 */
export function CockpitPage() {
  const { devItemsState } = useJarvisData()
  const { session } = useAuth()
  const devLog = useDevLog(session?.user.id)
  const {
    devItems,
    loading,
    error,
    refresh,
    addDevItem,
    updateDevItem,
    deleteDevItem,
    archiveDevItem,
    unarchiveDevItem,
  } = devItemsState

  return (
    <div className="flex flex-col gap-4">
      <EnvoyerAClaudeCode
        devItems={devItems}
        themes={themesDe(devItems)}
        onSend={addDevItem}
      />

      <DevLogFeed
        entries={devLog.entries}
        devItems={devItems}
        loading={devLog.loading}
        error={devLog.error}
        onRefresh={devLog.refresh}
        onAdd={devLog.addEntry}
        onMarkAnswered={devLog.markAnswered}
      />

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : error ? (
        <LoadError message={error} onRetry={refresh} />
      ) : (
        <CockpitBoard
          devItems={devItems}
          onUpdate={updateDevItem}
          onDelete={deleteDevItem}
          onArchive={archiveDevItem}
          onUnarchive={unarchiveDevItem}
        />
      )}
    </div>
  )
}
