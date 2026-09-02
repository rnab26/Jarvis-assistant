import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { DevItem, DevItemInput } from "@/types/database"

export function useDevItems(userId: string | undefined) {
  const [devItems, setDevItems] = useState<DevItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) return

    const { data, error } = await supabase
      .from("dev_items")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error

    setDevItems(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addDevItem(input: DevItemInput) {
    if (!userId) return
    const { error } = await supabase
      .from("dev_items")
      .insert({ ...input, user_id: userId })
    if (error) throw error
    await refresh()
  }

  async function updateDevItem(id: string, input: Partial<DevItemInput>) {
    const { error } = await supabase
      .from("dev_items")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
    await refresh()
  }

  async function deleteDevItem(id: string) {
    const { error } = await supabase.from("dev_items").delete().eq("id", id)
    if (error) throw error
    await refresh()
  }

  async function archiveDevItem(id: string) {
    const { error } = await supabase
      .from("dev_items")
      .update({ status: "done", archived_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
    await refresh()
  }

  async function unarchiveDevItem(id: string) {
    const { error } = await supabase
      .from("dev_items")
      .update({ archived_at: null })
      .eq("id", id)
    if (error) throw error
    await refresh()
  }

  return {
    devItems,
    loading,
    addDevItem,
    updateDevItem,
    deleteDevItem,
    archiveDevItem,
    unarchiveDevItem,
  }
}
