import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { cleStockage, ligneDeDocument, nomLisible } from "@/lib/nomDocument"
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
          // La conversion vit dans `nomDocument.ts`, PAS ici : le banc
          // d'essai de l'écran appelle la même. Recopiée des deux côtés, elle
          // laissait le banc vert quand on la cassait dans ce hook.
          .map((f) =>
            ligneDeDocument(
              userId,
              f.name,
              f.metadata?.size ?? 0,
              f.created_at ?? "",
              f.metadata?.mimetype ?? null,
            ),
          ),
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
    // JAMAIS `file.name` directement : Storage refuse la clé et l'import
    // échouait pour tout nom accentué ou hébreu (mesuré le 15 sept. 2026).
    const cle = cleStockage(file.name)
    if (!cle) throw new Error("Ce fichier n'a pas de nom : renomme-le avant de l'importer.")
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${userId}/${cle}`, file, { upsert: true })
    if (error) throw error
    await refresh()
  }

  /** Utilisé par la voix : Jarvis enregistre un texte dicté comme document. */
  async function saveTextDocument(filename: string, content: string) {
    if (!userId) return
    await withErrorToast("Impossible d'enregistrer le document", async () => {
      const voulu = filename.trim().endsWith(".txt") ? filename.trim() : `${filename.trim()}.txt`
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(`${userId}/${cleStockage(voulu)}`, blob, { upsert: true, contentType: "text/plain" })
      if (uploadError) throw uploadError
      await refresh()
    })
  }

  /** Le pendant binaire de `saveTextDocument` : un PDF ou une image récupéré
   * au bout d'un lien (chantier 13c39a9b), déjà encodé en base64 par la Edge
   * Function (google-gmail, action document_lien). */
  async function saveBinaryDocument(filename: string, base64: string, contentType: string | null) {
    if (!userId) return
    await withErrorToast("Impossible d'enregistrer le document", async () => {
      const binaire = atob(base64)
      const octets = new Uint8Array(binaire.length)
      for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
      const blob = new Blob([octets], { type: contentType ?? "application/octet-stream" })
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(`${userId}/${cleStockage(filename)}`, blob, {
          upsert: true,
          contentType: contentType ?? "application/octet-stream",
        })
      if (uploadError) throw uploadError
      await refresh()
    })
  }

  async function getDownloadUrl(path: string) {
    // `download` nomme le fichier que le téléphone enregistre. Sans lui, il
    // recevrait la clé échappée (« =05D8=05D5… ») au lieu de son vrai nom, et
    // un document sauvé serait introuvable hors de Jarvis. L'option existe
    // bien dans @supabase/storage-js installé (vérifié dans ses types).
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60, { download: nomLisible(path.split("/").pop() ?? "") })
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
    saveBinaryDocument,
    getDownloadUrl,
    deleteDocument,
  }
}
