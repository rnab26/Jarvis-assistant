import { History } from "lucide-react"
import { useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { useHistoriqueChantier, type HistoriqueApi } from "@/hooks/useHistoriqueChantier"
import {
  caracteresPerdus,
  noteEcrasee,
  phraseDuChangement,
  quandCourt,
} from "@/lib/historiqueChantier"
import { withErrorToast } from "@/lib/notifyError"

/**
 * « Ce qui a changé » — l'historique d'un chantier, dans sa carte dépliée.
 *
 * POURQUOI. Le CLAUDE.md du projet porte cet avertissement, écrit après coup :
 * « Le 5 sept. puis le 6, deux notes ont été écrasées de cette façon — l'une
 * contenait un retour de Raphaël qui n'était écrit nulle part ailleurs. » La
 * parade était une consigne, et une consigne qu'aucun mécanisme ne soutient
 * finit par être oubliée. La trace vient maintenant d'un TRIGGER, donc quel
 * que soit le chemin d'écriture — l'app, la voix, un script, une session.
 *
 * DANS LA CARTE DÉPLIÉE, ET REPLIÉ PAR DÉFAUT. Le tableau du cockpit a un
 * budget de hauteur mesuré ; cet historique n'a rien à y faire tant qu'on ne
 * le demande pas. Il ne se charge d'ailleurs qu'à ce moment-là.
 */
export function HistoriqueChantier({
  itemId,
  api,
}: {
  itemId: string
  /** Injectable pour le banc d'essai, qui n'a pas Supabase. */
  api?: HistoriqueApi
}) {
  return api ? <Liste api={api} /> : <ListeBranchee itemId={itemId} />
}

function ListeBranchee({ itemId }: { itemId: string }) {
  const [ouvert, setOuvert] = useState(false)
  const api = useHistoriqueChantier(itemId, ouvert)
  return <Liste api={api} ouvert={ouvert} onOuvrir={setOuvert} />
}

function Liste({
  api,
  ouvert: ouvertExterne,
  onOuvrir,
}: {
  api: HistoriqueApi
  ouvert?: boolean
  onOuvrir?: (v: boolean) => void
}) {
  const [ouvertLocal, setOuvertLocal] = useState(false)
  const ouvert = ouvertExterne ?? ouvertLocal
  const basculer = () => (onOuvrir ?? setOuvertLocal)(!ouvert)
  const { lignes, chargement, erreur, restaurer } = api

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={basculer}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground underline"
      >
        <History className="size-3" />
        Ce qui a changé
      </button>

      {ouvert && chargement && (
        <p className="text-xs text-muted-foreground">Lecture de l'historique…</p>
      )}

      {ouvert && erreur && (
        <p className="text-xs text-destructive">
          L'historique n'a pas pu être lu : {erreur}. Ça ne dit rien de ce qui a été enregistré —
          seulement qu'on n'arrive pas à le consulter d'ici.
        </p>
      )}

      {ouvert && !chargement && !erreur && lignes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Rien n'a changé depuis que ce chantier est suivi.
        </p>
      )}

      {ouvert &&
        lignes.map((ligne) => {
          const perdus = caracteresPerdus(ligne)
          const ecrasee = noteEcrasee(ligne)
          return (
            <div key={ligne.id} className="rounded-md border px-2.5 py-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1">{phraseDuChangement(ligne)}</span>
                <span className="shrink-0 text-muted-foreground">
                  {quandCourt(ligne.change_at)}
                </span>
              </div>

              {ecrasee && (
                <>
                  {/* Le texte d'avant, coupé : c'est lui qu'on vient chercher.
                      Entier, il ferait de cette carte un second cockpit. */}
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                    {ligne.avant}
                  </p>
                  {perdus > 0 && (
                    <p className="mt-0.5 text-muted-foreground/70">
                      {perdus} caractère{perdus > 1 ? "s" : ""} en moins
                    </p>
                  )}
                  <ConfirmerAction
                    titre="Revenir à cette note ?"
                    description="La note actuelle sera remplacée par celle-ci. Le changement est lui aussi enregistré : tu pourras revenir en arrière."
                    libelleConfirmation="Revenir à cette note"
                    destructif={false}
                    onConfirmer={() =>
                      withErrorToast(
                        "La note n'a pas pu être restaurée",
                        async () => {
                          await restaurer(ligne.id)
                        },
                      )
                    }
                    trigger={
                      <button
                        type="button"
                        className="mt-1 self-start text-xs underline text-muted-foreground"
                      >
                        Revenir à cette note
                      </button>
                    }
                  />
                </>
              )}
            </div>
          )
        })}
    </div>
  )
}
