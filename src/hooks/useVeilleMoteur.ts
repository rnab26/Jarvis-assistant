import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { supabase } from "@/lib/supabase"
import type { MoteurChoisi, PasseVeille } from "@/lib/veilleMoteur"
import { withTimeout } from "@/lib/withTimeout"

/** Assez pour voir la semaine, pas assez pour que la carte devienne une liste. */
const COMBIEN = 8

/**
 * Les dernières passes de la veille, et le modèle en service.
 *
 * C'est la seule chose qui distingue « il n'y avait rien de neuf » de « la
 * veille ne tourne plus depuis trois jours » — les deux se ressemblent
 * parfaitement quand on ne regarde que le fait que le modèle n'a pas changé.
 */
export function useVeilleMoteur() {
  const [passes, setPasses] = useState<PasseVeille[]>([])
  const [choix, setChoix] = useState<MoteurChoisi | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const demande = useRef(0)

  const refresh = useCallback(async () => {
    const n = ++demande.current
    try {
      const [v, m] = await Promise.all([
        withTimeout(
          supabase
            .from("veilles_modele")
            .select("id, demarre_at, fini_at, verdict, detail")
            .order("demarre_at", { ascending: false })
            .limit(COMBIEN),
        ),
        withTimeout(
          supabase
            .from("moteur_choisi")
            .select("role, modele, secours, promu_at, promu_par, raison")
            .eq("role", "commande")
            .maybeSingle(),
        ),
      ])
      if (n !== demande.current) return
      if (v.error) throw v.error
      if (m.error) throw m.error
      setPasses((v.data ?? []) as PasseVeille[])
      setChoix((m.data ?? null) as MoteurChoisi | null)
      setError(null)
    } catch (err) {
      if (n !== demande.current) return
      // Une panne de LECTURE ne dit rien de la veille elle-même : elle dit
      // qu'on n'arrive pas à la consulter d'ici. La carte le formule ainsi,
      // plutôt que d'afficher une absence qui se lirait comme « rien ne
      // tourne ».
      setError(errorMessage(err))
    } finally {
      if (n === demande.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])
  useRefreshOnForeground(refresh)

  return { passes, choix, loading, error, refresh }
}
