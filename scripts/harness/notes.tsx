import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useState } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { NoteFormDialog } from "@/components/notes/NoteFormDialog"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { normaliserRecherche } from "@/lib/sections"
import type { Note, NoteInput } from "@/types/database"

/**
 * Banc d'essai de l'onglet Notes (chantier 5ad49cc0) — les VRAIS composants
 * (NoteFormDialog, ConfirmerAction), montés hors de Supabase avec un état
 * local. Reprend la même structure que NotesPage.tsx, sans passer par le
 * contexte : voir scripts/verifier-notes-web.mjs.
 */

function note(id: string, title: string, content: string, updated_at: string): Note {
  return { id, user_id: "banc", title, content, created_at: updated_at, updated_at }
}

const NOTES_INITIALES: Note[] = [
  note("n1", "Idée cadeau Mélissa", "Un livre de cuisine italienne, elle en a parlé la semaine dernière.", "2026-09-05T10:00:00Z"),
  note("n2", "Code du portail de la villa Dan", "1234#, à changer après les travaux.", "2026-09-06T14:30:00Z"),
]

function formatMaj(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  return `${jour} à ${heure}`
}

function BancDesNotes() {
  const [notes, setNotes] = useState<Note[]>(NOTES_INITIALES)
  const [recherche, setRecherche] = useState("")

  async function addNote(input: NoteInput) {
    const maintenant = new Date().toISOString()
    setNotes((liste) => [
      { id: `n${liste.length + 1}`, user_id: "banc", created_at: maintenant, updated_at: maintenant, ...input },
      ...liste,
    ])
  }
  async function updateNote(id: string, input: Partial<NoteInput>) {
    setNotes((liste) =>
      liste.map((n) => (n.id === id ? { ...n, ...input, updated_at: new Date().toISOString() } : n)),
    )
  }
  async function deleteNote(id: string) {
    setNotes((liste) => liste.filter((n) => n.id !== id))
  }

  const filtrees = recherche.trim()
    ? notes.filter((n) => {
        const mot = normaliserRecherche(recherche)
        return normaliserRecherche(n.title).includes(mot) || normaliserRecherche(n.content).includes(mot)
      })
    : notes

  return (
    <div className="flex flex-col gap-4 p-4">
      <Toaster />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Du texte libre, pour toi — distinct des tâches, des documents et de la mémoire.
        </p>
        <NoteFormDialog
          onSubmit={addNote}
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

      {notes.length === 0 ? (
        <p id="vide" className="py-8 text-center text-muted-foreground">
          Aucune note pour l'instant. « Nouvelle note » pour commencer.
        </p>
      ) : filtrees.length === 0 ? (
        <p id="rien-trouve" className="py-8 text-center text-muted-foreground">
          Rien ne correspond à « {recherche} ».
        </p>
      ) : (
        <div id="liste" className="flex flex-col gap-2">
          {filtrees.map((n) => (
            <Card key={n.id}>
              <CardContent className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{n.title}</p>
                  {n.content && (
                    <p className="mt-0.5 line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">
                      {n.content}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">Modifiée {formatMaj(n.updated_at)}</p>
                </div>
                <NoteFormDialog
                  note={n}
                  onSubmit={(input) => updateNote(n.id, input)}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Modifier">
                      <Pencil className="size-4" />
                    </Button>
                  }
                />
                <ConfirmerAction
                  titre="Supprimer cette note ?"
                  description={<>« {n.title} » sera supprimée définitivement, sans corbeille.</>}
                  libelleConfirmation="Supprimer"
                  destructif
                  onConfirmer={() => deleteNote(n.id)}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Supprimer">
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

createRoot(document.getElementById("root")!).render(<BancDesNotes />)
