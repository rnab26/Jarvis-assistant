import { LoadError } from "@/components/LoadError"
import { CockpitBoard, themesDe } from "@/components/cockpit/CockpitBoard"
import { DevLogFeed } from "@/components/cockpit/DevLogFeed"
import { EnvoyerAClaudeCode } from "@/components/cockpit/EnvoyerAClaudeCode"
import { ErreursJarvis } from "@/components/cockpit/ErreursJarvis"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { useAuth } from "@/hooks/useAuth"
import { useDevLog } from "@/hooks/useDevLog"
import { cleTheme } from "@/lib/themeChantier"

/**
 * Le cockpit, de haut en bas : ce qu'on envoie, ce qu'on se dit entre
 * sessions, ce que Jarvis rate, ce qui est en cours. Le journal est collé à la
 * fenêtre d'envoi — les deux servent à PILOTER les sessions, pas à consulter
 * la liste des chantiers — plutôt que séparé d'elle par tout le tableau
 * (Raphaël, 3 sept. : « cette fenêtre est complètement perdue, autant la
 * rapprocher de la fenêtre qui crée les chantiers »).
 *
 * Le registre des erreurs est au-dessus du tableau et replié : c'est une liste
 * qu'on vient consulter ou alimenter, pas celle qu'on lit tous les jours.
 *
 * Le bouton « + Chantier » qui ouvrait un formulaire à cinq champs a été
 * retiré : il faisait exactement la même chose que la fenêtre d'envoi, en
 * plus laborieux, et deux chemins vers le même résultat obligent à choisir
 * avant d'agir. Le formulaire complet reste accessible là où il sert vraiment
 * — le crayon d'une carte, pour retoucher un chantier existant.
 */
export function CockpitPage() {
  const { devItemsState, devSectionsState, erreursState } = useJarvisData()
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
    updateManyDevItems,
    archiveManyDevItems,
    deleteManyDevItems,
    restoreDevItems,
  } = devItemsState

  // Les puces de la fenêtre d'envoi listent les sections déclarées ET les
  // thèmes déjà portés par un chantier : une section créée à l'avance et
  // encore vide doit pouvoir recevoir le premier chantier, sinon elle ne sert
  // à rien tant qu'on n'y a rien mis.
  const themes = [
    ...devSectionsState.sections.map((s) => s.nom),
    ...themesDe(devItems).filter(
      (t) => !devSectionsState.sections.some((s) => cleTheme(s.nom) === cleTheme(t)),
    ),
  ]

  return (
    <div className="flex flex-col gap-4">
      <EnvoyerAClaudeCode
        devItems={devItems}
        sections={devSectionsState.sections}
        themes={themes}
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

      <ErreursJarvis
        erreursState={erreursState}
        devItems={devItems}
        sections={devSectionsState.sections}
        onCreerChantier={addDevItem}
      />

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : error ? (
        <LoadError message={error} onRetry={refresh} />
      ) : (
        <CockpitBoard
          devItems={devItems}
          sectionsState={devSectionsState}
          onUpdate={updateDevItem}
          onDelete={deleteDevItem}
          onArchive={archiveDevItem}
          onUnarchive={unarchiveDevItem}
          onUpdateMany={updateManyDevItems}
          onArchiveMany={archiveManyDevItems}
          onDeleteMany={deleteManyDevItems}
          onRestore={restoreDevItems}
        />
      )}
    </div>
  )
}
