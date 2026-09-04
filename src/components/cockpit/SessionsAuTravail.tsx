import { Unlock, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import type { DevItem } from "@/types/database"

/**
 * Qui travaille sur quoi, en ce moment.
 *
 * Raphaël ouvre souvent trois ou quatre sessions Claude Code en parallèle, une
 * par thème. Jusqu'ici le cockpit n'en disait qu'une chose, en bas de la
 * fenêtre d'envoi : combien il y en avait. Pas ce qu'elles font. Pour le
 * savoir il fallait déplier chaque section et lire les « Prise par … » un par
 * un — donc, en pratique, ne pas le savoir.
 *
 * L'autre moitié, plus sournoise : une session interrompue ne libère pas ses
 * chantiers. Sa réservation expire, mais le chantier continue d'afficher
 * « Prise par … » jusqu'à la date d'expiration, et on croit qu'il avance alors
 * que personne n'est dessus. Ces réservations-là sont donc listées à part, et
 * se libèrent d'un bouton.
 */

/** Ce qu'il reste de réservation, en clair. */
function tempsRestant(expire: string): string {
  const minutes = Math.round((new Date(expire).getTime() - Date.now()) / 60000)
  if (minutes < 1) return "moins d'une minute"
  if (minutes < 60) return `${minutes} min`
  const heures = Math.floor(minutes / 60)
  return `${heures} h ${String(minutes % 60).padStart(2, "0")}`
}

function depuisQuand(expire: string): string {
  const minutes = Math.round((Date.now() - new Date(expire).getTime()) / 60000)
  if (minutes < 60) return `depuis ${minutes} min`
  const heures = Math.round(minutes / 60)
  return heures < 24 ? `depuis ${heures} h` : `depuis ${Math.round(heures / 24)} j`
}

const nomCourt = (session: string) => session.replace(/^claude\//, "")

interface SessionsAuTravailProps {
  devItems: DevItem[]
  onLiberer: (id: string) => Promise<void>
}

export function SessionsAuTravail({ devItems, onLiberer }: SessionsAuTravailProps) {
  const maintenant = Date.now()
  const reserves = devItems.filter((i) => i.claimed_by && i.claim_expires_at && !i.archived_at)
  const actifs = reserves.filter((i) => new Date(i.claim_expires_at!).getTime() > maintenant)
  const perimes = reserves.filter((i) => new Date(i.claim_expires_at!).getTime() <= maintenant)

  const parSession = new Map<string, DevItem[]>()
  for (const item of actifs) {
    const cle = item.claimed_by!
    parSession.set(cle, [...(parSession.get(cle) ?? []), item])
  }
  const sessions = [...parSession.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"))

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-2">
        <CardTitle className="min-w-0 flex-1 text-base">
          <Users className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
          Qui travaille en ce moment
        </CardTitle>
        <Badge variant={sessions.length > 0 ? "default" : "outline"} className="shrink-0">
          {sessions.length} session{sessions.length > 1 ? "s" : ""}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune session Claude Code ne travaille en ce moment. Ce que tu envoies sera lu au
            démarrage de la prochaine.
          </p>
        ) : (
          sessions.map(([session, chantiers]) => (
            <div key={session} className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">{nomCourt(session)}</p>
              {chantiers.map((item) => (
                <p key={item.id} className="truncate text-xs text-muted-foreground">
                  · {item.title}{" "}
                  <span className="opacity-70">
                    (encore {tempsRestant(item.claim_expires_at!)})
                  </span>
                </p>
              ))}
            </div>
          ))
        )}

        {perimes.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-2">
            <p className="text-xs text-muted-foreground">
              {perimes.length} chantier{perimes.length > 1 ? "s" : ""} porte
              {perimes.length > 1 ? "nt" : ""} encore le nom d'une session qui s'est arrêtée sans
              le libérer. Personne n'est dessus.
            </p>
            {perimes.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs">
                  {item.title}{" "}
                  <span className="text-muted-foreground">
                    — {nomCourt(item.claimed_by!)}, {depuisQuand(item.claim_expires_at!)}
                  </span>
                </p>
                <ConfirmerAction
                  destructif={false}
                  libelleConfirmation="Libérer"
                  titre="Libérer ce chantier ?"
                  description={
                    <>
                      « {item.title} » redeviendra libre : la prochaine session pourra le
                      prendre. Le chantier lui-même n'est pas modifié.
                    </>
                  }
                  onConfirmer={() => onLiberer(item.id)}
                  trigger={
                    <Button variant="ghost" size="sm" className="shrink-0">
                      <Unlock className="size-3.5" />
                      Libérer
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
