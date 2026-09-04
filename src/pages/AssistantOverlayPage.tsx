import { MicButton } from "@/components/voice/MicButton"
import { JarvisDataProvider, useJarvisData } from "@/contexts/JarvisDataContext"
import { useAuth } from "@/hooks/useAuth"
import { AssistOverlay } from "@/lib/assistOverlayPlugin"
import { geocodePlace } from "@/lib/geocodePlace"

/**
 * Ce que voit l'appui long : pas le tableau de bord, juste le micro, dans la
 * fenêtre en surcouche ouverte par AssistOverlayActivity. Mêmes données et
 * mêmes actions que l'app normale (même JarvisDataProvider), sans sa
 * barre latérale ni ses pages.
 */
function AssistantOverlayContent() {
  const {
    tasksState,
    devItemsState,
    documentsState,
    contactsState,
    placeRemindersState,
    pronunciationsState,
    geofenceState,
    wakeWordState,
    dialogueState,
    voiceState,
    widgetState,
  } = useJarvisData()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 rounded-t-3xl bg-background/95 px-6 pb-10 pt-8">
      <MicButton
        tasksApi={tasksState}
        devItemsApi={devItemsState}
        documentsApi={documentsState}
        contactsApi={contactsState}
        placeRemindersApi={{
          ...placeRemindersState,
          geocodePlace: geofenceState.enabled ? geocodePlace : null,
        }}
        pronunciationsApi={pronunciationsState}
        voiceSettingApi={{ muted: voiceState.muted, setMuted: voiceState.setMuted }}
        widgetApi={{ config: widgetState.config, setConfig: widgetState.setConfig }}
        wakeWordEnabled={wakeWordState.enabled}
        voiceIndex={voiceState.voiceIndex}
        suiteMs={dialogueState.suiteMs}
        onIdle={() => {
          AssistOverlay.fermer().catch(() => {})
        }}
      />
    </div>
  )
}

export function AssistantOverlayPage() {
  const { session, loading } = useAuth()

  if (loading) return null

  if (!session) {
    return (
      <div className="flex min-h-svh items-center justify-center rounded-t-3xl bg-background/95 px-6 py-8 text-center text-sm text-muted-foreground">
        Connecte-toi dans Jarvis pour utiliser cette fenêtre.
      </div>
    )
  }

  return (
    <JarvisDataProvider>
      <AssistantOverlayContent />
    </JarvisDataProvider>
  )
}
