import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { LoadError } from "@/components/LoadError"
import { NoteFormDialog } from "@/components/notes/NoteFormDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { normaliserRecherche } from "@/lib/sections"

/** « il y a un instant », « le 3 sept. à 14 h 05 » — pour situer une note
 * sans qu'elle porte une échéance (elle n'en a pas, c'est ce qui la
 * distingue d'une tâche). */
function formatMaj(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  return `${jour} à ${heure}`
}

export function NotesPage() {
  const { notesState } = useJarvisData()
  const { notes, loading, error, refresh, addNote, updateNote, deleteNote } = notesState
  const [recherche, setRecherche] = useState("")

  const filtrees = recherche.trim()
    ? notes.filter((n) => {
        const mot = normaliserRecherche(recherche)
        return (
          normaliserRecherche(n.title).includes(mot) || normaliserRecherche(n.content).includes(mot)
        )
      })
    : notes

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Du texte libre, pour toi — distinct des tâches, des documents et de la mémoire.
        </p>
        <NoteFormDialog
          onSubmit={async (input) => {
            await addNote(input)
          }}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Nouvelle note
            </Button>
          }
        />
      </div>

      {notes.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher dans tes notes"
            aria-label="Chercher dans tes notes"
          />
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : error ? (
        <LoadError message={error} onRetry={refresh} />
      ) : notes.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Aucune note pour l'instant. « Nouvelle note » pour commencer.
        </p>
      ) : filtrees.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Rien ne correspond à « {recherche} ».
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrees.map((note) => (
            <Card key={note.id}>
              <CardContent className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{note.title}</p>
                  {note.content && (
                    <p className="mt-0.5 line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">
                      {note.content}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Modifiée {formatMaj(note.updated_at)}
                  </p>
                </div>
                <NoteFormDialog
                  note={note}
                  onSubmit={(input) => updateNote(note.id, input)}
                  trigger={
                    <Button variant="ghost" size="icon" className="zone-tactile" aria-label="Modifier">
                      <Pencil className="size-4" />
                    </Button>
                  }
                />
                <ConfirmerAction
                  titre="Supprimer cette note ?"
                  description={
                    <>« {note.title} » sera supprimée définitivement, sans corbeille.</>
                  }
                  libelleConfirmation="Supprimer"
                  destructif
                  onConfirmer={() => deleteNote(note.id)}
                  trigger={
                    <Button variant="ghost" size="icon" className="zone-tactile" aria-label="Supprimer">
                      <Trash2 className="size-4" />
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
