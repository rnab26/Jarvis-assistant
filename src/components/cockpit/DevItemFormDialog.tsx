import { useEffect, useState, type FormEvent, type ReactNode } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DevItem, DevItemInput, DevPriority, DevStatus } from "@/types/database"

interface DevItemFormDialogProps {
  item?: DevItem
  onSubmit: (input: DevItemInput) => Promise<void>
  trigger: ReactNode
}

export function DevItemFormDialog({ item, onSubmit, trigger }: DevItemFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(item?.title ?? "")
  const [notes, setNotes] = useState(item?.notes ?? "")
  const [status, setStatus] = useState<DevStatus>(item?.status ?? "todo")
  const [priority, setPriority] = useState<DevPriority>(item?.priority ?? "normal")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(item?.title ?? "")
      setNotes(item?.notes ?? "")
      setStatus(item?.status ?? "todo")
      setPriority(item?.priority ?? "normal")
    }
  }, [open, item])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({ title, notes: notes || null, status, priority })
      setOpen(false)
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
            <DialogTitle>{item ? "Modifier le chantier" : "Nouveau chantier"}</DialogTitle>
            <DialogDescription>
              {item ? "Mets à jour ce chantier de développement." : "Ajoute un chantier au cockpit."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dev-title">Titre</Label>
              <Input
                id="dev-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dev-status">Statut</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DevStatus)}>
                <SelectTrigger id="dev-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">À faire</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="done">Terminé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dev-priority">Priorité</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as DevPriority)}>
                <SelectTrigger id="dev-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dev-notes">Notes</Label>
              <Input
                id="dev-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {item ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
