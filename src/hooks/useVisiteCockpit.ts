import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import {
  ecrireRepereLocal,
  lireRepereLocal,
  repereApresLecture,
} from "@/lib/cockpitVu"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

export interface VisiteCockpitApi {
  /** La date de la visite PRÉCÉDENTE, ou null à la première ouverture. */
  vuLe: string | null
  /** Vrai tant que la base n'a pas répondu. L'écran s'affiche quand même,
   * avec le repère local : c'est tout l'intérêt du chemin rapide. */
  chargement: boolean
  /** Renseigné quand la base n'a pas pu être lue ou écrite. */
  erreur: string | null
  marquerVu: () => void
}

/**
 * Le repère « déjà vu » du cockpit, partagé entre le téléphone et le site.
 *
 * L'ORDRE COMPTE, et c'est le cœur de ce hook :
 *   1. au montage, on prend le repère LOCAL — instantané, l'écran s'affiche ;
 *   2. la base répond, et le plus récent des deux l'emporte ;
 *   3. et on FIGE. Le repère affiché ne doit plus bouger pendant qu'il
 *      regarde, sinon le bandeau se réécrit sous ses yeux.
 *
 * Une lecture en échec ne recule jamais le repère : on garde ce que l'écran
 * savait déjà. Réannoncer six semaines de travail à quelqu'un qui vient de
 * tout regarder, c'est le défaut qu'on corrige, en pire.
 */
export function useVisiteCockpit(): VisiteCockpitApi {
  const { session } = useAuth()
  const userId = session?.user.id
  const [vuLe, setVuLe] = useState<string | null>(() => lireRepereLocal())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const fige = useRef(false)

  useEffect(() => {
    let vivant = true
    if (!userId) {
      setChargement(false)
      return
    }
    ;(async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.from("visites_cockpit").select("vu_at").maybeSingle(),
        )
        if (!vivant || fige.current) return
        if (error) throw error
        const retenu = repereApresLecture(lireRepereLocal(), {
          ok: true,
          vuLe: (data as { vu_at: string } | null)?.vu_at ?? null,
        })
        setVuLe(retenu)
        // Le chemin rapide du prochain affichage doit dire la même chose que
        // la base, sinon le bandeau clignote à chaque ouverture.
        if (retenu) ecrireRepereLocal(retenu)
        setErreur(null)
      } catch (e) {
        if (!vivant || fige.current) return
        setErreur(e instanceof Error ? e.message : String(e))
      } finally {
        if (vivant) {
          fige.current = true
          setChargement(false)
        }
      }
    })()
    return () => {
      vivant = false
    }
  }, [userId])

  const marquerVu = useCallback(() => {
    const maintenant = new Date().toISOString()
    // Local d'abord : l'écran doit répondre à l'appui, réseau ou pas.
    ecrireRepereLocal(maintenant)
    setVuLe(maintenant)
    fige.current = true
    if (!userId) return
    void (async () => {
      try {
        const { error } = await withTimeout(
          supabase.rpc("marquer_cockpit_vu", { p_vu_at: maintenant }),
        )
        if (error) throw error
        setErreur(null)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [userId])

  return { vuLe, chargement, erreur, marquerVu }
}
