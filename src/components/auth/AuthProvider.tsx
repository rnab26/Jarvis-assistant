import type { Session } from "@supabase/supabase-js"
import { useEffect, useState, type ReactNode } from "react"
import { AuthContext, type AuthContextValue } from "@/hooks/useAuth"
import { errorMessage } from "@/lib/errorMessage"
import { supabase } from "@/lib/supabase"

/** Au-delà, on préfère montrer l'écran de connexion plutôt qu'un écran mort. */
const SESSION_RESTORE_TIMEOUT_MS = 6000

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(errorMessage(e))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Sans garde-fou, l'app reste sur un "Chargement..." plein écran pendant
    // ~40 s (mesuré) au lancement avec un réseau coupé : getSession() ne
    // rejette pas, supabase-js réessaie le rafraîchissement du token en
    // boucle et la promesse reste simplement en attente — un .catch() ne sert
    // donc à rien. On lève le voile de chargement au bout de quelques
    // secondes ; si la session se restaure plus tard, le setSession ci-dessous
    // (ou onAuthStateChange) bascule l'utilisateur sur son dashboard.
    const timer = setTimeout(() => setLoading(false), SESSION_RESTORE_TIMEOUT_MS)

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => {
        clearTimeout(timer)
        setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
      },
    )

    return () => {
      clearTimeout(timer)
      listener.subscription.unsubscribe()
    }
  }, [])

  const value: AuthContextValue = {
    session,
    loading,
    // Les try/catch évitent que le formulaire reste bloqué (bouton désactivé,
    // aucun message) quand l'appel réseau rejette au lieu de renvoyer { error }.
    async signIn(email, password) {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        return { error }
      } catch (e) {
        return { error: toError(e) }
      }
    },
    async signUp(email, password) {
      try {
        const { error } = await supabase.auth.signUp({ email, password })
        return { error }
      } catch (e) {
        return { error: toError(e) }
      }
    },
    async signOut() {
      try {
        await supabase.auth.signOut()
      } catch {
        // Déconnexion locale déjà faite par supabase-js : ne pas bloquer l'UI.
      }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
