import { Download, Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { LoadError } from "@/components/LoadError"
import { Button } from "@/components/ui/button"
import { useJarvisData } from "@/contexts/JarvisDataContext"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function DocumentsPage() {
  const { documentsState } = useJarvisData()
  const {
    documents,
    loading,
    error: loadError,
    refresh,
    uploadFile,
    getDownloadUrl,
    deleteDocument,
  } = documentsState
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      await uploadFile(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi du document.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload(path: string) {
    setError(null)
    try {
      const url = await getDownloadUrl(path)
      window.open(url, "_blank", "noreferrer")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du téléchargement.")
    }
  }

  async function handleDelete(path: string) {
    setError(null)
    try {
      await deleteDocument(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la suppression.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Tes documents (et ceux que Jarvis enregistre lui-même sur commande vocale).
        </p>
        <Button size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-4" />
          Importer
        </Button>
        <input ref={fileInputRef} type="file" hidden onChange={handleFileChange} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={refresh} />
      ) : documents.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Aucun document.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <div key={doc.path} className="flex items-center gap-2 rounded-lg border p-3">
              <div className="flex-1 overflow-hidden">
                <p className="truncate">{doc.name}</p>
                <p className="text-sm text-muted-foreground">{formatSize(doc.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Télécharger"
                onClick={() => handleDownload(doc.path)}
              >
                <Download className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Supprimer"
                onClick={() => handleDelete(doc.path)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
