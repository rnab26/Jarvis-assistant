import { FolderPlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { CarteRepliable } from "@/components/cockpit/CarteRepliable"
import { themesNonDeclares } from "@/lib/themesNonDeclares"
import type { DevItem, DevSection } from "@/types/database"

/**
 * « Thèmes non déclarés » — un thème que des chantiers portent, mais
 * qu'aucune section ne rassemble (chantier 765af020, 6 sept. 2026).
 *
 * ELLE PROPOSE, ELLE NE DÉCIDE PAS : créer la section toute seule dès qu'un
 * thème apparaît fabriquerait des sections dans son dos, pour un mot mal
 * orthographié ou un thème qui ne sert qu'une fois. C'est le même choix que
 * « Ça existe déjà » (doublonsExistants.ts) — un bouton, jamais un automatisme.
 *
 * Silencieuse quand il n'y a rien : une carte qui affiche "0 thème orphelin"
 * en permanence n'est plus lue, exactement comme DoublonsTrouves.
 */

interface ThemesNonDeclaresProps {
  devItems: DevItem[]
  sections: DevSection[]
  onDeclarer: (nom: string) => Promise<void>
}

export function ThemesNonDeclares({ devItems, sections, onDeclarer }: ThemesNonDeclaresProps) {
  const themes = themesNonDeclares(devItems, sections)

  if (themes.length === 0) return null

  return (
    <CarteRepliable
      titre={
        <>
          <FolderPlus className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
          Thèmes non déclarés
        </>
      }
      badge={
        <Badge variant="outline" className="shrink-0">
          {themes.length}
        </Badge>
      }
    >
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Ces thèmes ont des chantiers, mais aucune section pour les ranger : impossible de les
          réordonner, les renommer ou les décrire depuis ici tant qu'ils n'ont pas de section.
        </p>
        {themes.map((t) => (
          <div
            key={t.theme}
            className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{t.theme}</p>
              <p className="text-xs text-muted-foreground">
                {t.chantiers} chantier{t.chantiers > 1 ? "s" : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => onDeclarer(t.theme)}
            >
              Déclarer
            </Button>
          </div>
        ))}
      </CardContent>
    </CarteRepliable>
  )
}
