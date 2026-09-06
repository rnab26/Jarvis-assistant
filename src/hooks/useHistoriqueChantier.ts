import { useCallback, useEffect, useRef, useState } from "react"
import { errorMessage } from "@/lib/errorMessage"
import type { LigneHistorique } from "@/lib/historiqueChantier"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/** Assez pour retrouver ce qui a été perdu, pas assez pour devenir un mur. */
const COMBIEN = 30

export interface HistoriqueApi {
  lignes: LigneHistorique[]
  chargement: boolean
  erreur: string | null
  restaurer: (idHistorique: string) => Promise<void>
}

/**
 * Ce qui a changé sur UN chantier.
 *
 * Chargé seulement quand la carte est dépliée : le cockpit affiche soixante
 * chantiers, et soixante requêtes au montage rendraient l'écran inutilisable
 * pour une information que personne ne regarde la plupart du temps.
 */
export function useHistoriqueChantier(itemId: string, actif: boolean): HistoriqueApi {
  const [lignes, setLignes] = useState<LigneHistorique[]>([])
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const demande = useRef(0)

  const charger = useCallback(async () => {
    const n = ++demande.current
    setChargement(true)
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("dev_items_historique")
          .select("*")
          .eq("item_id", itemId)
          .order("change_at", { ascending: false })
          .limit(COMBIEN),
      )
      if (n !== demande.current) return
      if (error) throw error
      setLignes((data ?? []) as LigneHistorique[])
      setErreur(null)
    } catch (e) {
      if (n !== demande.current) return
      setErreur(errorMessage(e))
    } finally {
      if (n === demande.current) setChargement(false)
    }
  }, [itemId])

  useEffect(() => {
    if (actif) charger()
  }, [actif, charger])

  const restaurer = useCallback(
    async (idHistorique: string) => {
      // La restauration passe par une fonction SQL, pas par un `update` d'ici :
      // elle doit elle-même laisser une trace, sinon on remplace une perte par
      // une autre. Le temps réel de `dev_items` redessine la carte tout seul.
      const { error } = await withTimeout(
        supabase.rpc("restaurer_note_chantier", { p_historique: idHistorique }),
      )
      if (error) throw error
      await charger()
    },
    [charger],
  )

  return { lignes, chargement, erreur, restaurer }
}
