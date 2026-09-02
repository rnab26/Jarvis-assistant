import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { DocumentFile } from "@/types/database"

const BUCKET = "documents"

export function useDocuments(userId: string | undefined) {
  const [documents, setDocuments] = useState<DocumentFile[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) return

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(userId, { sortBy: { column: "created_at", order: "desc" } })
    if (error) throw error

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
    setLoading(false)
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

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
    const safeName = filename.trim().endsWith(".txt") ? filename.trim() : `${filename.trim()}.txt`
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${userId}/${safeName}`, blob, { upsert: true, contentType: "text/plain" })
    if (error) throw error
    await refresh()
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

  return { documents, loading, uploadFile, saveTextDocument, getDownloadUrl, deleteDocument }
}
