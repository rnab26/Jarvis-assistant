import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import type { PasseAutonome } from "@/lib/passeAutonome"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/** Assez pour voir la journée, pas assez pour que l'écran devienne une liste. */
const COMBIEN = 10

/**
 * Les dernières passes des sessions autonomes.
 *
 * C'est la seule chose qui distingue « il n'y avait rien à faire cette nuit »
 * de « le déclencheur ne tourne plus depuis trois jours ». Les deux se
 * ressemblent parfaitement quand on ne regarde que le dépôt.
 */
export function usePassesAutonomes(userId: string | undefined) {
  const [passes, setPasses] = useState<PasseAutonome[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const demande = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setPasses([])
      setError(null)
      setLoading(false)
      return
    }
    const n = ++demande.current
    try {
      const { data, error: err } = await withTimeout(
        supabase
          .from("passes_autonomes")
          .select("*")
          .order("demarre_at", { ascending: false })
          .limit(COMBIEN),
      )
      if (n !== demande.current) return
      if (err) throw err
      setPasses((data ?? []) as PasseAutonome[])
      setError(null)
    } catch (e) {
      if (n !== demande.current) return
      setError(errorMessage(e))
    } finally {
      if (n === demande.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useRefreshOnForeground(refresh)

  return { passes, loading, error, refresh }
}
