import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { Category, Task, TaskInput } from "@/types/database"

export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  // "loading" ne reflète que le tout premier chargement : les rafraîchissements
  // après un ajout/modif/suppression (y compris via la voix) ne doivent pas
  // faire clignoter toute la liste en "Chargement...".
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Numéro du dernier chargement lancé : deux refresh simultanés (la voix qui
  // ajoute une tâche pendant que l'utilisateur en modifie une) peuvent revenir
  // dans le désordre, et la réponse la plus ancienne écrasait la plus récente.
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setTasks([])
      setCategories([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const [tasksResult, categoriesResult] = await withTimeout(
        Promise.all([
          supabase
            .from("tasks")
            .select("*")
            .order("due_date", { ascending: true, nullsFirst: false }),
          supabase.from("categories").select("*").order("name"),
        ]),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (tasksResult.error) throw tasksResult.error
      if (categoriesResult.error) throw categoriesResult.error

      setTasks(tasksResult.data ?? [])
      setCategories(categoriesResult.data ?? [])
      setError(null)
    } catch (e) {
      // Sans ce catch, une simple coupure réseau laissait "loading" à true pour
      // toujours : l'écran restait sur "Chargement..." sans message ni retry.
      if (request !== latestRequest.current) return
      setError(errorMessage(e))
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useRefreshOnForeground(refresh)

  async function addTask(input: TaskInput) {
    if (!userId) return
    await withErrorToast("Impossible d'ajouter la tâche", async () => {
      const { error } = await supabase
        .from("tasks")
        .insert({ ...input, user_id: userId })
      if (error) throw error
      await refresh()
    })
  }

  async function updateTask(id: string, input: Partial<TaskInput>) {
    await withErrorToast("Impossible de modifier la tâche", async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function deleteTask(id: string) {
    await withErrorToast("Impossible de supprimer la tâche", async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function toggleStatus(task: Task) {
    await updateTask(task.id, {
      status: task.status === "todo" ? "done" : "todo",
    })
  }

  async function addCategory(name: string) {
    if (!userId) return
    await withErrorToast("Impossible d'ajouter la catégorie", async () => {
      const { error } = await supabase
        .from("categories")
        .insert({ name, user_id: userId })
      if (error) throw error
      await refresh()
    })
  }

  return {
    tasks,
    categories,
    loading,
    error,
    refresh,
    addTask,
    updateTask,
    deleteTask,
    toggleStatus,
    addCategory,
  }
}
