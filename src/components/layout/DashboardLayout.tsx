import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"

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
      {children}
    </div>
  )
}
