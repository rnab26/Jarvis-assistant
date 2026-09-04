import { Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { ConfirmerSuppression } from "@/components/ConfirmerSuppression"
import { LoadError } from "@/components/LoadError"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { EchangesApi } from "@/hooks/useEchanges"
import type { Echange } from "@/types/database"

/** Combien on affiche avant de demander « voir plus » : une conversation d'une
 *  journée tient largement dedans, et la page reste lisible sur un téléphone. */
const PAR_PAGE = 20

function jour(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(iso),
  )
}

function heure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  )
}

function sansAccents(texte: string): string {
  return texte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Ce que Jarvis peut ressortir d'une conversation passée.
 *
 * Depuis le chantier caa54df2, il retrouve le mot-à-mot des sept derniers
 * jours par le sens : « on avait parlé de quoi pour la villa Dan ? ». Raphaël
 * doit donc pouvoir voir ce qui est gardé et en effacer ce qu'il veut —
 * sinon la seule façon de le savoir serait de le demander à Jarvis.
 */
export function ConversationsRecentes({ api }: { api: EchangesApi }) {
  const { echanges, loading, error, refresh, oublier, toutOublier } = api
  const [recherche, setRecherche] = useState("")
  const [limite, setLimite] = useState(PAR_PAGE)
  const [aSupprimer, setASupprimer] = useState<Echange | null>(null)
  const [toutSupprimer, setToutSupprimer] = useState(false)

  const filtres = useMemo(() => {
    const q = sansAccents(recherche.trim())
    if (!q) return echanges
    return echanges.filter((e) => sansAccents(`${e.transcript} ${e.reponse ?? ""}`).includes(q))
  }, [echanges, recherche])

  const visibles = filtres.slice(0, limite)

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Vos conversations (sept derniers jours)</CardTitle>
          <span className="flex-1" />
          {echanges.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setToutSupprimer(true)}>
              <Trash2 className="size-4" />
              Tout effacer
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Jarvis s'appuie là-dessus quand tu lui demandes de quoi vous aviez parlé. Ça s'efface tout
          seul au bout de sept jours ; tu peux aussi en retirer ce que tu veux tout de suite.
        </p>
        {echanges.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value)
                setLimite(PAR_PAGE)
              }}
              placeholder="Chercher un mot dans vos échanges"
              aria-label="Chercher dans les conversations"
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {loading ? (
          <p className="py-6 text-center text-muted-foreground">Chargement...</p>
        ) : error ? (
          <LoadError message={error} onRetry={refresh} />
        ) : echanges.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            Aucune conversation gardée. Parle à Jarvis : vos échanges apparaîtront ici, et il pourra
            y revenir.
          </p>
        ) : filtres.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            Rien qui contienne « {recherche.trim()} ».
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {filtres.length} échange{filtres.length > 1 ? "s" : ""}
              {recherche.trim() && ` sur ${echanges.length}`}
            </p>
            {visibles.map((echange, index) => {
              const nouveauJour = index === 0 || jour(visibles[index - 1].created_at) !== jour(echange.created_at)
              return (
                <div key={echange.id} className="flex flex-col gap-2">
                  {nouveauJour && (
                    <p className="mt-2 text-xs font-medium text-muted-foreground first-letter:uppercase">
                      {jour(echange.created_at)}
                    </p>
                  )}
                  <div className="flex flex-col gap-1 rounded-lg border p-3">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-sm">{echange.transcript}</p>
                      <span className="pt-0.5 text-xs whitespace-nowrap text-muted-foreground">
                        {heure(echange.created_at)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Effacer cet échange"
                        onClick={() => setASupprimer(echange)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {echange.reponse && (
                      <p className="text-sm text-muted-foreground">— {echange.reponse}</p>
                    )}
                  </div>
                </div>
              )
            })}
            {filtres.length > visibles.length && (
              <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + PAR_PAGE)}>
                Voir les {Math.min(PAR_PAGE, filtres.length - visibles.length)} suivants
              </Button>
            )}
          </>
        )}
      </CardContent>

      <ConfirmerSuppression
        ouvert={aSupprimer !== null}
        titre="Effacer cet échange ?"
        detail={
          aSupprimer
            ? `« ${aSupprimer.transcript.slice(0, 160)}${aSupprimer.transcript.length > 160 ? "…" : ""} » — Jarvis ne pourra plus y revenir.`
            : ""
        }
        libelleAction="Effacer"
        onFermer={() => setASupprimer(null)}
        onConfirmer={async () => {
          if (aSupprimer) await oublier(aSupprimer.id)
        }}
      />

      <ConfirmerSuppression
        ouvert={toutSupprimer}
        titre="Effacer tout l'historique ?"
        detail={`Les ${echanges.length} échanges gardés seront supprimés. Ce que Jarvis a retenu de toi (les souvenirs, plus haut) n'est pas touché.`}
        libelleAction="Tout effacer"
        onFermer={() => setToutSupprimer(false)}
        onConfirmer={toutOublier}
      />
    </Card>
  )
}
