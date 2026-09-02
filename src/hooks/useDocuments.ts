import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { DocumentFile } from "@/types/database"

const BUCKET = "documents"

export function useDocuments(userId: string | undefined) {
  const [documents, setDocuments] = useState<DocumentFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Voir useTasks : garde-fou contre deux chargements simultanés qui
  // reviendraient dans le désordre.
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setDocuments([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase.storage
          .from(BUCKET)
          .list(userId, { sortBy: { column: "created_at", order: "desc" } }),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (queryError) throw queryError

      setDocuments(
        (data ?? [])
          // Supabase Storage renvoie un objet "placeholder" pour le dossier
          // lui-même quand il est vide — id null permet de le distinguer.
          .filter((f) => f.id !== null)
          .map((f) => ({
            name: f.name,
            path: `${userId}/${f.name}`,
            size: f.metadata?.size ?? 0,
            createdAt: f.created_at ?? "",
            contentType: f.metadata?.mimetype ?? null,
          })),
      )
      setError(null)
    } catch (e) {
      // Sans ce catch, une coupure réseau bloquait la page Documents sur
      // "Chargement..." définitivement.
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

  async function uploadFile(file: File) {
    if (!userId) return
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${userId}/${file.name}`, file, { upsert: true })
    if (error) throw error
    await refresh()
  }

  /** Utilisé par la voix : Jarvis enregistre un texte dicté comme document. */
  async function saveTextDocument(filename: string, content: string) {
    if (!userId) return
    await withErrorToast("Impossible d'enregistrer le document", async () => {
      const safeName = filename.trim().endsWith(".txt") ? filename.trim() : `${filename.trim()}.txt`
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(`${userId}/${safeName}`, blob, { upsert: true, contentType: "text/plain" })
      if (uploadError) throw uploadError
      await refresh()
    })
  }

  async function getDownloadUrl(path: string) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60)
    if (error) throw error
    return data.signedUrl
  }

  async function deleteDocument(path: string) {
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    if (error) throw error
    await refresh()
  }

  return {
    documents,
    loading,
    error,
    refresh,
    uploadFile,
    saveTextDocument,
    getDownloadUrl,
    deleteDocument,
  }
}
