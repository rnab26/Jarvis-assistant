import { ChevronDown, ChevronRight } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Une carte qui s'ouvre et se replie, avec son badge sur la barre de titre —
 * UN SEUL encadrement par fonctionnalité : le clic sur le titre déplie les
 * détails DANS la même carte, jamais dans une seconde.
 *
 * Née dans le cockpit, mesurée plutôt que supposée : sur un écran de
 * téléphone (390 × 844), il empilait au-dessus du tableau des chantiers la
 * fenêtre d'envoi (514 points), « Qui travaille » (132), le journal de bord
 * (424) et le registre des erreurs (56) — deux écrans pleins avant le premier
 * chantier. Repliées, ces cartes gardent ce qui compte (titre, badge) et
 * rendent l'écran au reste.
 *
 * Partagée avec Paramètres depuis le 7 sept. 2026 : chaque fonctionnalité de
 * l'onglet y était déjà sa propre `Card` (titre + description + réglages)
 * TOUJOURS DÉPLIÉE sous la barre repliable de sa section — deux cadres
 * empilés dès qu'on ouvrait une section, exactement ce que Raphaël a signalé
 * (« tu clique sur un cadre et ça ouvre un deuxième cadre »). Cette carte
 * remplace maintenant CE second cadre : la section reste une simple barre de
 * regroupement, et chaque fonctionnalité à l'intérieur est une seule
 * `CarteRepliable`, fermée par défaut.
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
