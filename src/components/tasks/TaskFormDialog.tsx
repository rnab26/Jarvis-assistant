import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { chantiersProches } from "@/lib/doublonChantier"
import type { Category, Task, TaskInput } from "@/types/database"

const NO_CATEGORY = "none"

interface TaskFormDialogProps {
  categories: Category[]
  task?: Task
  onSubmit: (input: TaskInput) => Promise<void>
  trigger: React.ReactNode
  /** Les tâches déjà là, pour prévenir d'une redite pendant la frappe. Le
   * cockpit le fait depuis le 4 sept. ; la liste de tâches, non — et trois
   * « racheter un spot pour l'entrée de la maison » identiques y dormaient. */
  taches?: Task[]
}

export function TaskFormDialog({
  categories,
  task,
  onSubmit,
  trigger,
  taches = [],
}: TaskFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(task?.title ?? "")
  const [notes, setNotes] = useState(task?.notes ?? "")
  const [dueDate, setDueDate] = useState(task?.due_date ?? "")
  const [dueTime, setDueTime] = useState(task?.due_time?.slice(0, 5) ?? "")
  const [categoryId, setCategoryId] = useState(task?.category_id ?? NO_CATEGORY)
  const [submitting, setSubmitting] = useState(false)

  // Uniquement à la CRÉATION : sur une modification, la tâche se ressemblerait
  // forcément à elle-même. Le module est celui du cockpit, rendu générique —
  // il compare des titres, il ne sait pas de quoi il parle.
  const proches = task ? [] : chantiersProches(title, taches.filter((t) => t.status !== "done"), 3)

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "")
      setNotes(task?.notes ?? "")
      setDueDate(task?.due_date ?? "")
      setDueTime(task?.due_time?.slice(0, 5) ?? "")
      setCategoryId(task?.category_id ?? NO_CATEGORY)
    }
  }, [open, task])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({
        title,
        notes: notes || null,
        due_date: dueDate || null,
        due_time: dueDate ? dueTime || null : null,
        category_id: categoryId === NO_CATEGORY ? null : categoryId,
        status: task?.status ?? "todo",
      })
      setOpen(false)
    } catch {
      // L'erreur est déjà signalée par un toast : on garde la fenêtre ouverte
      // pour ne pas faire perdre sa saisie à l'utilisateur.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{task ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
            <DialogDescription>
              {task ? "Mets à jour les infos de la tâche." : "Ajoute une tâche à ton dashboard."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Titre</Label>
              <Input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            {/* Prévient, ne bloque pas : il peut vouloir deux tâches proches.
                Se tait dès qu'il n'y a qu'un mot courant en commun — un
                avertissement qui se déclenche à tort n'est plus lu du tout. */}
            {proches.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-dashed p-2.5">
                <p className="text-xs font-medium">
                  Tu as déjà {proches.length === 1 ? "une tâche proche" : "des tâches proches"} :
                </p>
                {proches.map((p) => (
                  <p key={p.item.id} className="truncate text-xs text-muted-foreground">
                    · {p.item.title}
                  </p>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Catégorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder="Aucune catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Aucune catégorie</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="due_date">Échéance</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="due_time">Heure</Label>
                <Input
                  id="due_time"
                  type="time"
                  value={dueTime}
                  disabled={!dueDate}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                placeholder="Détails, contexte, précisions…"
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {task ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
