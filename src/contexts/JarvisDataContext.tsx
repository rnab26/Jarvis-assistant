import { createContext, useContext, type ReactNode } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useDevItems } from "@/hooks/useDevItems"
import { useDocuments } from "@/hooks/useDocuments"
import { useTasks } from "@/hooks/useTasks"

type TasksState = ReturnType<typeof useTasks>
type DevItemsState = ReturnType<typeof useDevItems>
type DocumentsState = ReturnType<typeof useDocuments>

interface JarvisDataValue {
  tasksState: TasksState
  devItemsState: DevItemsState
  documentsState: DocumentsState
}

const JarvisDataContext = createContext<JarvisDataValue | null>(null)

/**
 * Charge une seule fois les tâches, les chantiers de dev et les documents
 * de l'utilisateur (partagés entre le dashboard, le cockpit, les documents
 * et le micro) pour éviter de refetch et de dupliquer le bouton micro sur
 * chaque page.
 */
export function JarvisDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id

  const tasksState = useTasks(userId)
  const devItemsState = useDevItems(userId)
  const documentsState = useDocuments(userId)

  return (
    <JarvisDataContext.Provider value={{ tasksState, devItemsState, documentsState }}>
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
