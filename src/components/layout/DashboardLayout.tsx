import type { ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Settings } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"

// PARAMÈTRES N'EST PLUS UN ONGLET depuis le 7 sept. 2026 : il est monté en
// haut à droite, à la place de « Déconnexion ». Sa demande, capture à l'appui :
// « remonté le menu parametre en haut a droite a la place de déconnexion et
// intégrer la déconnexion dans les paramètres ».
//
// Ce n'est pas un déplacement décoratif : la place ainsi libérée, plus
// « Documents » raccourci en « Docs », fait tenir les quatre onglets restants
// sur UNE SEULE LIGNE sur un écran de téléphone. Ils étaient sur deux (sa
// capture du 7 sept. : « Documents » et « Mémoire » seuls en seconde ligne),
// et la seconde ligne se lit deux fois moins.
//
// Il avait demandé le 4 sept. que Paramètres « apparaisse en premier ». Le
// besoin est le même — y accéder sans chercher — et le coin haut droit le sert
// mieux : il est atteignable depuis n'importe quel onglet, sans occuper de
// place dans la barre.
const TABS = [
  { to: "/", label: "Tâches", end: true },
  { to: "/cockpit", label: "Cockpit dev", end: false },
  // « Docs » et pas « Documents » : trois lettres de moins, et c'est ce qui
  // fait tenir la barre sur une ligne. Sa demande du 7 sept.
  { to: "/documents", label: "Docs", end: false },
  // Chantier 5ad49cc0, 6 sept. 2026 : du texte libre pour lui, distinct des
  // tâches (échéance), des documents (fichiers) et de la mémoire (ce que
  // Jarvis retient tout seul).
  { to: "/notes", label: "Notes", end: false },
  // Plus d'onglet Contacts depuis le 5 sept. 2026. Raphaël : « ça ne sert à
  // rien, sachant que tu as déjà une mémoire active dans Jarvis qui retient
  // tout ce qu'on dit. À partir du moment où il est connecté à mes contacts
  // du téléphone, il sait tout. » Les numéros viennent du répertoire
  // (READ_CONTACTS), ce qu'il dit des gens va dans la mémoire.
  { to: "/memoire", label: "Mémoire", end: false },
]

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { session } = useAuth()

  return (
    <div className="mx-auto flex ecran-plein max-w-3xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Jarvis</h1>
          <p className="text-sm text-muted-foreground">{session?.user.email}</p>
        </div>
        {/* La Déconnexion vit maintenant DANS Paramètres : elle était le
            bouton le plus visible de l'écran alors que c'est l'action la
            plus rare, et la plus fâcheuse à déclencher par erreur. */}
        <Button variant="outline" size="sm" asChild>
          <NavLink to="/settings" aria-label="Paramètres">
            <Settings className="size-4" />
            Paramètres
          </NavLink>
        </Button>
      </header>

      {/* flex-wrap, pas de défilement horizontal : à six onglets, la barre
          sur une seule ligne débordait de l'écran d'un téléphone et les
          deux derniers (Mémoire, Paramètres) devenaient inatteignables —
          sans aucun indice qu'ils existaient encore. Un onglet caché est
          un onglet perdu ; ils passent donc à la ligne. whitespace-nowrap
          empêche au passage "Cockpit dev" de se couper en deux lignes. */}
      <nav className="flex flex-wrap gap-2 border-b pb-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {children}
    </div>
  )
}
