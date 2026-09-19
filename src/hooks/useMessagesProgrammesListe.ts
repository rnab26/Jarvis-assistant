import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import {
  annulerMessage,
  listerMessagesProgrammes,
  modifierMessage,
  TOUS_LES_STATUTS,
  type ModificationMessage,
  type MessageProgramme,
} from "@/lib/messagesProgrammes"
import { withErrorToast } from "@/lib/notifyError"
import { withTimeout } from "@/lib/withTimeout"

/**
 * Ce que l'écran « Programmé » affiche : TOUS les messages programmés
 * (chantier 0c0193e3), pas seulement ceux en attente — `messagesProgrammes.ts`
 * expose déjà le stockage, ce hook n'en est qu'un branchement supplémentaire
 * pour l'écran de visualisation/édition, comme `useNotes` pour l'onglet Notes.
 *
 * NE TOUCHE PAS AU MÉCANISME D'ENVOI : aucune fonction ici n'ouvre WhatsApp
 * ni ne clique quoi que ce soit, exactement comme `messagesProgrammes.ts`
 * dont c'est la règle depuis l'origine.
 */
export function useMessagesProgrammesListe(userId: string | undefined) {
  const [messages, setMessages] = useState<MessageProgramme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Voir useTasks/useNotes : garde-fou contre deux chargements simultanés
  // qui reviendraient dans le désordre.
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setMessages([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const data = await withTimeout(listerMessagesProgrammes(TOUS_LES_STATUTS))
      if (request !== latestRequest.current) return // réponse périmée
      setMessages(data)
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
  useRealtimeRefresh("messages_programmes", userId, refresh)

  async function modifier(id: string, champs: ModificationMessage) {
    await withErrorToast("Impossible de modifier ce message programmé", async () => {
      await modifierMessage(id, champs)
      await refresh()
    })
  }

  async function annuler(id: string) {
    await withErrorToast("Impossible d'annuler ce message programmé", async () => {
      await annulerMessage(id)
      await refresh()
    })
  }

  return { messages, loading, error, refresh, modifier, annuler }
}
