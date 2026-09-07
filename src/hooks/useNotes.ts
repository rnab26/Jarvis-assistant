import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { Note, NoteInput } from "@/types/database"

/** Les notes personnelles (chantier 5ad49cc0), en base et pas seulement à
 * l'écran : elles suivent son compte, pas son appareil. */
export function useNotes(userId: string | undefined) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Voir useTasks : garde-fou contre deux chargements simultanés qui
  // reviendraient dans le désordre.
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setNotes([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase
          .from("notes")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
      )
      if (request !== latestRequest.current) return // réponse périmée
      if (queryError) throw queryError
      setNotes((data ?? []) as Note[])
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
  useRealtimeRefresh("notes", userId, refresh)

  async function addNote(input: NoteInput) {
    if (!userId) return
    return await withErrorToast("Impossible d'ajouter la note", async () => {
      const { data, error } = await supabase
        .from("notes")
        .insert({ ...input, user_id: userId })
        .select()
        .single()
      if (error) throw error
      await refresh()
      return data as Note
    })
  }

  async function updateNote(id: string, input: Partial<NoteInput>) {
    await withErrorToast("Impossible de modifier la note", async () => {
      const { error } = await supabase
        .from("notes")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function deleteNote(id: string) {
    await withErrorToast("Impossible de supprimer la note", async () => {
      const { error } = await supabase.from("notes").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  return { notes, loading, error, refresh, addNote, updateNote, deleteNote }
}
