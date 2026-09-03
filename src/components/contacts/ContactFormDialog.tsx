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
import type { Contact, ContactInput } from "@/types/database"

interface ContactFormDialogProps {
  contact?: Contact
  onSubmit: (input: ContactInput) => Promise<void>
  trigger: React.ReactNode
}

export function ContactFormDialog({ contact, onSubmit, trigger }: ContactFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(contact?.name ?? "")
  const [notes, setNotes] = useState(contact?.notes ?? "")
  const [phone, setPhone] = useState(contact?.phone ?? "")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(contact?.name ?? "")
      setNotes(contact?.notes ?? "")
      setPhone(contact?.phone ?? "")
    }
  }, [open, contact])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({ name, notes: notes || null, phone: phone || null })
      setOpen(false)
    } catch {
      // Erreur déjà signalée par un toast : on garde la fenêtre ouverte.
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
            <DialogTitle>{contact ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
            <DialogDescription>
              Qui c'est, et ce que tu attends de Jarvis à son sujet.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                value={phone}
                placeholder="Sert à l'appeler ou à lui préparer un message à la voix"
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                placeholder="Ex: client de Melissa, chantier villa Dan. Toujours confirmer avant d'envoyer un message."
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {contact ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
