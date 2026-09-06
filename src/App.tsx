import { ThemeProvider } from "next-themes"
import { useEffect, useState } from "react"
import { Navigate, Route, HashRouter, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/components/auth/AuthProvider"
import { ProtectedShell } from "@/components/layout/ProtectedShell"
import { useAuth } from "@/hooks/useAuth"
import { AssistOverlay } from "@/lib/assistOverlayPlugin"
import { AssistantOverlayPage } from "@/pages/AssistantOverlayPage"
import { CockpitPage } from "@/pages/CockpitPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { DocumentsPage } from "@/pages/DocumentsPage"
import { LoginPage } from "@/pages/LoginPage"
import { MemoirePage } from "@/pages/MemoirePage"
import { SettingsPage } from "@/pages/SettingsPage"
import { THEME_KEY } from "@/lib/theme"
import { DELAI_MAX_MS, quoiRendre, type OuOnEst } from "@/lib/demarrageOverlay"

/**
 * La fenêtre de l'appui long est une DEUXIÈME BridgeActivity Android, avec
 * son propre pont Capacitor — AssistOverlay n'y est enregistré que là (voir
 * AssistOverlayActivity.java). On le sait donc dès qu'un appel réussit,
 * sans passer par une URL ou un extra d'intent : dans l'app normale (et sur
 * le web), l'appel échoue simplement, plugin absent.
 *
 * ON N'AFFICHE RIEN TANT QU'ON NE SAIT PAS, et c'est tout l'objet du
 * correctif du 6 sept. 2026. Avant, cet appel asynchrone laissait le routeur
 * rendre la route « / » pendant qu'il répondait : la coquille de l'app
 * normale se montait pour quarante millisecondes, avec son micro, qui
 * consommait au passage le drapeau « démarre l'écoute » posé par l'activité.
 * Le micro de la fenêtre d'assistance arrivait ensuite, ne trouvait plus le
 * drapeau, et attendait le mot-clé — les deux se disputant le micro du
 * téléphone. Sur son écran : « Dis Jarvis pour lancer la conversation » au
 * lieu d'une écoute, et rien qui aboutit. Le journal montrait les deux
 * rafales à 40 ms d'intervalle.
 */
function useOuOnEst(): OuOnEst {
  const [ou, setOu] = useState<OuOnEst>("inconnu")
  useEffect(() => {
    let fini = false
    const conclure = (valeur: OuOnEst) => {
      if (fini) return
      fini = true
      setOu(valeur)
    }
    // Le filet : une app qui s'affiche vaut mieux qu'une app qui attend un
    // pont qui ne répondra jamais.
    const minuteur = setTimeout(() => conclure("normal"), DELAI_MAX_MS)
    AssistOverlay.estOverlay()
      .then(() => conclure("overlay"))
      .catch(() => conclure("normal"))
    return () => {
      fini = true
      clearTimeout(minuteur)
    }
  }, [])
  return ou
}

function AppRoutes() {
  const { session } = useAuth()
  const ou = useOuOnEst()
  const rendu = quoiRendre(ou)

  // Rien, pas même un écran de chargement : c'est une fraction de seconde, et
  // la fenêtre d'assistance est translucide — un « Chargement… » y clignoterait
  // par-dessus l'application de dessous.
  if (rendu === "attendre") return null

  // La fenêtre d'assistance est rendue DIRECTEMENT, sans passer par le
  // routeur : une redirection laisserait, le temps d'un rendu, la coquille de
  // l'app normale se monter — c'est exactement le bug qu'on corrige.
  if (rendu === "overlay") return <AssistantOverlayPage />

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route path="/assistant" element={<AssistantOverlayPage />} />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cockpit" element={<CockpitPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/memoire" element={<MemoirePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    // La palette sombre existait dans index.css depuis le début, et rien ne
    // pouvait l'activer : personne ne posait la classe « dark ». La clé de
    // stockage est la nôtre pour que le choix entre dans les réglages
    // recopiés en base (voir src/lib/theme.ts).
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      storageKey={THEME_KEY}
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
