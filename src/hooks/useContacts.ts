import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { Contact, ContactInput } from "@/types/database"

export function useContacts(userId: string | undefined) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setContacts([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase.from("contacts").select("*").order("name", { ascending: true }),
      )

      if (request !== latestRequest.current) return
      if (queryError) throw queryError

      setContacts(data ?? [])
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

  async function addContact(input: ContactInput) {
    if (!userId) return
    await withErrorToast("Impossible d'ajouter le contact", async () => {
      const { error } = await supabase.from("contacts").insert({ ...input, user_id: userId })
      if (error) throw error
      await refresh()
    })
  }

  async function updateContact(id: string, input: Partial<ContactInput>) {
    await withErrorToast("Impossible de modifier le contact", async () => {
      const { error } = await supabase
        .from("contacts")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function deleteContact(id: string) {
    await withErrorToast("Impossible de supprimer le contact", async () => {
      const { error } = await supabase.from("contacts").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  return { contacts, loading, error, refresh, addContact, updateContact, deleteContact }
}
