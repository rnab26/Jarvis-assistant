import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useContacts } from "@/hooks/useContacts"
import { useDevItems } from "@/hooks/useDevItems"
import { useDocuments } from "@/hooks/useDocuments"
import { usePlaceReminders } from "@/hooks/usePlaceReminders"
import { useTasks } from "@/hooks/useTasks"
import { useVoiceSetting } from "@/hooks/useVoiceSetting"
import { useWakeWordSetting } from "@/hooks/useWakeWordSetting"
import { useWidgetSetting } from "@/hooks/useWidgetSetting"
import { updateWidgetSnapshot } from "@/lib/widgetSnapshot"

type TasksState = ReturnType<typeof useTasks>
type DevItemsState = ReturnType<typeof useDevItems>
type DocumentsState = ReturnType<typeof useDocuments>
type ContactsState = ReturnType<typeof useContacts>
type PlaceRemindersState = ReturnType<typeof usePlaceReminders>
type WakeWordState = ReturnType<typeof useWakeWordSetting>
type VoiceState = ReturnType<typeof useVoiceSetting>
type WidgetState = ReturnType<typeof useWidgetSetting>

interface JarvisDataValue {
  tasksState: TasksState
  devItemsState: DevItemsState
  documentsState: DocumentsState
  contactsState: ContactsState
  placeRemindersState: PlaceRemindersState
  wakeWordState: WakeWordState
  voiceState: VoiceState
  widgetState: WidgetState
}

const JarvisDataContext = createContext<JarvisDataValue | null>(null)

/**
 * Charge une seule fois les tâches, les chantiers de dev et les documents
 * de l'utilisateur (partagés entre le dashboard, le cockpit, les documents
 * et le micro) pour éviter de refetch et de dupliquer le bouton micro sur
 * chaque page. Porte aussi les préférences "mot-clé de réveil", "voix" et
 * "widget", partagées entre Paramètres et leurs consommateurs respectifs.
 */
export function JarvisDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id

  const tasksState = useTasks(userId)
  const devItemsState = useDevItems(userId)
  const documentsState = useDocuments(userId)
  const contactsState = useContacts(userId)
  const placeRemindersState = usePlaceReminders(userId)
  const wakeWordState = useWakeWordSetting()
  const voiceState = useVoiceSetting()
  const widgetState = useWidgetSetting()

  // Met à jour le widget d'écran d'accueil à chaque changement de tâches
  // (ajout/modif/suppression, y compris par la voix) ou de sa config
  // (Paramètres) — sans faire échouer l'affichage des tâches si ça rate.
  useEffect(() => {
    updateWidgetSnapshot(tasksState.tasks, tasksState.categories, widgetState.config).catch(
      () => {},
    )
  }, [tasksState.tasks, tasksState.categories, widgetState.config])

  return (
    <JarvisDataContext.Provider
      value={{
        tasksState,
        devItemsState,
        documentsState,
        contactsState,
        placeRemindersState,
        wakeWordState,
        voiceState,
        widgetState,
      }}
    >
      {children}
    </JarvisDataContext.Provider>
  )
}

export function useJarvisData() {
  const ctx = useContext(JarvisDataContext)
  if (!ctx) {
    throw new Error("useJarvisData doit être utilisé à l'intérieur de <JarvisDataProvider>")
  }
  return ctx
}
