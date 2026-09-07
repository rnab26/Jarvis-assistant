import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { etatAffiche, type StatutDirect } from "@/lib/etatDirect"

/**
 * Une ligne, en tête d'une liste : où en est la mise à jour automatique, et
 * un bouton pour la forcer.
 *
 * Chantier ce69489b, ses mots : « Les taches ne s'affichent pas en live et il
 * n'y a aucun moyen d'actualiser ».
 *
 * UNE LIGNE, PAS UNE CARTE, et c'est mesuré ailleurs : le cockpit a un budget
 * de hauteur (`verifier-cockpit-web.mjs` refuse que le résumé descende sous
 * 482 points) et l'onglet Tâches vient d'être réorganisé pour que la
 * nouvelle tâche soit au centre. Ce qu'on ajoute ici doit tenir sur la
 * hauteur d'un bouton discret, sinon on reprend d'une main ce qu'on a donné
 * de l'autre.
 *
 * Ce qu'il faut dire — et surtout ce qu'il ne faut PAS dire — vit dans
 * `src/lib/etatDirect.ts`, qui est pur et vérifié hors ligne.
 */
export function BarreActualiser({
  statut,
  derniereMaj,
  enCours,
  onActualiser,
  className,
  seulementSiProbleme = false,
}: {
  statut: StatutDirect
  derniereMaj: number | null
  enCours: boolean
  onActualiser: () => void
  className?: string
  /**
   * Ne rien afficher du tout tant que le direct marche.
   *
   * Sert au COCKPIT, et c'est un arbitrage mesuré, pas une préférence :
   * `verifier-cockpit-web.mjs` refuse que le tableau des chantiers descende
   * sous 482 points sur un écran de téléphone, et cette barre en coûte 44 —
   * essayé, le contrôle est passé à 526 et a rougi. La règle du projet est
   * « si tu ajoutes une carte au cockpit, prends sa place quelque part » : ici
   * la place n'est prise que le jour où il y a vraiment quelque chose à dire.
   *
   * L'onglet Tâches, lui, garde le bouton EN PERMANENCE : « aucun moyen
   * d'actualiser » était sa plainte, et un bouton qui n'apparaît qu'en cas de
   * panne détectée ne sert à rien le jour où la panne n'est pas détectée.
   */
  seulementSiProbleme?: boolean
}) {
  // L'âge n'est affiché qu'en cas de coupure, mais quand il l'est il doit
  // vieillir tout seul : « il y a 2 min » figé pendant un quart d'heure serait
  // exactement le mensonge qu'on corrige. Une fois par minute suffit, c'est la
  // granularité de `ageEnClair`.
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const reseau = typeof navigator === "undefined" ? true : navigator.onLine !== false
  const etat = etatAffiche({ statut, derniereMaj, maintenant, enCours, reseau })
  if (seulementSiProbleme && etat.ton === "discret") return null

  return (
    <div
      data-etat={etat.ton}
      className={cn("flex items-center justify-between gap-2 text-xs", className)}
    >
      <span
        className={cn(
          "min-w-0 truncate",
          etat.ton === "alerte" ? "font-medium text-amber-600 dark:text-amber-500" : "text-muted-foreground",
        )}
      >
        {etat.texte}
      </span>
      <Button
        type="button"
        variant={etat.ton === "alerte" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 shrink-0 px-2 text-xs"
        disabled={!etat.actionnable}
        onClick={onActualiser}
        aria-label="Actualiser la liste"
      >
        <RefreshCw className={cn("size-3.5", enCours && "animate-spin")} />
        Actualiser
      </Button>
    </div>
  )
}
