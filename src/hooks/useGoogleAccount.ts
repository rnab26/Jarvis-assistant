import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { GoogleAccount } from "@/types/database"

/**
 * supabase-js masque le corps de la réponse derrière un message générique
 * ("Edge Function returned a non-2xx status code"). Or c'est justement là
 * qu'est l'explication utile — par exemple que les clés Google ne sont pas
 * encore déposées côté serveur. On va la chercher.
 */
async function messageDeLaFonction(fnError: unknown): Promise<string> {
  const contexte = (fnError as { context?: Response } | null)?.context
  if (contexte && typeof contexte.json === "function") {
    try {
      const corps = await contexte.json()
      const detail = corps?.message ?? corps?.error
      if (typeof detail === "string" && detail.trim()) return detail
    } catch {
      // Réponse sans JSON exploitable : on retombe sur le message générique.
    }
  }
  return errorMessage(fnError)
}

/**
 * État de la connexion au compte Google : quel compte est branché, et de
 * quoi Jarvis a le droit de s'occuper.
 *
 * Cette table ne contient AUCUN jeton — ils vivent dans google_tokens, que
 * le navigateur ne peut pas lire (voir la migration 0013). Ici on ne lit que
 * ce qu'il y a à afficher.
 *
 * Le rafraîchissement au retour au premier plan est le point clé du parcours :
 * l'autorisation Google se donne dans le navigateur, hors de l'application
 * (Google refuse par principe de s'afficher dans une fenêtre embarquée). Quand
 * Raphaël revient dans Jarvis, l'écran doit déjà dire "connecté" — sans quoi
 * il croirait que ça n'a pas marché.
 */
export function useGoogleAccount(userId: string | undefined) {
  const [account, setAccount] = useState<GoogleAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [urlAOuvrir, setUrlAOuvrir] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setAccount(null)
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase.from("google_accounts").select("*").maybeSingle(),
      )

      if (request !== latestRequest.current) return
      if (queryError) throw queryError

      setAccount(data ?? null)
      setError(null)
    } catch (e) {
      if (request !== latestRequest.current) return
      setError(errorMessage(e))
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useRefreshOnForeground(refresh)

  /**
   * Demande l'URL de consentement puis l'ouvre. Le navigateur peut bloquer
   * l'ouverture automatique (elle arrive après un aller-retour réseau, donc
   * détachée du clic) : dans ce cas on garde l'adresse et l'écran affiche un
   * lien à toucher, plutôt que de ne rien faire du tout.
   */
  async function connecter() {
    setEnCours(true)
    setError(null)
    setUrlAOuvrir(null)
    try {
      const { data, error: fnError } = await withTimeout(
        supabase.functions.invoke("google-oauth/start", {
          body: { redirect_to: window.location.href },
        }),
        15000,
      )
      if (fnError) throw new Error(await messageDeLaFonction(fnError))
      const url = (data as { url?: string } | null)?.url
      if (!url) throw new Error("Le serveur n'a pas renvoyé d'adresse d'autorisation.")

      const fenetre = window.open(url, "_blank", "noopener")
      if (!fenetre) setUrlAOuvrir(url)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setEnCours(false)
    }
  }

  async function deconnecter() {
    setEnCours(true)
    setError(null)
    try {
      const { error: fnError } = await withTimeout(
        supabase.functions.invoke("google-oauth/disconnect", { body: {} }),
        15000,
      )
      if (fnError) throw new Error(await messageDeLaFonction(fnError))
      setAccount(null)
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setEnCours(false)
    }
  }

  return {
    account,
    connected: account !== null,
    loading,
    error,
    enCours,
    urlAOuvrir,
    refresh,
    connecter,
    deconnecter,
  }
}
