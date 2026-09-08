import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useActualisation } from "@/hooks/useActualisation"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useFileEnAttente } from "@/hooks/useFileEnAttente"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { CLE_FILE, estBloque, phraseHorsLigne } from "@/lib/fileEnAttente"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { Category, Task, TaskInput } from "@/types/database"

export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  // "loading" ne reflète que le tout premier chargement : les rafraîchissements
  // après un ajout/modif/suppression (y compris via la voix) ne doivent pas
  // faire clignoter toute la liste en "Chargement...".
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Quand la liste a été chargée pour de bon. Sert à dire depuis combien de
  // temps l'écran peut mentir, une fois le direct coupé.
  const [derniereMaj, setDerniereMaj] = useState<number | null>(null)
  // Numéro du dernier chargement lancé : deux refresh simultanés (la voix qui
  // ajoute une tâche pendant que l'utilisateur en modifie une) peuvent revenir
  // dans le désordre, et la réponse la plus ancienne écrasait la plus récente.
  const latestRequest = useRef(0)


  const refresh = useCallback(async () => {
    if (!userId) {
      setTasks([])
      setCategories([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const [tasksResult, categoriesResult] = await withTimeout(
        Promise.all([
          supabase
            .from("tasks")
            .select("*")
            // Second critère de tri indispensable : sans lui, toutes les
            // tâches sans échéance (la majorité de celles dictées à la voix)
            // remontaient dans un ordre arbitraire choisi par Postgres, qui
            // pouvait changer d'un chargement à l'autre — une tâche qu'on
            // venait d'ajouter apparaissait n'importe où dans la liste, ce
            // qui se voit exactement comme un affichage pas rafraîchi.
            .order("due_date", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: false }),
          // L'ordre qu'il a choisi au crayon (migration 0033), puis la date de
          // création pour celles qu'il n'a jamais rangées. Trié ICI et pas dans
          // chaque écran : la liste, le filtre, le formulaire et Paramètres
          // reçoivent tous la même chose, sinon ils finiraient par se
          // contredire. `nullsFirst: false` met les non rangées à la fin —
          // une nouvelle catégorie arrive au bout, elle ne s'insère pas au
          // milieu de son classement.
          supabase
            .from("categories")
            .select("*")
            .order("position", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
        ]),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (tasksResult.error) throw tasksResult.error
      if (categoriesResult.error) throw categoriesResult.error

      setTasks(tasksResult.data ?? [])
      setCategories(categoriesResult.data ?? [])
      setError(null)
      // Posé ICI et pas au retour de la promesse : seul un chargement dont on
      // a gardé le résultat compte. Une réponse périmée (deux refresh en vol)
      // sort plus haut, et daterait une liste qu'on n'affiche pas.
      setDerniereMaj(Date.now())
    } catch (e) {
      // Sans ce catch, une simple coupure réseau laissait "loading" à true pour
      // toujours : l'écran restait sur "Chargement..." sans message ni retry.
      if (request !== latestRequest.current) return
      setError(errorMessage(e))
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }, [userId])

  // ── Ce qu'il a dicté sans réseau ──────────────────────────────────────────
  // Le raisonnement est dans `src/lib/fileEnAttente.ts` (pur, vérifié hors
  // ligne) ; le tampon, l'envoi et les déclencheurs vivent dans
  // `useFileEnAttente`, PARTAGÉS avec les chantiers dictés depuis le chantier
  // 8b804a01 plutôt que recopiés. Deux boucles de renvoi qui finiraient par ne
  // plus se comporter pareil, sur le seul mécanisme dont le rôle est de ne
  // rien perdre, était le vrai danger.
  const fileApi = useFileEnAttente<TaskInput>({
    cle: CLE_FILE,
    cible: "tasks",
    table: "tasks",
    userId,
    refresh,
    titreAbandon: "Tâche dictée jamais enregistrée",
  })

  useEffect(() => {
    refresh()
  }, [refresh])

  // Au retour au premier plan : on recharge ET on vide la file — c'est le cas
  // où il rouvre l'app après être sorti du tunnel.
  useRefreshOnForeground(() => {
    void fileApi.vider()
    return refresh()
  })
  // Les DEUX canaux comptent : une catégorie renommée ailleurs et jamais
  // reçue ferait afficher l'ancien nom sur toutes les lignes.
  const canalTaches = useRealtimeRefresh("tasks", userId, refresh)
  const canalCategories = useRealtimeRefresh("categories", userId, refresh)
  const { statut, enCours, actualiser } = useActualisation(refresh, [canalTaches, canalCategories])

  /**
   * Rend l'id de la tâche créée — la commande vocale en a besoin pour
   * compléter la même tâche juste après (date dictée dans la foulée,
   * catégorie suggérée puis validée : voir voiceActions.ts).
   *
   * ET `enAttente` DISTINGUE DEUX CAS QUI SE RESSEMBLAIENT, ce qui faisait
   * MENTIR Jarvis à voix haute (chantier 9476c7a0). Avant, on rendait
   * `undefined` aussi bien quand rien n'avait été écrit (pas de session) que
   * quand la dictée était partie dans la file d'attente hors ligne — et
   * `voiceActions` disait « Tâche "…" ajoutée. » dans les deux cas. Au passé
   * accompli, pour une tâche qui n'est PAS enregistrée. C'est exactement ce
   * que `_shared/honnetete.ts` interdit depuis le 6 sept. : « n'annonce
   * jamais au passé ce que tu n'as pas constaté ».
   *
   * `undefined` = rien du tout. `{ id, enAttente: true }` = notée, pas
   * enregistrée. `{ id, enAttente: false }` = en base, et elle seule peut
   * être complétée plus tard.
   */
  async function addTask(input: TaskInput): Promise<{ id: string; enAttente: boolean } | undefined> {
    if (!userId) return
    // L'IDENTIFIANT EST FABRIQUÉ ICI, pas par Postgres, et c'est tout le
    // mécanisme : un renvoi porte le même id, donc il ne peut pas créer un
    // second exemplaire. Le cas qui arrive vraiment n'est pas « l'écriture a
    // échoué », c'est « elle a réussi et la réponse s'est perdue ».
    const id = nouvelId()
    try {
      const { error } = await withTimeout(
        supabase.from("tasks").insert({ ...input, id, user_id: userId }),
      )
      if (error) throw error
      await refresh()
      return { id, enAttente: false }
    } catch (e) {
      // ON NE DIT PAS « impossible d'ajouter la tâche » : elle n'est pas
      // perdue, elle est notée. Le toast d'échec de withErrorToast dirait le
      // contraire de ce qui se passe.
      fileApi.ajouter(id, input, input.title, e)
      toast.info(phraseHorsLigne(input.title))
      // Notée, pas enregistrée — et l'appelant doit pouvoir le DIRE.
      return { id, enAttente: true }
    }
  }

  async function updateTask(id: string, input: Partial<TaskInput>) {
    await withErrorToast("Impossible de modifier la tâche", async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function deleteTask(id: string) {
    await withErrorToast("Impossible de supprimer la tâche", async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function toggleStatus(task: Task) {
    await updateTask(task.id, {
      status: task.status === "todo" ? "done" : "todo",
    })
  }

  async function addCategory(name: string) {
    if (!userId) return
    await withErrorToast("Impossible d'ajouter la catégorie", async () => {
      const { error } = await supabase
        .from("categories")
        .insert({ name, user_id: userId })
      if (error) throw error
      await refresh()
    })
  }

  /**
   * Renommer une catégorie. La vérification (nom vide, doublon) vit dans
   * `ordreCategories.ts` et se fait AVANT l'appel : un refus doit se voir
   * tout de suite, pas après un aller-retour réseau.
   */
  async function renameCategory(id: string, name: string) {
    if (!userId) return
    await withErrorToast("Impossible de renommer la catégorie", async () => {
      const { error } = await supabase
        .from("categories")
        .update({ name: name.trim() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  /**
   * Supprimer une catégorie. Les tâches qui y étaient ne sont PAS supprimées :
   * `category_id` retombe à null et elles reparaissent dans « Sans catégorie ».
   * Perdre une catégorie est un rangement ; perdre les tâches dedans serait une
   * perte de données, et il n'y a pas de corbeille pour les tâches.
   */
  async function deleteCategory(id: string) {
    if (!userId) return
    await withErrorToast("Impossible de supprimer la catégorie", async () => {
      const { error: err1 } = await supabase
        .from("tasks")
        .update({ category_id: null })
        .eq("category_id", id)
      if (err1) throw err1
      const { error } = await supabase.from("categories").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  /**
   * Écrire le nouvel ordre. UNE requête par catégorie déplacée serait dix
   * allers-retours pour un geste : si la connexion lâche au milieu, l'ordre
   * reste à moitié appliqué. On envoie donc tout d'un coup, en upsert.
   */
  async function reorderCategories(positions: { id: string; position: number }[]) {
    if (!userId || positions.length === 0) return
    await withErrorToast("Impossible d'enregistrer l'ordre", async () => {
      const lignes = positions.map((p) => {
        const existante = categories.find((c) => c.id === p.id)
        return { id: p.id, user_id: userId, name: existante?.name ?? "", position: p.position }
      })
      const { error } = await supabase.from("categories").upsert(lignes)
      if (error) throw error
      await refresh()
    })
  }

  // Ce qui attend s'affiche DANS LA LISTE, marqué. Un tampon invisible serait
  // un mensonge de plus : il a dicté quelque chose, il doit le voir.
  // Les plus récentes en tête, comme une tâche fraîchement ajoutée.
  const tachesAvecFile = useMemo<Task[]>(() => {
    if (fileApi.file.length === 0) return tasks
    const enAttente: Task[] = fileApi.file.map((e) => ({
      id: e.id,
      user_id: userId ?? "",
      category_id: e.contenu.category_id,
      title: e.contenu.title,
      notes: e.contenu.notes,
      due_date: e.contenu.due_date,
      due_time: e.contenu.due_time,
      status: e.contenu.status,
      created_at: new Date(e.creeA).toISOString(),
      updated_at: new Date(e.creeA).toISOString(),
      enAttente: true,
      echecEnvoi: e.dernierEchec,
      envoiBloque: estBloque(e),
    }))
    // Un élément déjà écrit ET encore en file (le renvoi n'a pas eu lieu)
    // ferait doublon à l'écran : l'id est le même des deux côtés, on garde la
    // ligne de la base, qui est la vraie.
    const dejaEnBase = new Set(tasks.map((t) => t.id))
    return [...enAttente.filter((t) => !dejaEnBase.has(t.id)), ...tasks]
  }, [tasks, fileApi.file, userId])

  return {
    derniereMaj,
    statutDirect: statut,
    actualisationEnCours: enCours,
    actualiser,
    tasks: tachesAvecFile,
    categories,
    /** Ce qui attend d'être écrit, pour l'écran qui le montre. */
    fileEnAttente: fileApi.file,
    /** Vrai quand le tampon n'a PAS pu être lu : ce n'est pas « rien en
     * attente », c'est « on ne sait pas ». */
    fileIllisible: fileApi.illisible,
    relancerEnvoi: fileApi.relancerEnvoi,
    oublierEnAttente: fileApi.oublier,
    viderLaFile: fileApi.vider,
    loading,
    error,
    refresh,
    addTask,
    updateTask,
    deleteTask,
    toggleStatus,
    addCategory,
    renameCategory,
    deleteCategory,
    reorderCategories,
  }
}

/** L'id que la ligne AURA en base. `crypto.randomUUID` n'existe pas partout
 * (vieux WebView, contexte non sécurisé) : on ne veut pas qu'une tâche dictée
 * se perde à cause de ça, d'où le repli. */
function nouvelId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
  } catch {
    // On tombe dans le repli ci-dessous.
  }
  const alea = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0")
  return `${alea()}${alea()}-${alea()}-4${alea().slice(1)}-a${alea().slice(1)}-${alea()}${alea()}${alea()}`
}
