import { ThemeProvider } from "next-themes"
import { lazy, Suspense, useEffect, useState } from "react"
import { Navigate, Route, HashRouter, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/components/auth/AuthProvider"
import { ProtectedShell } from "@/components/layout/ProtectedShell"
import { useAuth } from "@/hooks/useAuth"
import { AssistOverlay } from "@/lib/assistOverlayPlugin"
import { AssistantOverlayPage } from "@/pages/AssistantOverlayPage"
import { THEME_KEY } from "@/lib/theme"
import { DELAI_MAX_MS, quoiRendre, type OuOnEst } from "@/lib/demarrageOverlay"

// Chargées à la demande, pas au démarrage : chantier 7b8e68a7, 8 sept. 2026.
// Mesuré dans journal_ecoute — 956 ms entre l'ouverture de la fenêtre
// d'appui long et le premier démarrage d'écoute, alors que la bulle
// (une simple vue, pas une seconde BridgeActivity) est quasi instantanée.
// AssistantOverlayPage est rendue DIRECTEMENT par AppRoutes, sans passer par
// le routeur (voir plus bas) — mais elle partageait jusqu'ici le MÊME
// fichier JS que le cockpit, les documents, les notes, la mémoire et les
// réglages : la fenêtre d'appui long payait leur analyse avant de pouvoir
// écouter, pour du code qu'elle n'utilise jamais. Ces six pages n'ont donc
// plus à être chargées avant que l'écoute démarre.
const CockpitPage = lazy(() => import("@/pages/CockpitPage").then((m) => ({ default: m.CockpitPage })))
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })))
const DocumentsPage = lazy(() => import("@/pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })))
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })))
const MemoirePage = lazy(() => import("@/pages/MemoirePage").then((m) => ({ default: m.MemoirePage })))
const NotesPage = lazy(() => import("@/pages/NotesPage").then((m) => ({ default: m.NotesPage })))
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })))

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
    // Même règle que « rendu === attendre » plus haut : rien plutôt qu'un
    // « Chargement… » pour une poignée de centaines de millisecondes, sur
    // les six pages désormais chargées à la demande.
    <Suspense fallback={null}>
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
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/memoire" element={<MemoirePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
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
