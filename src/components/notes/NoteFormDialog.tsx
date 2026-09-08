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
import type { Note, NoteInput } from "@/types/database"

interface NoteFormDialogProps {
  note?: Note
  onSubmit: (input: NoteInput) => Promise<void>
  trigger: React.ReactNode
}

/** Créer ou modifier une note — même dialogue pour les deux, comme
 * TaskFormDialog. */
export function NoteFormDialog({ note, onSubmit, trigger }: NoteFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(note?.title ?? "")
  const [content, setContent] = useState(note?.content ?? "")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(note?.title ?? "")
      setContent(note?.content ?? "")
    }
  }, [open, note])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({ title, content })
      setOpen(false)
    } catch {
      // L'erreur est déjà signalée par un toast : on garde la fenêtre ouverte
      // pour ne pas faire perdre sa saisie.
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
            <DialogTitle>{note ? "Modifier la note" : "Nouvelle note"}</DialogTitle>
            <DialogDescription>
              {note ? "Mets à jour le contenu de la note." : "Du texte libre, pour toi seul."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="note-title">Titre</Label>
              <Input
                id="note-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="note-content">Contenu</Label>
              <Textarea
                id="note-content"
                value={content}
                placeholder="Écris ce que tu veux…"
                className="min-h-40"
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {note ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
