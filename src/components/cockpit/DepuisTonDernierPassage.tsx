import { Check, Sparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { depuisDerniereVisite, depuisQuand } from "@/lib/depuisDerniereVisite"
import { courtAuteur } from "@/lib/journalBord"
import type { DevItem, DevLogEntry } from "@/types/database"

/** Sur CET écran seulement : voir STOCKAGE_LOCAL_ASSUME dans reglages.ts. */
const CLE = "jarvis_cockpit_vu"

/**
 * « Depuis ton dernier passage » — ce qui a bougé pendant qu'il n'était pas là.
 *
 * Raphaël lance plusieurs sessions et s'absente une nuit ou une journée. Il
 * revient sur un cockpit où des chantiers ont été livrés, d'autres ouverts, et
 * où des sessions lui ont écrit. Rien ne le lui disait : il fallait comparer
 * de tête avec ce qu'il avait vu la veille, ou tout relire.
 *
 * Deux choix qui comptent :
 *   — la date de visite n'est enregistrée QUE quand il appuie sur « Vu ». Si
 *     elle se mettait à jour toute seule à l'affichage, le bandeau
 *     disparaîtrait avant qu'il ait eu le temps de le lire, et il n'aurait
 *     aucun moyen de le retrouver.
 *   — la toute première ouverture n'annonce rien : sans repère, « tout est
 *     nouveau » serait faux et couvrirait l'écran.
 */
interface DepuisTonDernierPassageProps {
  devItems: DevItem[]
  messages: DevLogEntry[]
}

function lire(): string | null {
  try {
    return localStorage.getItem(CLE)
  } catch {
    // Navigateur qui refuse le stockage : on n'annonce rien, on ne casse rien.
    return null
  }
}

export function DepuisTonDernierPassage({ devItems, messages }: DepuisTonDernierPassageProps) {
  const [vuLe, setVuLe] = useState<string | null>(null)
  const [masque, setMasque] = useState(false)

  // Au montage seulement : la date lue est celle du passage PRÉCÉDENT, et elle
  // ne doit pas bouger pendant qu'il regarde.
  useEffect(() => {
    setVuLe(lire())
  }, [])

  const bilan = useMemo(
    () => depuisDerniereVisite(devItems, messages, vuLe),
    [devItems, messages, vuLe],
  )

  if (masque || !bilan.quelqueChose || !bilan.depuis) return null

  function marquerVu() {
    try {
      localStorage.setItem(CLE, new Date().toISOString())
    } catch {
      // Rien à faire : on masque quand même pour cette session d'affichage.
    }
    setMasque(true)
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm font-medium">
            {bilan.origine === "passage"
              ? `Depuis ton dernier passage, ${depuisQuand(bilan.depuis)}`
              : `Depuis ton dernier message, ${depuisQuand(bilan.depuis)}`}
          </p>
          <Button variant="ghost" size="sm" onClick={marquerVu}>
            <Check className="size-3.5" />
            Vu
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {bilan.livres.length > 0 && (
            <Badge variant="secondary">
              {bilan.livres.length} livré{bilan.livres.length > 1 ? "s" : ""}
            </Badge>
          )}
          {bilan.nouveaux.length > 0 && (
            <Badge variant="outline">
              {bilan.nouveaux.length} nouveau{bilan.nouveaux.length > 1 ? "x" : ""}
            </Badge>
          )}
          {bilan.messages.length > 0 && (
            <Badge variant="default">
              {bilan.messages.length} message{bilan.messages.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Le détail, pas seulement les compteurs : trois titres suffisent à
            savoir si ça vaut la peine d'aller voir. */}
        {bilan.livres.slice(0, 3).map((item) => (
          <p key={item.id} className="truncate text-xs text-muted-foreground">
            ✓ {item.title}
          </p>
        ))}
        {bilan.livres.length > 3 && (
          <p className="text-xs text-muted-foreground">
            … et {bilan.livres.length - 3} autre{bilan.livres.length - 3 > 1 ? "s" : ""} livré
            {bilan.livres.length - 3 > 1 ? "s" : ""}.
          </p>
        )}
        {bilan.messages.slice(0, 2).map((m) => (
          <p key={m.id} className="truncate text-xs text-muted-foreground">
            💬 {courtAuteur(m.author)} : {m.body}
          </p>
        ))}
      </CardContent>
    </Card>
  )
}
