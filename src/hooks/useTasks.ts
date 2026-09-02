import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { Category, Task, TaskInput } from "@/types/database"

export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  // "loading" ne reflète que le tout premier chargement : les rafraîchissements
  // après un ajout/modif/suppression (y compris via la voix) ne doivent pas
  // faire clignoter toute la liste en "Chargement...".
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) return

    const [tasksResult, categoriesResult] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("categories").select("*").order("name"),
    ])

    if (tasksResult.error) throw tasksResult.error
    if (categoriesResult.error) throw categoriesResult.error

    setTasks(tasksResult.data ?? [])
    setCategories(categoriesResult.data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addTask(input: TaskInput) {
    if (!userId) return
    const { error } = await supabase
      .from("tasks")
      .insert({ ...input, user_id: userId })
    if (error) throw error
    await refresh()
  }

  async function updateTask(id: string, input: Partial<TaskInput>) {
    const { error } = await supabase
      .from("tasks")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
    await refresh()
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", id)
    if (error) throw error
    await refresh()
  }

  async function toggleStatus(task: Task) {
    await updateTask(task.id, {
      status: task.status === "todo" ? "done" : "todo",
    })
  }

  async function addCategory(name: string) {
    if (!userId) return
    const { error } = await supabase
      .from("categories")
      .insert({ name, user_id: userId })
    if (error) throw error
    await refresh()
  }

  return {
    tasks,
    categories,
    loading,
    addTask,
    updateTask,
    deleteTask,
    toggleStatus,
    addCategory,
  }
}
