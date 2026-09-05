import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/**
 * Le plus long silence NORMAL jamais observé sur l'historique réel de
 * Raphaël : 5 échanges d'affilée sans qu'un seul fait mérite d'être retenu
 * (mesuré le 4 sept. 2026 sur ses 86 échanges et 21 souvenirs, tous les
 * intervalles). Zéro fait retenu est une réponse normale et fréquente — la
 * plupart des échanges n'ont rien à retenir — donc le seuil doit être NETTEMENT
 * au-dessus, sinon le témoin crie au loup et on cesse de le regarder.
 *
 * Douze, soit plus du double. Le jour de la panne, le compte était à 42 : le
 * témoin se serait allumé largement à temps.
 */
export const SILENCE_SUSPECT = 12

export interface SanteMemoire {
  dernierSouvenir: string | null
  souvenirsVivants: number
  echangesDepuis: number
  erreur: {
    titre: string
    detail: string | null
    lastSeen: string
    occurrences: number
  } | null
}

export interface SanteMemoireApi {
  sante: SanteMemoire | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * De quoi savoir si la mémoire tourne encore, sans ouvrir les journaux.
 *
 * La mémorisation est silencieuse par construction (choix de Raphaël) et elle
 * avale ses erreurs : le 4 sept. 2026 elle est restée morte des heures sans
 * que rien ne le dise. Ce hook ne la rend pas bruyante — il rend son état
 * consultable.
 */
export function useSanteMemoire(userId: string | undefined): SanteMemoireApi {
  const [sante, setSante] = useState<SanteMemoire | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setSante(null)
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(supabase.rpc("sante_memoire"))
      if (request !== latestRequest.current) return
      if (queryError) throw queryError
      const ligne = (data ?? [])[0]
      setSante(
        ligne
          ? {
              dernierSouvenir: ligne.dernier_souvenir ?? null,
              souvenirsVivants: ligne.souvenirs_vivants ?? 0,
              echangesDepuis: ligne.echanges_depuis ?? 0,
              erreur: ligne.erreur_titre
                ? {
                    titre: ligne.erreur_titre,
                    detail: ligne.erreur_detail ?? null,
                    lastSeen: ligne.erreur_last_seen,
                    occurrences: ligne.erreur_occurrences ?? 1,
                  }
                : null,
            }
          : null,
      )
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

  return { sante, loading, error, refresh }
}
