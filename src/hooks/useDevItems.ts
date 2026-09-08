import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useActualisation } from "@/hooks/useActualisation"
import { toast } from "sonner"
import { useFileEnAttente } from "@/hooks/useFileEnAttente"
import { CLE_FILE_CHANTIERS, estBloque, phraseHorsLigne } from "@/lib/fileEnAttente"
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
  // Quand la liste a été chargée pour de bon. Dit depuis combien de temps
  // l'écran peut mentir, une fois le direct coupé.
  const [derniereMaj, setDerniereMaj] = useState<number | null>(null)
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
      setDerniereMaj(Date.now())
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

  // ── Ce qu'il a dicté sans réseau ────────────────────────────────────────
  // Même mécanisme que les tâches, MÊME code (chantier 8b804a01) — pas une
  // seconde boucle de renvoi qui finirait par ne plus se comporter pareil.
  // Sa propre clé de stockage, en revanche : deux hooks qui réécriraient le
  // même tampon s'effaceraient mutuellement.
  const fileApi = useFileEnAttente<DevItemInput>({
    cle: CLE_FILE_CHANTIERS,
    cible: "dev_items",
    table: "dev_items",
    userId,
    refresh,
    titreAbandon: "Chantier dicté jamais enregistré",
  })

  useRefreshOnForeground(() => {
    void fileApi.vider()
    return refresh()
  })
  const canal = useRealtimeRefresh("dev_items", userId, refresh)
  const { statut, enCours, actualiser } = useActualisation(refresh, [canal])

  /** Renvoie le chantier créé : le registre des erreurs en a besoin pour
   * rattacher l'erreur au chantier qu'elle vient d'ouvrir. */
  /**
   * Ajoute un chantier — et le NOTE plutôt que de le perdre quand le réseau
   * manque (chantier 8b804a01).
   *
   * Exactement le même cas que les tâches dictées : « Jarvis, ajoute un
   * chantier pour… » n'existe que dans le navigateur au moment où l'écriture
   * échoue, et le cas qui motive tout ça est « il dicte en conduisant, dans un
   * tunnel ». Deux chantiers dictés le 5 sept. à 18h20 et 19h32 ont déjà été
   * perdus comme ça ; il a dû les redicter.
   *
   * L'IDENTIFIANT EST FABRIQUÉ ICI, pas par Postgres, et c'est tout le
   * mécanisme : un renvoi porte le même id, donc il ne peut pas créer un
   * second exemplaire. Le cas qui arrive vraiment n'est pas « l'écriture a
   * échoué », c'est « elle a réussi et la réponse s'est perdue ».
   */
  async function addDevItem(input: DevItemInput): Promise<DevItem | undefined> {
    if (!userId) return
    const id = crypto.randomUUID()
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("dev_items")
          .insert({ ...input, id, user_id: userId })
          .select()
          .single(),
      )
      if (error) throw error
      await refresh()
      return data as DevItem
    } catch (e) {
      // ON NE DIT PAS « impossible d'ajouter le chantier » : il n'est pas
      // perdu, il est noté. Le toast d'échec de withErrorToast dirait le
      // contraire de ce qui se passe.
      fileApi.ajouter(id, input, input.title, e)
      toast.info(phraseHorsLigne(input.title))
      return undefined
    }
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

  /**
   * Libère la réservation d'un chantier qu'une session a laissée derrière
   * elle. Une session interrompue ne libère rien : sa réservation expire, mais
   * le chantier continue d'afficher « Prise par … » jusqu'à la date, et on
   * croit qu'il est traité alors que personne n'est dessus.
   */
  async function libererReservation(id: string) {
    await withErrorToast("Impossible de libérer le chantier", async () => {
      const { error } = await supabase
        .from("dev_items")
        .update({
          claimed_by: null,
          claimed_at: null,
          claim_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
      if (error) throw error
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

  // Ce qui attend s'affiche DANS LA LISTE, marqué — même règle que les
  // tâches : un tampon invisible serait un mensonge de plus.
  const chantiersAvecFile = useMemo<DevItem[]>(() => {
    if (fileApi.file.length === 0) return devItems
    const enAttente: DevItem[] = fileApi.file.map((e) => ({
      id: e.id,
      user_id: userId ?? "",
      title: e.contenu.title,
      notes: e.contenu.notes ?? null,
      status: e.contenu.status ?? "todo",
      priority: e.contenu.priority ?? "normal",
      theme: e.contenu.theme ?? null,
      archived_at: null,
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
      created_at: new Date(e.creeA).toISOString(),
      updated_at: new Date(e.creeA).toISOString(),
      enAttente: true,
      echecEnvoi: e.dernierEchec,
      envoiBloque: estBloque(e),
    }))
    // Un élément déjà écrit ET encore en file (le renvoi n'a pas eu lieu)
    // ferait doublon à l'écran : l'id est le même des deux côtés, on garde la
    // ligne de la base, qui est la vraie.
    const dejaEnBase = new Set(devItems.map((i) => i.id))
    return [...enAttente.filter((i) => !dejaEnBase.has(i.id)), ...devItems]
  }, [devItems, fileApi.file, userId])

  return {
    devItems: chantiersAvecFile,
    /** Ce qui attend d'être écrit, pour l'écran qui le montre. */
    fileEnAttente: fileApi.file,
    /** Vrai quand le tampon n'a PAS pu être lu : ce n'est pas « rien en
     * attente », c'est « on ne sait pas ». */
    fileIllisible: fileApi.illisible,
    relancerEnvoi: fileApi.relancerEnvoi,
    oublierEnAttente: fileApi.oublier,
    derniereMaj,
    statutDirect: statut,
    actualisationEnCours: enCours,
    actualiser,
    loading,
    error,
    refresh,
    addDevItem,
    updateDevItem,
    deleteDevItem,
    archiveDevItem,
    unarchiveDevItem,
    libererReservation,
    updateManyDevItems,
    archiveManyDevItems,
    deleteManyDevItems,
    restoreDevItems,
  }
}
