import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Remplace le "Chargement..." qui restait affiché indéfiniment quand le
 * chargement échouait : on dit ce qui s'est passé et on propose de réessayer.
 */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        Impossible de charger les données.
        <br />
        <span className="text-xs">{message}</span>
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-4" />
        Réessayer
      </Button>
    </div>
  )
}
