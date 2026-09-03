import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { DevItem, DevItemInput } from "@/types/database"

export function useDevItems(userId: string | undefined) {
  const [devItems, setDevItems] = useState<DevItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Voir useTasks : garde-fou contre deux chargements simultanés qui
  // reviendraient dans le désordre.
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setDevItems([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase
          .from("dev_items")
          .select("*")
          .order("created_at", { ascending: false }),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (queryError) throw queryError

      setDevItems(data ?? [])
      setError(null)
    } catch (e) {
      // Sans ce catch, une coupure réseau bloquait le cockpit sur
      // "Chargement..." définitivement.
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
  useRealtimeRefresh("dev_items", userId, refresh)

  async function addDevItem(input: DevItemInput) {
    if (!userId) return
    await withErrorToast("Impossible d'ajouter le chantier", async () => {
      const { error } = await supabase
        .from("dev_items")
        .insert({ ...input, user_id: userId })
      if (error) throw error
      await refresh()
    })
  }

  async function updateDevItem(id: string, input: Partial<DevItemInput>) {
    await withErrorToast("Impossible de modifier le chantier", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function deleteDevItem(id: string) {
    await withErrorToast("Impossible de supprimer le chantier", async () => {
      const { error } = await supabase.from("dev_items").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function archiveDevItem(id: string) {
    await withErrorToast("Impossible d'archiver le chantier", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({ status: "done", archived_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function unarchiveDevItem(id: string) {
    await withErrorToast("Impossible de désarchiver le chantier", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({ archived_at: null })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  return {
    devItems,
    loading,
    error,
    refresh,
    addDevItem,
    updateDevItem,
    deleteDevItem,
    archiveDevItem,
    unarchiveDevItem,
  }
}
