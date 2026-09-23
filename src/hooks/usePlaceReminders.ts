import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { PlaceReminder, PlaceReminderInput } from "@/types/database"

export function usePlaceReminders(userId: string | undefined) {
  const [placeReminders, setPlaceReminders] = useState<PlaceReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setPlaceReminders([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase.from("place_reminders").select("*").order("created_at", { ascending: false }),
      )

      if (request !== latestRequest.current) return
      if (queryError) throw queryError

      setPlaceReminders(data ?? [])
      setError(null)
    } catch (e) {
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
  // En direct (chantier e687f0e2) : ce qui change ailleurs — sur le site,
  // par la voix, par une session — s'affiche sans attendre le retour au
  // premier plan. `place_reminders` est dans la publication depuis la migration 0054.
  useRealtimeRefresh("place_reminders", userId, refresh)

  async function addPlaceReminder(input: PlaceReminderInput) {
    if (!userId) return
    await withErrorToast("Impossible d'ajouter le rappel", async () => {
      const { error } = await supabase
        .from("place_reminders")
        .insert({ ...input, user_id: userId })
      if (error) throw error
      await refresh()
    })
  }

  async function deletePlaceReminder(id: string) {
    await withErrorToast("Impossible de supprimer le rappel", async () => {
      const { error } = await supabase.from("place_reminders").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  return { placeReminders, loading, error, refresh, addPlaceReminder, deletePlaceReminder }
}
