import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { DevSection } from "@/types/database"

/**
 * Les sections de chantiers : créer, renommer, décrire, réordonner, fusionner,
 * supprimer.
 *
 * Toutes les opérations qui touchent AUSSI les chantiers (renommer, fusionner,
 * supprimer) passent par une fonction SQL, jamais par deux écritures d'ici :
 * le nom de la section et le `theme` de ses chantiers doivent bouger ensemble
 * ou pas du tout. Deux appels séparés, et une coupure réseau au milieu laisse
 * des chantiers rattachés à une section qui n'existe plus.
 *
 * `rafraichirChantiers` est appelé après chaque opération de ce genre : les
 * chantiers viennent d'un autre hook, et sans ça la liste affichée garderait
 * l'ancien nom de section jusqu'au prochain rechargement.
 */
export function useDevSections(userId: string | undefined, rafraichirChantiers?: () => void) {
  const [sections, setSections] = useState<DevSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)
  // Le rafraîchissement des chantiers change à chaque rendu du parent : le
  // garder dans une ref évite de recréer toutes les actions à chaque fois.
  const rafraichirRef = useRef(rafraichirChantiers)
  useEffect(() => {
    rafraichirRef.current = rafraichirChantiers
  })

  const refresh = useCallback(async () => {
    if (!userId) {
      setSections([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase.from("dev_sections").select("*").order("position", { ascending: true }),
      )
      if (request !== latestRequest.current) return
      if (queryError) throw queryError
      setSections(data ?? [])
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
  useRealtimeRefresh("dev_sections", userId, refresh)

  /** Après une opération qui a pu déplacer des chantiers. */
  async function toutRafraichir() {
    await refresh()
    rafraichirRef.current?.()
  }

  async function addSection(nom: string, description: string | null = null) {
    if (!userId) return
    await withErrorToast("Impossible de créer la section", async () => {
      const { error } = await supabase.from("dev_sections").insert({
        user_id: userId,
        nom: nom.trim(),
        description: description?.trim() || null,
        // À la fin de la liste : une section neuve ne s'insère pas au milieu
        // de l'ordre que Raphaël a choisi.
        position: sections.reduce((max, s) => Math.max(max, s.position), 0) + 1,
      })
      // Le message brut de Postgres ("duplicate key value violates unique
      // constraint") ne dit rien à qui le lit sur un téléphone.
      if (error) throw new Error(estDoublon(error) ? "Une section porte déjà ce nom." : error.message)
      await refresh()
    })
  }

  async function updateSection(id: string, description: string | null) {
    await withErrorToast("Impossible de modifier la section", async () => {
      const { error } = await supabase
        .from("dev_sections")
        .update({ description: description?.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  /** Renomme la section ET tous ses chantiers. Renvoie le nombre de chantiers
   * déplacés, pour pouvoir le dire plutôt que de laisser deviner. */
  async function renameSection(id: string, nom: string): Promise<number> {
    return await withErrorToast("Impossible de renommer la section", async () => {
      const { data, error } = await supabase.rpc("renommer_section", { p_id: id, p_nom: nom.trim() })
      if (error) throw new Error(estDoublon(error) ? "Une section porte déjà ce nom." : error.message)
      await toutRafraichir()
      return (data as number) ?? 0
    })
  }

  async function mergeSections(source: string, cible: string): Promise<number> {
    return await withErrorToast("Impossible de fusionner les sections", async () => {
      const { data, error } = await supabase.rpc("fusionner_sections", {
        p_source: source,
        p_cible: cible,
      })
      if (error) throw error
      await toutRafraichir()
      return (data as number) ?? 0
    })
  }

  /** Supprime la section. `vers` = section de destination des chantiers, ou
   * null pour les renvoyer dans « À classer » — jamais de suppression en
   * cascade : une section est un rangement, pas un contenant. */
  async function removeSection(id: string, vers: string | null): Promise<number> {
    return await withErrorToast("Impossible de supprimer la section", async () => {
      const { data, error } = await supabase.rpc("supprimer_section", { p_id: id, p_vers: vers })
      if (error) throw error
      await toutRafraichir()
      return (data as number) ?? 0
    })
  }

  async function reorderSections(ids: string[]) {
    // Affichage optimiste : sur un téléphone, une flèche qui met une seconde
    // à bouger donne l'impression que l'appui n'a pas été pris.
    //
    // Sauf si la liste reçue ne couvre pas ce qu'on affiche — une section
    // créée sur un autre appareil, arrivée entre-temps par le temps réel :
    // elle serait absente du tableau, `indexOf` rendrait -1, et elle
    // remonterait en tête sous ses yeux avant que la base ne le démente.
    // Dans ce cas on laisse simplement la base répondre.
    setSections((actuelles) =>
      actuelles.length !== ids.length || actuelles.some((s) => !ids.includes(s.id))
        ? actuelles
        : [...actuelles]
            .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
            .map((s, i) => ({ ...s, position: i + 1 })),
    )
    await withErrorToast("Impossible de réordonner les sections", async () => {
      const { error } = await supabase.rpc("reordonner_sections", { p_ids: ids })
      if (error) throw error
      await refresh()
    }).catch(async () => {
      // L'ordre optimiste était faux : on remet ce que dit la base.
      await refresh()
    })
  }

  return {
    sections,
    loading,
    error,
    refresh,
    addSection,
    updateSection,
    renameSection,
    mergeSections,
    removeSection,
    reorderSections,
  }
}

function estDoublon(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || (error.message ?? "").includes("duplicate key")
}
