import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { sectionCorrespond } from "@/lib/sectionsParametres"

export { sectionCorrespond }

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
  /**
   * Ce qu'on peut taper pour retrouver cette section : le nom de chaque
   * réglage qu'elle contient, et les mots qu'on emploierait pour le chercher
   * sans connaître son intitulé exact.
   *
   * À TENIR À JOUR en ajoutant un réglage : une carte que la recherche ne
   * trouve pas est aussi introuvable qu'avant, et c'est justement ce qu'on
   * essaie de réparer.
   */
  motsCles?: string
  /** Ce que Raphaël a tapé dans la recherche. Vide = affichage normal. */
  filtre?: string
  /**
   * Ce que la section a à dire SANS qu'on l'ouvre : « Nouvelle version »,
   * « 3 en attente ». Même principe que `CarteRepliable` du cockpit — replier
   * ne doit pas cacher ce qui appelle une action, sinon il faut tout déplier
   * pour savoir s'il y a quelque chose à faire, et replier ne sert plus à
   * rien.
   */
  badge?: ReactNode
  /**
   * Vrai quand une navigation externe vise CETTE section (chantier
   * `aac9a0dd` : « emmène-moi dans les notifications »). Reçu déjà résolu
   * par `resoudreCibleParametres` — ce composant ne fait qu'ouvrir, défiler
   * et se mettre en évidence, jamais deviner une cible depuis du texte.
   */
  cibleNavigation?: boolean
  children: ReactNode
}

/** Combien de temps la mise en évidence reste visible après une navigation
 * externe. Assez long pour qu'on la voie en ayant fini de défiler, assez
 * court pour ne pas devenir un élément permanent de l'écran. */
const DUREE_MISE_EN_EVIDENCE_MS = 2500

export function Section({
  titre,
  resume,
  cle,
  ouverteParDefaut = false,
  motsCles,
  filtre = "",
  badge,
  cibleNavigation = false,
  children,
}: SectionProps) {
  const [ouverte, setOuverte] = useState(() => lireOuvert(cle, ouverteParDefaut))
  const [enEvidence, setEnEvidence] = useState(false)
  const conteneurRef = useRef<HTMLDivElement>(null)
  const recherche = filtre.trim().length > 0

  useEffect(() => {
    // Pendant une recherche, l'ouverture est imposée par le résultat : la
    // mémoriser ferait revenir toutes les sections dépliées une fois la
    // recherche effacée.
    if (recherche) return
    try {
      localStorage.setItem(PREFIXE + cle, ouverte ? "1" : "0")
    } catch {
      // Stockage refusé : la section s'ouvrira simplement fermée la prochaine
      // fois. Rien à signaler à Raphaël pour ça.
    }
  }, [cle, ouverte, recherche])

  useEffect(() => {
    if (!cibleNavigation) return
    setOuverte(true)
    setEnEvidence(true)
    conteneurRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    const minuteur = setTimeout(() => setEnEvidence(false), DUREE_MISE_EN_EVIDENCE_MS)
    return () => clearTimeout(minuteur)
  }, [cibleNavigation])

  // Une recherche qui laisserait le résultat replié ne servirait à rien : il
  // faudrait encore le déplier à la main pour voir ce qu'on a trouvé.
  if (recherche) {
    if (!sectionCorrespond({ titre, resume, motsCles }, filtre)) return null
    return (
      <div ref={conteneurRef} className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{titre}</span>
            {resume && <span className="block text-xs text-muted-foreground">{resume}</span>}
          </span>
          {badge}
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    )
  }

  // Pas une Card : les réglages qu'elle contient en sont déjà. Emboîter une
  // carte dans une carte doublerait le cadre — le « pavé » que Raphaël veut
  // justement voir disparaître. Ici, une barre, et rien de plus.
  return (
    <div ref={conteneurRef} className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={ouverte}
        onClick={() => setOuverte(!ouverte)}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-shadow ${
          enEvidence ? "ring-2 ring-primary" : ""
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{titre}</span>
          {resume && !ouverte && (
            <span className="block truncate text-xs text-muted-foreground">{resume}</span>
          )}
        </span>
        {badge}
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
