import { Check, Reply, Send, X } from "lucide-react"
import { useState } from "react"
import { LoadError } from "@/components/LoadError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { CarteRepliable } from "@/components/cockpit/CarteRepliable"
import { Textarea } from "@/components/ui/textarea"
import { ago, courtAuteur, KIND_LABEL, KIND_VARIANT } from "@/lib/journalBord"
import { questionPourRaphael } from "@/lib/journalDestinataire"
import {
  citationDuParent,
  doitMarquerTraite,
  parentDe,
  peutRepondre,
  phraseDeCoupure,
  resteACharger,
} from "@/lib/filJournal"
import { PAR_PAGE } from "@/hooks/useDevLog"
import { alreadyNotified } from "@/lib/notifyError"
import type { DevItem, DevLogEntry, DevLogKind } from "@/types/database"

interface DevLogFeedProps {
  entries: DevLogEntry[]
  devItems: DevItem[]
  /** Combien d'entrées il y a EN TOUT, pour dire ce qu'on ne montre pas.
   * `null` quand on ne sait pas : on se tait plutôt que d'annoncer un faux. */
  total?: number | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onChargerPlus?: () => void
  onAdd: (
    body: string,
    kind?: DevLogKind,
    itemId?: string | null,
    repondA?: string | null,
  ) => Promise<void>
  onMarkAnswered: (id: string) => Promise<void>
}

/**
 * Le journal partagé entre les sessions Claude Code qui travaillent sur ce
 * repo en parallèle — et par lequel Raphaël leur parle.
 */
export function DevLogFeed({
  entries,
  devItems,
  total = null,
  loading,
  error,
  onRefresh,
  onChargerPlus,
  onAdd,
  onMarkAnswered,
}: DevLogFeedProps) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [repondreA, setRepondreA] = useState<DevLogEntry | null>(null)

  const titreParItem = new Map(devItems.map((i) => [i.id, i.title]))
  const parIdentifiant = new Map(entries.map((e) => [e.id, e]))
  const enAttente = entries.filter(questionPourRaphael).length
  const coupure = phraseDeCoupure(entries.length, total)
  const suite = resteACharger(entries.length, total, PAR_PAGE)

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
        await onAdd(draft.trim(), "reponse", repondreA.item_id, repondreA.id)
        // Marquer traité ne vaut QUE pour une question en attente : c'est ce
        // drapeau qui la sort de « pour toi ». Répondre à une note
        // d'information ne referme rien (`filJournal.ts`).
        if (doitMarquerTraite(repondreA)) await onMarkAnswered(repondreA.id)
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
    // Repliée, TOUJOURS, mais son badge reste sur la barre de titre : une
    // question qui l'attend se voit sans ouvrir. Mesuré le 4 sept. : dépliée,
    // cette carte à elle seule repoussait le tableau des chantiers de 424
    // points sur un écran de téléphone.
    //
    // Elle s'ouvrait d'elle-même quand une question attendait ; ça n'a plus
    // lieu d'être depuis « Où j'en suis », qui compte ces questions-là dans
    // sa colonne « pour toi » et dit sur quel chantier elles portent — là où
    // on y répond. S'ouvrir ici repoussait le tableau des chantiers à 898
    // points, hors du premier écran, un jour où justement quelque chose
    // l'attendait.
    <CarteRepliable
      titre="Journal de bord"
      badge={
        enAttente > 0 ? (
          <Badge variant="default" className="shrink-0">
            {enAttente} question{enAttente > 1 ? "s" : ""} en attente
          </Badge>
        ) : entries.length > 0 ? (
          <Badge variant="outline" className="shrink-0">
            {entries.length}
          </Badge>
        ) : undefined
      }
    >
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
              const citation = citationDuParent(parentDe(entry, parIdentifiant))
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
                  {/* Ce à quoi cette entrée répond. Sans ça, une réponse à une
                      note d'information retombe dans le flux sans que rien ne
                      dise ce qu'elle répond — le défaut d'aujourd'hui, à
                      l'envers. Muet quand le parent n'est pas chargé : on ne
                      prétend pas citer ce qu'on n'a pas. */}
                  {citation && (
                    <p className="truncate border-l-2 pl-2 text-xs text-muted-foreground/80">
                      en réponse à {citation}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{entry.body}</p>
                  <div className="flex gap-1">
                    {/* SUR TOUTE ENTRÉE, et c'est le cœur de ce qu'il a
                        demandé. Le 17 sept., ce bouton n'apparaissait que sur
                        une question sans réponse : UNE entrée sur 304. Les 208
                        notes des sessions — celles par lesquelles elles lui
                        parlent — n'offraient aucun moyen d'enchaîner. */}
                    {peutRepondre(entry) && (
                      <Button variant="ghost" size="sm" onClick={() => repondre(entry)}>
                        <Reply className="size-4" />
                        Répondre
                      </Button>
                    )}
                    {attente && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onMarkAnswered(entry.id).catch(alreadyNotified)}
                      >
                        <Check className="size-4" />
                        Marquer traité
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Ce que l'écran NE MONTRE PAS. Il y avait 304 entrées et on en
                affichait 60, sans un mot — ce qui se lit exactement comme « il
                n'y a plus rien ». Muet quand tout est affiché : un « 12 sur
                12 » permanent est du bruit. */}
            {coupure && (
              <div className="flex flex-col gap-1.5 pt-1">
                <p className="text-xs text-muted-foreground">{coupure}</p>
                {suite > 0 && onChargerPlus && (
                  <Button variant="outline" size="sm" className="self-start" onClick={onChargerPlus}>
                    Voir les {suite} précédentes
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </CarteRepliable>
  )
}
