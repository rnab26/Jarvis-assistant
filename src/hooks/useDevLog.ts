import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { DevLogEntry, DevLogKind } from "@/types/database"

/** Ce que Raphaël écrit depuis l'app, par opposition aux sessions Claude Code. */
export const AUTEUR_RAPHAEL = "Raphaël"

const LIMITE = 60

/**
 * Journal de bord partagé : les sessions Claude Code qui travaillent en
 * parallèle sur ce repo s'y posent des questions, et Raphaël y répond ou y
 * donne des consignes depuis l'app.
 */
export function useDevLog(userId: string | undefined) {
  const [entries, setEntries] = useState<DevLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setEntries([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase
          .from("dev_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(LIMITE),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (queryError) throw queryError

      setEntries(data ?? [])
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

  async function addEntry(body: string, kind: DevLogKind = "info", itemId: string | null = null) {
    if (!userId) return
    await withErrorToast("Impossible d'écrire dans le journal", async () => {
      const { error: insertError } = await supabase.from("dev_log").insert({
        user_id: userId,
        item_id: itemId,
        author: AUTEUR_RAPHAEL,
        kind,
        body,
      })
      if (insertError) throw insertError
      await refresh()
    })
  }

  /** Marque une question comme traitée, pour qu'elle sorte des points en attente. */
  async function markAnswered(id: string) {
    await withErrorToast("Impossible de marquer ce message comme traité", async () => {
      const { error: updateError } = await supabase
        .from("dev_log")
        .update({ answered_at: new Date().toISOString() })
        .eq("id", id)
      if (updateError) throw updateError
      await refresh()
    })
  }

  return { entries, loading, error, refresh, addEntry, markAnswered }
}
