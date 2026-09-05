import { ThemeProvider } from "next-themes"
import { useEffect } from "react"
import { Navigate, Route, HashRouter, Routes, useNavigate } from "react-router-dom"
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

/**
 * La fenêtre de l'appui long est une DEUXIÈME BridgeActivity Android, avec
 * son propre pont Capacitor — AssistOverlay n'y est enregistré que là (voir
 * AssistOverlayActivity.java). On le sait donc dès qu'un appel réussit,
 * sans passer par une URL ou un extra d'intent : dans l'app normale (et sur
 * le web), l'appel échoue simplement, plugin absent.
 */
function useRedirigerVersOverlay() {
  const navigate = useNavigate()
  useEffect(() => {
    AssistOverlay.estOverlay()
      .then(() => navigate("/assistant", { replace: true }))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

function AppRoutes() {
  const { session } = useAuth()
  useRedirigerVersOverlay()

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
