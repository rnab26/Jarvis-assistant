import { Navigate, Outlet } from "react-router-dom"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { MicButton } from "@/components/voice/MicButton"
import { JarvisDataProvider, useJarvisData } from "@/contexts/JarvisDataContext"
import { useAuth } from "@/hooks/useAuth"
import { useShareReceiver } from "@/hooks/useShareReceiver"
import { geocodePlace } from "@/lib/geocodePlace"

function ShellContent() {
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
    devSectionsState,
  } = useJarvisData()

  useShareReceiver(documentsState.saveTextDocument)

  return (
    <DashboardLayout>
      <MicButton
        tasksApi={tasksState}
        devItemsApi={devItemsState}
        devSectionsApi={devSectionsState}
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
      />
      <Outlet />
    </DashboardLayout>
  )
}

/** Vérifie l'authentification puis fournit les données partagées (tâches +
 * chantiers dev + documents) et le micro à toutes les pages protégées
 * (Tâches, Cockpit, Documents). */
export function ProtectedShell() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Chargement...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <JarvisDataProvider>
      <ShellContent />
    </JarvisDataProvider>
  )
}
