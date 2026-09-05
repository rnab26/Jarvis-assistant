import type { ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"

// Paramètres en tête, à la demande de Raphaël (4 sept. 2026) : « il faut que
// ça apparaisse aussi en premier ». C'est l'onglet par lequel il règle Jarvis,
// et il était le dernier des six — donc en seconde ligne sur un téléphone.
const TABS = [
  { to: "/settings", label: "Paramètres", end: false },
  { to: "/", label: "Tâches", end: true },
  { to: "/cockpit", label: "Cockpit dev", end: false },
  { to: "/documents", label: "Documents", end: false },
  // Plus d'onglet Contacts depuis le 5 sept. 2026. Raphaël : « ça ne sert à
  // rien, sachant que tu as déjà une mémoire active dans Jarvis qui retient
  // tout ce qu'on dit. À partir du moment où il est connecté à mes contacts
  // du téléphone, il sait tout. » Les numéros viennent du répertoire
  // (READ_CONTACTS), ce qu'il dit des gens va dans la mémoire.
  { to: "/memoire", label: "Mémoire", end: false },
]

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth()

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Jarvis</h1>
          <p className="text-sm text-muted-foreground">{session?.user.email}</p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Déconnexion
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
