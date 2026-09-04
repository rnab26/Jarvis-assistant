import { useState, type ReactNode } from "react"
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
import { alreadyNotified } from "@/lib/notifyError"

/**
 * La question posée avant une action qu'on ne peut pas défaire.
 *
 * Il n'y en avait aucune dans l'app : la corbeille d'un chantier le
 * supprimait au premier appui, sans un mot, et un appui de travers sur un
 * téléphone arrive tous les jours. Un chantier supprimé par erreur ne se
 * retrouve nulle part — il n'a pas de corbeille, contrairement à un chantier
 * archivé.
 *
 * `contenu` sert aux suppressions qui demandent un choix avant d'être
 * confirmées : « où vont les chantiers de cette section ? ». Le choix se fait
 * dans la même fenêtre que la confirmation, pas dans une étape de plus.
 */
interface ConfirmerActionProps {
  trigger: ReactNode
  titre: string
  description?: ReactNode
  contenu?: ReactNode
  libelleConfirmation?: string
  /** Rouge, pour ce qui détruit. */
  destructif?: boolean
  onConfirmer: () => Promise<unknown> | unknown
}

export function ConfirmerAction({
  trigger,
  titre,
  description,
  contenu,
  libelleConfirmation = "Confirmer",
  destructif = true,
  onConfirmer,
}: ConfirmerActionProps) {
  const [open, setOpen] = useState(false)
  const [encours, setEnCours] = useState(false)

  async function confirmer() {
    setEnCours(true)
    try {
      await onConfirmer()
      setOpen(false)
    } catch (e) {
      // Déjà signalé par un toast : on laisse la fenêtre ouverte pour qu'il
      // voie que ça n'a pas marché, au lieu de la refermer comme si oui.
      alreadyNotified()
      void e
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        {contenu && <div className="flex flex-col gap-3 py-2">{contenu}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={encours}>
            Annuler
          </Button>
          <Button
            variant={destructif ? "destructive" : "default"}
            onClick={confirmer}
            disabled={encours}
          >
            {encours ? "…" : libelleConfirmation}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
