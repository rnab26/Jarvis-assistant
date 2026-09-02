import { Navigate, Route, HashRouter, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/components/auth/AuthProvider"
import { ProtectedShell } from "@/components/layout/ProtectedShell"
import { useAuth } from "@/hooks/useAuth"
import { CockpitPage } from "@/pages/CockpitPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { LoginPage } from "@/pages/LoginPage"

function AppRoutes() {
  const { session } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cockpit" element={<CockpitPage />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
      <Toaster />
    </AuthProvider>
  )
}

export default App
