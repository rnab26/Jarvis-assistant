import { Navigate, Route, HashRouter, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/components/auth/AuthProvider"
import { ProtectedShell } from "@/components/layout/ProtectedShell"
import { useAuth } from "@/hooks/useAuth"
import { CockpitPage } from "@/pages/CockpitPage"
import { ContactsPage } from "@/pages/ContactsPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { DocumentsPage } from "@/pages/DocumentsPage"
import { LoginPage } from "@/pages/LoginPage"
import { MemoirePage } from "@/pages/MemoirePage"
import { SettingsPage } from "@/pages/SettingsPage"

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
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/memoire" element={<MemoirePage />} />
        <Route path="/settings" element={<SettingsPage />} />
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
