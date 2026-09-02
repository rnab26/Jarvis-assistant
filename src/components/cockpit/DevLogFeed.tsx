import { Check, Send } from "lucide-react"
import { useState } from "react"
import { LoadError } from "@/components/LoadError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { alreadyNotified } from "@/lib/notifyError"
import type { DevItem, DevLogEntry, DevLogKind } from "@/types/database"

const KIND_LABEL: Record<DevLogKind, string> = {
  question: "Question",
  reponse: "Réponse",
  info: "Info",
  blocage: "Blocage",
}

const KIND_VARIANT: Record<DevLogKind, "default" | "secondary" | "destructive" | "outline"> = {
  question: "default",
  reponse: "secondary",
  info: "outline",
  blocage: "destructive",
}

/** "il y a 3 h" plutôt qu'une date brute : on lit un fil, pas un registre. */
function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  return `il y a ${Math.round(heures / 24)} j`
}

/** Une branche de session est longue : on n'en garde que la partie qui distingue. */
function courtAuteur(auteur: string) {
  return auteur.replace(/^claude\//, "")
}

interface DevLogFeedProps {
  entries: DevLogEntry[]
  devItems: DevItem[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  onAdd: (body: string) => Promise<void>
  onMarkAnswered: (id: string) => Promise<void>
}

/**
 * Le journal partagé entre les sessions Claude Code qui travaillent sur ce
 * repo en parallèle — et par lequel Raphaël leur parle.
 */
export function DevLogFeed({
  entries,
  devItems,
  loading,
  error,
  onRefresh,
  onAdd,
  onMarkAnswered,
}: DevLogFeedProps) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  const titreParItem = new Map(devItems.map((i) => [i.id, i.title]))
  const enAttente = entries.filter((e) => e.kind === "question" && !e.answered_at).length

  async function send() {
    if (!draft.trim()) return
    setSending(true)
    try {
      await onAdd(draft.trim())
      setDraft("")
    } catch {
      // Erreur déjà signalée par un toast : on garde le texte saisi.
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Journal de bord</CardTitle>
        {enAttente > 0 && (
          <Badge variant="default">
            {enAttente} question{enAttente > 1 ? "s" : ""} en attente
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            placeholder="Un mot aux sessions en cours : une consigne, une réponse, la prochaine priorité…"
            aria-label="Écrire dans le journal de bord"
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            size="sm"
            className="self-end"
            disabled={sending || !draft.trim()}
            onClick={send}
          >
            <Send className="size-4" />
            Publier
          </Button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Chargement...</p>
        ) : error ? (
          <LoadError message={error} onRetry={onRefresh} />
        ) : entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Rien dans le journal pour l'instant.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => {
              const attente = entry.kind === "question" && !entry.answered_at
              return (
                <div
                  key={entry.id}
                  className={`flex flex-col gap-1.5 rounded-lg border p-3 ${
                    attente ? "border-primary/40 bg-primary/5" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_VARIANT[entry.kind]}>{KIND_LABEL[entry.kind]}</Badge>
                    <span className="text-sm font-medium">{courtAuteur(entry.author)}</span>
                    <span className="text-xs text-muted-foreground">{ago(entry.created_at)}</span>
                    {entry.item_id && titreParItem.has(entry.item_id) && (
                      <span className="w-full truncate text-xs text-muted-foreground">
                        sur « {titreParItem.get(entry.item_id)} »
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{entry.body}</p>
                  {attente && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => onMarkAnswered(entry.id).catch(alreadyNotified)}
                    >
                      <Check className="size-4" />
                      Marquer traité
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
