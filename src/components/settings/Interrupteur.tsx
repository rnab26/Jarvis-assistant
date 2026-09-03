import { useId, type ReactNode } from "react"
import { Switch } from "@/components/ui/switch"

interface InterrupteurProps {
  titre: string
  /** Ce que ça fait, en une ligne. Facultatif si le titre suffit. */
  description?: string
  actif: boolean
  onChange: (actif: boolean) => void
  disabled?: boolean
  /** Détail affiché sous la ligne quand c'est activé (avertissement, etc.). */
  children?: ReactNode
}

/**
 * Une ligne de réglage qu'on allume ou qu'on éteint.
 *
 * Remplace les boutons qui affichaient « Activé » / « Désactivé » : personne
 * ne pouvait dire s'ils annonçaient l'état en cours ou l'action à déclencher
 * en appuyant. Raphaël l'a signalé le 3 sept. — il ne savait jamais ce qui
 * était réellement actif.
 *
 * Ici l'état se lit de deux façons redondantes, et volontairement : la
 * position de l'interrupteur, et le mot écrit à côté. Aucune des deux ne
 * demande de se souvenir d'une convention.
 */
export function Interrupteur({
  titre,
  description,
  actif,
  onChange,
  disabled,
  children,
}: InterrupteurProps) {
  const id = useId()

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <label htmlFor={id} className="font-medium">
            {titre}
          </label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <Switch id={id} checked={actif} onCheckedChange={onChange} disabled={disabled} />
          <span
            className={
              actif
                ? "text-[11px] font-semibold text-primary"
                : "text-[11px] font-medium text-muted-foreground"
            }
          >
            {actif ? "Activé" : "Désactivé"}
          </span>
        </div>
      </div>
      {children}
    </div>
  )
}
