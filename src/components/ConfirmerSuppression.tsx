import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Une suppression ne part jamais sur un seul appui.
 *
 * Règle permanente de Raphaël : « je ne peux pas défaire ce que j'ai fait —
 * modifier et supprimer, avec une confirmation avant toute suppression ». Sur
 * un téléphone, la corbeille d'une ligne se touche par erreur en faisant
 * défiler, et ce qui est effacé ici ne se récupère pas.
 */
export function ConfirmerSuppression({
  ouvert,
  titre,
  detail,
  libelleAction = "Supprimer",
  onFermer,
  onConfirmer,
}: {
  ouvert: boolean
  titre: string
  /** Ce qui sera perdu, dit en clair — pas « êtes-vous sûr ? ». */
  detail: string
  libelleAction?: string
  onFermer: () => void
  onConfirmer: () => Promise<void>
}) {
  const [enCours, setEnCours] = useState(false)

  async function confirmer() {
    setEnCours(true)
    try {
      await onConfirmer()
      onFermer()
    } catch {
      // Déjà signalé par un toast : on laisse la fenêtre ouverte.
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          <DialogDescription>{detail}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onFermer} disabled={enCours}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={confirmer} disabled={enCours}>
            {enCours ? "Suppression…" : libelleAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
