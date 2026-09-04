import { ChevronDown } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

/**
 * Une section de Paramètres, repliée par défaut.
 *
 * Raphaël, 4 sept. 2026 : « il faut la sectoriser, comme un onglet paramètres
 * normal, pas foutre tous les paramètres à la chaîne, mélangés dans le
 * désordre, et se débrouiller à cliquer à droite et à gauche et à tester. »
 *
 * Le premier essai les avait groupés en trois blocs, mais tout restait
 * déroulé : sur un téléphone, ça faisait toujours une seule longue chaîne où
 * il fallait défiler pour trouver un réglage. Ce qui manquait n'était pas le
 * regroupement, c'était de pouvoir REFERMER ce qu'on ne cherche pas.
 *
 * Ouvert/fermé est gardé sur l'appareil (pas en base) : c'est un confort de
 * lecture propre à l'écran du moment, pas une préférence à synchroniser.
 */

const PREFIXE = "jarvis_section_"

function lireOuvert(cle: string, defaut: boolean): boolean {
  try {
    const v = localStorage.getItem(PREFIXE + cle)
    return v === null ? defaut : v === "1"
  } catch {
    return defaut
  }
}

interface SectionProps {
  titre: string
  /** Ce que la section contient, en trois ou quatre mots. */
  resume?: string
  /** Clé de mémorisation de l'état ouvert/fermé. */
  cle: string
  /** Ouverte au premier affichage. Réservé à la section la plus consultée. */
  ouverteParDefaut?: boolean
  children: ReactNode
}

export function Section({ titre, resume, cle, ouverteParDefaut = false, children }: SectionProps) {
  const [ouverte, setOuverte] = useState(() => lireOuvert(cle, ouverteParDefaut))

  useEffect(() => {
    try {
      localStorage.setItem(PREFIXE + cle, ouverte ? "1" : "0")
    } catch {
      // Stockage refusé : la section s'ouvrira simplement fermée la prochaine
      // fois. Rien à signaler à Raphaël pour ça.
    }
  }, [cle, ouverte])

  // Pas une Card : les réglages qu'elle contient en sont déjà. Emboîter une
  // carte dans une carte doublerait le cadre — le « pavé » que Raphaël veut
  // justement voir disparaître. Ici, une barre, et rien de plus.
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={ouverte}
        onClick={() => setOuverte(!ouverte)}
        className="flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{titre}</span>
          {resume && !ouverte && (
            <span className="block truncate text-xs text-muted-foreground">{resume}</span>
          )}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            ouverte ? "rotate-180" : ""
          }`}
        />
      </button>
      {ouverte && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  )
}
