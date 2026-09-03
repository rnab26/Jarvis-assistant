import { Navigate, Outlet } from "react-router-dom"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { MicButton } from "@/components/voice/MicButton"
import { JarvisDataProvider, useJarvisData } from "@/contexts/JarvisDataContext"
import { useAuth } from "@/hooks/useAuth"
import { useShareReceiver } from "@/hooks/useShareReceiver"

function ShellContent() {
  const {
    tasksState,
    devItemsState,
    documentsState,
    contactsState,
    placeRemindersState,
    wakeWordState,
    voiceState,
    widgetState,
  } = useJarvisData()

  useShareReceiver(documentsState.saveTextDocument)

  return (
    <DashboardLayout>
      <MicButton
        tasksApi={tasksState}
        devItemsApi={devItemsState}
        documentsApi={documentsState}
        contactsApi={contactsState}
        placeRemindersApi={placeRemindersState}
        widgetApi={{ config: widgetState.config, setConfig: widgetState.setConfig }}
        wakeWordEnabled={wakeWordState.enabled}
        voiceIndex={voiceState.voiceIndex}
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
