import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { DevItem, DevItemInput, DevPriority, DevStatus } from "@/types/database"

/** Ce qu'il faut retenir d'un chantier pour pouvoir le remettre comme il
 * était : les quatre champs que les actions groupées touchent. */
export interface EtatChantier {
  id: string
  status: DevStatus
  priority: DevPriority
  theme: string | null
  archived_at: string | null
}

/** L'état d'un chantier, tel qu'on le mémorise avant d'agir dessus. */
export function etatDe(item: DevItem): EtatChantier {
  return {
    id: item.id,
    status: item.status,
    priority: item.priority,
    theme: item.theme,
    archived_at: item.archived_at,
  }
}

export function useDevItems(userId: string | undefined) {
  const [devItems, setDevItems] = useState<DevItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Voir useTasks : garde-fou contre deux chargements simultanés qui
  // reviendraient dans le désordre.
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setDevItems([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase
          .from("dev_items")
          .select("*")
          .order("created_at", { ascending: false }),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (queryError) throw queryError

      setDevItems(data ?? [])
      setError(null)
    } catch (e) {
      // Sans ce catch, une coupure réseau bloquait le cockpit sur
      // "Chargement..." définitivement.
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
  useRealtimeRefresh("dev_items", userId, refresh)

  /** Renvoie le chantier créé : le registre des erreurs en a besoin pour
   * rattacher l'erreur au chantier qu'elle vient d'ouvrir. */
  async function addDevItem(input: DevItemInput): Promise<DevItem | undefined> {
    if (!userId) return
    return await withErrorToast("Impossible d'ajouter le chantier", async () => {
      const { data, error } = await supabase
        .from("dev_items")
        .insert({ ...input, user_id: userId })
        .select()
        .single()
      if (error) throw error
      await refresh()
      return data as DevItem
    })
  }

  async function updateDevItem(id: string, input: Partial<DevItemInput>) {
    await withErrorToast("Impossible de modifier le chantier", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function deleteDevItem(id: string) {
    await withErrorToast("Impossible de supprimer le chantier", async () => {
      const { error } = await supabase.from("dev_items").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function archiveDevItem(id: string) {
    await withErrorToast("Impossible d'archiver le chantier", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({ status: "done", archived_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  /**
   * Les actions groupées : une seule requête pour tout le lot.
   *
   * Un appel par chantier ferait vingt allers-retours pour reclasser un
   * thème, et laisserait le travail à moitié fait si la connexion lâche au
   * milieu — c'est exactement ce que la règle du dépôt interdit.
   */
  async function updateManyDevItems(ids: string[], patch: Partial<DevItemInput>) {
    if (ids.length === 0) return
    await withErrorToast("Impossible de modifier les chantiers", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .in("id", ids)
      if (error) throw error
      await refresh()
    })
  }

  async function archiveManyDevItems(ids: string[]) {
    if (ids.length === 0) return
    await withErrorToast("Impossible d'archiver les chantiers", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({ status: "done", archived_at: new Date().toISOString() })
        .in("id", ids)
      if (error) throw error
      await refresh()
    })
  }

  async function deleteManyDevItems(ids: string[]) {
    if (ids.length === 0) return
    await withErrorToast("Impossible de supprimer les chantiers", async () => {
      const { error } = await supabase.from("dev_items").delete().in("id", ids)
      if (error) throw error
      await refresh()
    })
  }

  /**
   * Remet les chantiers dans l'état où ils étaient : c'est le « Annuler » du
   * bandeau. Il doit marcher même quand le lot mélange des chantiers qui
   * n'avaient ni le même statut ni la même section.
   *
   * Les chantiers sont donc regroupés par état d'origine, et il part une
   * requête par état — deux ou trois en pratique — plutôt qu'une par
   * chantier. Un `upsert` serait plus court mais faux : PostgreSQL construit
   * d'abord la ligne à insérer, et refuserait faute de titre.
   */
  async function restoreDevItems(etats: EtatChantier[]) {
    if (etats.length === 0) return
    await withErrorToast("Impossible d'annuler", async () => {
      const lots = new Map<string, { etat: EtatChantier; ids: string[] }>()
      for (const etat of etats) {
        const cle = JSON.stringify([etat.status, etat.priority, etat.theme, etat.archived_at])
        const lot = lots.get(cle) ?? { etat, ids: [] }
        lot.ids.push(etat.id)
        lots.set(cle, lot)
      }

      for (const { etat, ids } of lots.values()) {
        const { error } = await supabase
          .from("dev_items")
          .update({
            status: etat.status,
            priority: etat.priority,
            theme: etat.theme,
            archived_at: etat.archived_at,
            updated_at: new Date().toISOString(),
          })
          .in("id", ids)
        if (error) throw error
      }
      await refresh()
    })
  }

  async function unarchiveDevItem(id: string) {
    await withErrorToast("Impossible de désarchiver le chantier", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({ archived_at: null })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  return {
    devItems,
    loading,
    error,
    refresh,
    addDevItem,
    updateDevItem,
    deleteDevItem,
    archiveDevItem,
    unarchiveDevItem,
    updateManyDevItems,
    archiveManyDevItems,
    deleteManyDevItems,
    restoreDevItems,
  }
}
