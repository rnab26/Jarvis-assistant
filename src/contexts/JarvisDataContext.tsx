import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useContacts } from "@/hooks/useContacts"
import { useDevItems } from "@/hooks/useDevItems"
import { useDialogueSetting } from "@/hooks/useDialogueSetting"
import { useDocuments } from "@/hooks/useDocuments"
import { useGeofenceSetting } from "@/hooks/useGeofenceSetting"
import { useGoogleAccount } from "@/hooks/useGoogleAccount"
import { useNotifications } from "@/hooks/useNotifications"
import { usePlaceGeofences } from "@/hooks/usePlaceGeofences"
import { usePlaceReminders } from "@/hooks/usePlaceReminders"
import { usePronunciations } from "@/hooks/usePronunciations"
import { useReglagesSync } from "@/hooks/useReglagesSync"
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
type PronunciationsState = ReturnType<typeof usePronunciations>
type GeofenceState = ReturnType<typeof useGeofenceSetting>
type GoogleAccountState = ReturnType<typeof useGoogleAccount>
type WakeWordState = ReturnType<typeof useWakeWordSetting>
type DialogueState = ReturnType<typeof useDialogueSetting>
type VoiceState = ReturnType<typeof useVoiceSetting>
type WidgetState = ReturnType<typeof useWidgetSetting>
type NotificationsState = ReturnType<typeof useNotifications>

interface JarvisDataValue {
  tasksState: TasksState
  devItemsState: DevItemsState
  documentsState: DocumentsState
  contactsState: ContactsState
  placeRemindersState: PlaceRemindersState
  pronunciationsState: PronunciationsState
  geofenceState: GeofenceState
  googleAccountState: GoogleAccountState
  wakeWordState: WakeWordState
  dialogueState: DialogueState
  voiceState: VoiceState
  widgetState: WidgetState
  notificationsState: NotificationsState
}

const JarvisDataContext = createContext<JarvisDataValue | null>(null)

/**
 * Charge une seule fois les tâches, les chantiers de dev et les documents
 * de l'utilisateur (partagés entre le dashboard, le cockpit, les documents
 * et le micro) pour éviter de refetch et de dupliquer le bouton micro sur
 * chaque page. Porte aussi les préférences "mot-clé de réveil", "rythme de
 * discussion", "voix" et "widget", partagées entre Paramètres et leurs consommateurs respectifs.
 */
export function JarvisDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id

  const tasksState = useTasks(userId)
  const devItemsState = useDevItems(userId)
  const documentsState = useDocuments(userId)
  const contactsState = useContacts(userId)
  const placeRemindersState = usePlaceReminders(userId)
  const pronunciationsState = usePronunciations(userId)
  const geofenceState = useGeofenceSetting()
  const googleAccountState = useGoogleAccount(userId)
  const wakeWordState = useWakeWordSetting()
  const dialogueState = useDialogueSetting()
  const voiceState = useVoiceSetting()
  const widgetState = useWidgetSetting()

  usePlaceGeofences(placeRemindersState.placeReminders, geofenceState.enabled)

  // Les rappels d'Android : montés ici, et pas dans Paramètres, parce qu'ils
  // doivent être reprogrammés dès qu'une tâche change — y compris quand le
  // changement vient de la voix ou d'un autre appareil. Un écran de réglages
  // qu'on n'ouvre pas ne reprogrammerait plus rien.
  const notificationsState = useNotifications(tasksState.tasks, devItemsState.devItems, userId)

  // Les réglages personnels (voix, rythme, widget, mot-clé, géolocalisation,
  // image du réacteur) ne vivaient que sur l'appareil : une réinstallation de
  // l'app les effaçait, et ils n'existaient pas côté web. Ils sont maintenant
  // conservés en base et restaurés à la connexion.
  useReglagesSync(userId)

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
        pronunciationsState,
        geofenceState,
        googleAccountState,
        wakeWordState,
        dialogueState,
        voiceState,
        widgetState,
        notificationsState,
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
