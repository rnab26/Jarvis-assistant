import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/**
 * Le plus long silence NORMAL jamais observé sur l'historique réel de
 * Raphaël. Remesuré le 7 sept. 2026 (chantier de vérification du témoin,
 * sur ses 199 échanges et 32 souvenirs réels, tous les intervalles entre deux
 * souvenirs créés ou fusionnés) : 12 se déclenchait à TORT plusieurs fois par
 * jour depuis le 5 sept. — des rafales de 13, 14, 15, 15 puis 24 échanges
 * d'affilée sans rien à retenir, toutes vérifiées une par une (les appels au
 * modèle de mémoire y répondaient 200, et les échanges eux-mêmes ne
 * contenaient aucun fait à extraire : créations de tâches et de chantiers,
 * ouvertures d'application — exclues de la mémoire par consigne). Ce n'est
 * pas la mémoire qui a changé, c'est l'usage : il enchaîne plus de commandes
 * d'action pures qu'au moment de la première mesure.
 *
 * Trente, nettement au-dessus de ce 24 mesuré, tout en restant sous la seule
 * vraie panne connue (42 échanges, le 4 sept.) : un témoin qui se tairait
 * jusqu'à 42 rattraperait une vraie panne plus tard que ne le faisait déjà
 * l'ancien seuil. Zéro fait retenu est une réponse normale et fréquente — la
 * plupart des échanges n'ont rien à retenir — donc le seuil doit rester
 * NETTEMENT au-dessus du silence normal, sinon le témoin crie au loup et on
 * cesse de le regarder.
 */
export const SILENCE_SUSPECT = 30

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
