import { Check, Reply, Send, X } from "lucide-react"
import { useState } from "react"
import { LoadError } from "@/components/LoadError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ago, courtAuteur, KIND_LABEL, KIND_VARIANT } from "@/lib/journalBord"
import { questionPourRaphael } from "@/lib/journalDestinataire"
import { alreadyNotified } from "@/lib/notifyError"
import type { DevItem, DevLogEntry, DevLogKind } from "@/types/database"

interface DevLogFeedProps {
  entries: DevLogEntry[]
  devItems: DevItem[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  onAdd: (body: string, kind?: DevLogKind, itemId?: string | null) => Promise<void>
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
  const [repondreA, setRepondreA] = useState<DevLogEntry | null>(null)

  const titreParItem = new Map(devItems.map((i) => [i.id, i.title]))
  const enAttente = entries.filter(questionPourRaphael).length

  // Les questions qui lui sont adressées remontent en tête du fil : c'est
  // elles que le badge annonce, pas la peine de défiler pour les trouver.
  const entriesTriees = [
    ...entries.filter(questionPourRaphael),
    ...entries.filter((e) => !questionPourRaphael(e)),
  ]

  function repondre(entry: DevLogEntry) {
    setRepondreA(entry)
    setDraft("")
  }

  async function send() {
    if (!draft.trim()) return
    setSending(true)
    try {
      if (repondreA) {
        await onAdd(draft.trim(), "reponse", repondreA.item_id)
        await onMarkAnswered(repondreA.id)
        setRepondreA(null)
      } else {
        await onAdd(draft.trim())
      }
      setDraft("")
    } catch {
      // Erreur déjà signalée par un toast : on garde le texte saisi.
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-2">
        <CardTitle className="text-base">Journal de bord</CardTitle>
        {enAttente > 0 && (
          <Badge variant="default">
            {enAttente} question{enAttente > 1 ? "s" : ""} en attente
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {repondreA && (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              <Reply className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Réponse à {courtAuteur(repondreA.author)} : {repondreA.body}
              </span>
              <button
                type="button"
                aria-label="Annuler la réponse"
                className="shrink-0"
                onClick={() => setRepondreA(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <Textarea
            value={draft}
            placeholder={
              repondreA
                ? "Ta réponse…"
                : "Un mot aux sessions en cours : une consigne, une réponse, la prochaine priorité…"
            }
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
            {repondreA ? "Répondre" : "Publier"}
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
            {entriesTriees.map((entry) => {
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
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => repondre(entry)}>
                        <Reply className="size-4" />
                        Répondre
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onMarkAnswered(entry.id).catch(alreadyNotified)}
                      >
                        <Check className="size-4" />
                        Marquer traité
                      </Button>
                    </div>
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
