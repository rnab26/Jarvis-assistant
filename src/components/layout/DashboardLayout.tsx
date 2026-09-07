import { Settings } from "lucide-react"
import type { ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

// Tâches en tête, à la demande de Raphaël (7 sept. 2026) : « passe les tâches
// en premier ». Paramètres n'est plus dans cette ligne : il est monté en haut
// à droite de l'en-tête, à côté du nom — c'est de là qu'on règle Jarvis, pas
// une destination qu'on visite au même titre que les autres. Mémoire et
// Déconnexion ne sont plus des onglets séparés : ils vivent maintenant DANS
// Paramètres (sections « Mémoire » et « Comptes et connexions »).
const TABS = [
  { to: "/", label: "Tâches", end: true },
  { to: "/documents", label: "Documents", end: false },
  { to: "/cockpit", label: "Cockpit dev", end: false },
]

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Jarvis</h1>
        <NavLink
          to="/settings"
          aria-label="Paramètres"
          className={({ isActive }) =>
            cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )
          }
        >
          <Settings className="size-4" />
          Paramètres
        </NavLink>
      </header>

      {/* flex-wrap, pas de défilement horizontal : un onglet qui déborderait
          de l'écran d'un téléphone deviendrait inatteignable sans aucun
          indice qu'il existe encore. whitespace-nowrap empêche au passage
          "Cockpit dev" de se couper en deux lignes. */}
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
