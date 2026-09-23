import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { Souvenir } from "@/types/database"

/**
 * Ce que Jarvis a retenu. Il mémorise en silence — c'est le choix de Raphaël —
 * donc cette page est son seul moyen de contrôle : relire, corriger, supprimer.
 */
export function useSouvenirs(userId: string | undefined) {
  const [souvenirs, setSouvenirs] = useState<Souvenir[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setSouvenirs([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase.from("souvenirs").select("*").order("created_at", { ascending: false }).limit(300),
      )
      if (request !== latestRequest.current) return
      if (queryError) throw queryError
      setSouvenirs(data ?? [])
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
  // premier plan. `souvenirs` est dans la publication depuis la migration 0054.
  useRealtimeRefresh("souvenirs", userId, refresh)

  async function corriger(id: string, contenu: string) {
    await withErrorToast("Impossible de corriger ce souvenir", async () => {
      const { error: e } = await supabase
        .from("souvenirs")
        .update({ contenu, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (e) throw e
      await refresh()
    })
  }

  async function oublier(id: string) {
    await withErrorToast("Impossible d'oublier ce souvenir", async () => {
      const { error: e } = await supabase.from("souvenirs").delete().eq("id", id)
      if (e) throw e
      await refresh()
    })
  }

  /** Périmer plutôt que supprimer : Jarvis garde la trace que ça a changé. */
  async function perimer(id: string, perime: boolean) {
    await withErrorToast("Impossible de changer ce souvenir", async () => {
      const { error: e } = await supabase
        .from("souvenirs")
        .update({ perime_at: perime ? new Date().toISOString() : null })
        .eq("id", id)
      if (e) throw e
      await refresh()
    })
  }

  return { souvenirs, loading, error, refresh, corriger, oublier, perimer }
}
