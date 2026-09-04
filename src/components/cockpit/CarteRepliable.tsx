import { ChevronDown, ChevronRight } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Une carte du cockpit qui s'ouvre et se replie, avec son résumé sur la barre
 * de titre.
 *
 * POURQUOI ELLE EXISTE, mesuré plutôt que supposé. Sur un écran de téléphone
 * (390 × 844), le cockpit empilait au-dessus du tableau des chantiers : la
 * fenêtre d'envoi (514 points), « Qui travaille » (132), le journal de bord
 * (424) et le registre des erreurs (56). Le premier chantier commençait donc à
 * 1 632 points du haut — deux écrans pleins à faire défiler avant de voir le
 * résumé par section, celui-là même qui avait été demandé pour ne plus avoir à
 * faire défiler.
 *
 * Repliées, ces cartes gardent ce qui compte — leur titre et le compteur qui
 * dit s'il se passe quelque chose — et rendent l'écran au tableau. Rien n'est
 * caché : ce qui appelle une action porte son badge sur la barre de titre.
 */
interface CarteRepliableProps {
  titre: ReactNode
  /** Ce qui doit se voir même repliée : un compteur, une alerte. */
  badge?: ReactNode
  ouverteParDefaut?: boolean
  children: ReactNode
}

export function CarteRepliable({
  titre,
  badge,
  ouverteParDefaut = false,
  children,
}: CarteRepliableProps) {
  const [ouverte, setOuverte] = useState(ouverteParDefaut)

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={ouverte}
          onClick={() => setOuverte(!ouverte)}
        >
          {ouverte ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <CardTitle className="min-w-0 flex-1 text-base">{titre}</CardTitle>
        </button>
        {badge}
      </CardHeader>
      {ouverte && children}
    </Card>
  )
}
