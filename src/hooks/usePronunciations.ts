import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { Pronunciation, PronunciationInput } from "@/types/database"

/**
 * Corrections de transcription retenues au fil des discussions : ce que la
 * dictée entend, et ce que Raphaël dit en réalité.
 */
export function usePronunciations(userId: string | undefined) {
  const [pronunciations, setPronunciations] = useState<Pronunciation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setPronunciations([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase.from("prononciations").select("*").order("created_at", { ascending: false }),
      )

      if (request !== latestRequest.current) return
      if (queryError) throw queryError

      setPronunciations(data ?? [])
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

  async function addPronunciation(input: PronunciationInput) {
    if (!userId) return
    await withErrorToast("Impossible d'enregistrer la prononciation", async () => {
      const { error } = await supabase.from("prononciations").insert({ ...input, user_id: userId })
      if (error) throw error
      await refresh()
    })
  }

  async function deletePronunciation(id: string) {
    await withErrorToast("Impossible de supprimer la prononciation", async () => {
      const { error } = await supabase.from("prononciations").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  return { pronunciations, loading, error, refresh, addPronunciation, deletePronunciation }
}
