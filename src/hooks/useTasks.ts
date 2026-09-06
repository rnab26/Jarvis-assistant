import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { signalerErreur } from "@/lib/erreurs"
import {
  CLE_FILE,
  aRenvoyer,
  estBloque,
  lireFile,
  mettreEnFile,
  noterEchec,
  phraseHorsLigne,
  relancer,
  retirerDeLaFile,
  serialiserFile,
  type ElementEnAttente,
} from "@/lib/fileEnAttente"
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
  // Numéro du dernier chargement lancé : deux refresh simultanés (la voix qui
  // ajoute une tâche pendant que l'utilisateur en modifie une) peuvent revenir
  // dans le désordre, et la réponse la plus ancienne écrasait la plus récente.
  const latestRequest = useRef(0)

  // ── Ce qu'il a dicté sans réseau ──────────────────────────────────────────
  // Le raisonnement est dans src/lib/fileEnAttente.ts, qui est pur et vérifié
  // hors ligne. Ici il n'y a que le tampon, l'envoi et la relance.
  const [file, setFile] = useState<ElementEnAttente<TaskInput>[]>([])
  // Une file qu'on n'a pas pu LIRE ne se lit pas comme une file vide : sinon
  // on lui dirait « rien en attente » alors qu'on n'en sait rien.
  const [fileIllisible, setFileIllisible] = useState(false)
  // La boucle de renvoi vit dans un effet monté UNE FOIS : sans cette
  // référence elle garderait la file du premier rendu, c'est-à-dire vide,
  // et ne renverrait jamais rien. Le piège est exactement celui déjà payé
  // dans MicButton le 4 sept. (« derniersRef »).
  const fileRef = useRef<ElementEnAttente<TaskInput>[]>([])

  useEffect(() => {
    let brut: string | null = null
    try {
      brut = localStorage.getItem(CLE_FILE)
    } catch {
      setFileIllisible(true)
      return
    }
    const lue = lireFile(brut)
    if (lue === null) setFileIllisible(true)
    else {
      fileRef.current = lue as ElementEnAttente<TaskInput>[]
      setFile(fileRef.current)
    }
  }, [])

  // Écrit à CHAQUE changement, sans attendre : le cas qui compte est celui où
  // il range son téléphone tout de suite après avoir dicté.
  const ecrireFile = useCallback((suivante: ElementEnAttente<TaskInput>[]) => {
    fileRef.current = suivante
    setFile(suivante)
    try {
      localStorage.setItem(CLE_FILE, serialiserFile(suivante))
    } catch {
      // Le stockage peut être plein ou refusé (navigation privée). On garde la
      // file en mémoire — elle sert encore pour cette session — mais on ne
      // prétend pas qu'elle survivra à la fermeture.
      setFileIllisible(true)
    }
  }, [])

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
          supabase.from("categories").select("*").order("name"),
        ]),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (tasksResult.error) throw tasksResult.error
      if (categoriesResult.error) throw categoriesResult.error

      setTasks(tasksResult.data ?? [])
      setCategories(categoriesResult.data ?? [])
      setError(null)
    } catch (e) {
      // Sans ce catch, une simple coupure réseau laissait "loading" à true pour
      // toujours : l'écran restait sur "Chargement..." sans message ni retry.
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
  useRealtimeRefresh("tasks", userId, refresh)
  useRealtimeRefresh("categories", userId, refresh)

  async function addTask(input: TaskInput) {
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
    } catch (e) {
      // ON NE DIT PAS « impossible d'ajouter la tâche » : elle n'est pas
      // perdue, elle est notée. Le toast d'échec de withErrorToast dirait le
      // contraire de ce qui se passe.
      ecrireFile(
        mettreEnFile(file, {
          id,
          cible: "tasks",
          contenu: input,
          libelle: input.title,
          creeA: Date.now(),
          essais: 0,
          dernierEchec: errorMessage(e),
          dernierEssaiA: Date.now(),
        }),
      )
      toast.info(phraseHorsLigne(input.title))
    }
  }

  /** Renvoie ce qui attend, dans l'ordre où il l'a dicté. Appelée quand le
   * réseau revient, quand l'app repasse au premier plan, et à la main. */
  const viderLaFile = useCallback(async () => {
    if (!userId) return
    const aFaire = aRenvoyer(fileRef.current, Date.now())
    if (aFaire.length === 0) return

    let courante = fileRef.current
    let auMoinsUnPasse = false
    for (const element of aFaire) {
      try {
        // UPSERT, pas insert : si l'écriture était en fait passée la première
        // fois (réponse perdue), celle-ci ne fait rien du tout au lieu de
        // créer un jumeau.
        const { error } = await withTimeout(
          supabase
            .from("tasks")
            .upsert({ ...element.contenu, id: element.id, user_id: userId }, { onConflict: "id" }),
        )
        if (error) throw error
        courante = retirerDeLaFile(courante, element.id)
        auMoinsUnPasse = true
      } catch (e) {
        courante = noterEchec(courante, element.id, errorMessage(e), Date.now())
        const bloque = courante.find((x) => x.id === element.id)
        // UN ABANDON NE SE FAIT JAMAIS EN SILENCE : au moment où l'on cesse de
        // renvoyer tout seul, ça devient une ligne du registre des erreurs.
        // Pas avant — un réseau coupé de trente secondes n'est pas une panne.
        if (bloque && estBloque(bloque)) {
          signalerErreur("systeme", `Tâche dictée jamais enregistrée : ${element.libelle}`, {
            detail: errorMessage(e),
          })
        }
      }
    }
    ecrireFile(courante)
    if (auMoinsUnPasse) await refresh()
  }, [userId, ecrireFile, refresh])

  /** Il appuie sur « Réessayer » : on repart d'essais à zéro, parce que c'est
   * un geste de sa part et pas un renvoi automatique de plus. */
  const relancerEnvoi = useCallback(
    async (id: string) => {
      ecrireFile(relancer(fileRef.current, id))
      // Le prochain tour de viderLaFile le reprendra ; on ne l'attend pas ici,
      // sinon le bouton resterait bloqué le temps du réseau.
    },
    [ecrireFile],
  )

  // ── Ce qui fait repartir la file ─────────────────────────────────────────
  // Trois déclencheurs, et il faut les trois : le retour du réseau (le cas
  // qu'il vit — il sort du tunnel), le retour au premier plan (il rouvre
  // l'app), et un battement régulier (« en ligne » peut être vrai alors que
  // rien ne passe : un Wi-Fi de parking, un portail captif).
  useEffect(() => {
    if (!userId) return
    const repartir = () => {
      void viderLaFile()
    }
    repartir()
    window.addEventListener("online", repartir)
    const battement = window.setInterval(repartir, 30_000)
    return () => {
      window.removeEventListener("online", repartir)
      window.clearInterval(battement)
    }
  }, [userId, viderLaFile])

  useRefreshOnForeground(() => {
    void viderLaFile()
    return refresh()
  })

  /** Il retire une dictée de la file : elle disparaît pour de bon, d'où la
   * confirmation côté écran. */
  const oublierEnAttente = useCallback(
    (id: string) => ecrireFile(retirerDeLaFile(fileRef.current, id)),
    [ecrireFile],
  )

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

  // Ce qui attend s'affiche DANS LA LISTE, marqué. Un tampon invisible serait
  // un mensonge de plus : il a dicté quelque chose, il doit le voir.
  // Les plus récentes en tête, comme une tâche fraîchement ajoutée.
  const tachesAvecFile = useMemo<Task[]>(() => {
    if (file.length === 0) return tasks
    const enAttente: Task[] = file.map((e) => ({
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
  }, [tasks, file, userId])

  return {
    tasks: tachesAvecFile,
    categories,
    /** Ce qui attend d'être écrit, pour l'écran qui le montre. */
    fileEnAttente: file,
    /** Vrai quand le tampon n'a PAS pu être lu : ce n'est pas « rien en
     * attente », c'est « on ne sait pas ». */
    fileIllisible,
    relancerEnvoi,
    oublierEnAttente,
    viderLaFile,
    loading,
    error,
    refresh,
    addTask,
    updateTask,
    deleteTask,
    toggleStatus,
    addCategory,
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
