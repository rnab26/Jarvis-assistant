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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ModificationMessage, MessageProgramme } from "@/lib/messagesProgrammes"

// Radix <SelectItem> refuse une valeur vide : "aucun" tient lieu de canal
// non choisi (`canal: null`), converti au moment de soumettre.
const CANAL_AUCUN = "aucun"

/** `2026-09-18T22:00` — pour un <input type="datetime-local">, en HEURE
 * LOCALE : `new Date(iso)` puis relire ses champs locaux, jamais un découpage
 * de la chaîne ISO (qui est en UTC et afficherait une heure fausse). */
function versDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** L'inverse : un `datetime-local` sans fuseau est interprété par `Date` en
 * heure LOCALE, exactement ce qu'on veut renvoyer en ISO/UTC pour la base. */
function depuisDatetimeLocal(valeur: string): string | null {
  const d = new Date(valeur)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

interface MessageProgrammeFormDialogProps {
  message: MessageProgramme
  onSubmit: (champs: ModificationMessage) => Promise<void>
  trigger: React.ReactNode
}

/** Modifier À LA MAIN un envoi programmé — heure, contenu, destinataire,
 * canal (chantier 0c0193e3). Toujours une MODIFICATION d'un message
 * existant : la création se fait à la voix (schedule_message), cet écran ne
 * crée rien de son côté — ce n'est pas la même demande. */
export function MessageProgrammeFormDialog({
  message,
  onSubmit,
  trigger,
}: MessageProgrammeFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [destinataire, setDestinataire] = useState(message.destinataire)
  const [canal, setCanal] = useState<string>(message.canal ?? CANAL_AUCUN)
  const [texte, setTexte] = useState(message.texte)
  const [envoyerA, setEnvoyerA] = useState(versDatetimeLocal(message.envoyer_a))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setDestinataire(message.destinataire)
      setCanal(message.canal ?? CANAL_AUCUN)
      setTexte(message.texte)
      setEnvoyerA(versDatetimeLocal(message.envoyer_a))
    }
  }, [open, message])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const nouvelleDate = depuisDatetimeLocal(envoyerA)
    if (!nouvelleDate) return
    setSubmitting(true)
    try {
      await onSubmit({
        destinataire,
        canal: canal === CANAL_AUCUN ? null : (canal as "whatsapp" | "sms"),
        texte,
        envoyer_a: nouvelleDate,
      })
      setOpen(false)
    } catch {
      // Déjà signalé par un toast : on garde la fenêtre ouverte pour ne pas
      // faire perdre sa saisie.
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
            <DialogTitle>Modifier l'envoi programmé</DialogTitle>
            <DialogDescription>
              Une modification remet ce message à « Prévu » : ce que Jarvis
              annoncerait a changé.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="msgprog-destinataire">Destinataire</Label>
              <Input
                id="msgprog-destinataire"
                required
                value={destinataire}
                onChange={(e) => setDestinataire(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="msgprog-canal">Canal</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger id="msgprog-canal" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CANAL_AUCUN}>Pas encore choisi</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="msgprog-envoyer-a">Heure prévue</Label>
              <Input
                id="msgprog-envoyer-a"
                type="datetime-local"
                required
                value={envoyerA}
                onChange={(e) => setEnvoyerA(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="msgprog-texte">Message</Label>
              <Textarea
                id="msgprog-texte"
                required
                value={texte}
                className="min-h-32"
                onChange={(e) => setTexte(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
