import { useEffect, useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import {
  RETENTIONS,
  combienSeraientEffaces,
  ecrireRetention,
  lireRetention,
} from "@/lib/memoirePrefs"
import { errorMessage } from "@/lib/errorMessage"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/**
 * Ce dont la carte a besoin pour annoncer ce qu'une purge effacerait. Nommé et
 * injecté — même motif que `EchangesApi` et `NotificationsApi` — pour que le
 * banc d'essai (`scripts/harness/reglages.tsx`) parcoure la VRAIE carte sans
 * Supabase, y compris dans l'état où la lecture a échoué.
 */
export interface DatesEchangesApi {
  /** null = pas encore lu, ou lecture en échec. */
  dates: string[] | null
  erreur: string | null
}

/** Les dates des conversations gardées, et rien d'autre : jamais leur texte. */
export function useDatesEchanges(): DatesEchangesApi {
  const { session } = useAuth()
  const [dates, setDates] = useState<string[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    const userId = session?.user.id
    if (!userId) {
      setDates([])
      return
    }
    ;(async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.from("echanges").select("created_at").limit(5000),
        )
        if (!vivant) return
        if (error) throw error
        setDates((data ?? []).map((e) => e.created_at as string))
        setErreur(null)
      } catch (e) {
        if (!vivant) return
        // Une panne de lecture ne doit pas se lire comme « aucune
        // conversation » : ce serait annoncer « 0 seront effacées » avant une
        // purge qui en effacerait des centaines.
        setDates(null)
        setErreur(errorMessage(e))
      }
    })()
    return () => {
      vivant = false
    }
  }, [session?.user.id])

  return { dates, erreur }
}

/**
 * Combien de temps Jarvis garde le mot-à-mot des conversations.
 *
 * Ce réglage n'est pas un affichage : il commande une SUPPRESSION en base, à
 * chaque phrase. Raccourcir la durée efface donc des conversations, tout de
 * suite et sans retour possible — d'où la confirmation, et surtout le NOMBRE.
 * Sa règle : la fenêtre dit ce qui va disparaître, nommément.
 *
 * Les dates sont chargées une fois, à l'affichage de la carte, plutôt qu'un
 * compte par durée proposée : quatre requêtes pour quatre boutons sur un écran
 * de réglages, ce serait quatre allers-retours pour rien. Seule la date
 * compte, jamais le texte des conversations.
 */
export function Memoire({ api }: { api: DatesEchangesApi }) {
  const { dates, erreur } = api
  const [choix, setChoix] = useState(lireRetention)

  useRelireApresRestauration(() => setChoix(lireRetention()))

  const actuel = RETENTIONS.find((r) => r.valeur === choix) ?? RETENTIONS[0]

  function appliquer(valeur: string) {
    setChoix(valeur)
    ecrireRetention(valeur)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Combien de temps Jarvis garde tes conversations</CardTitle>
        <CardDescription>
          Le mot-à-mot de ce que vous vous dites, qu'il relit pour répondre à « on avait parlé de
          quoi pour la villa Dan ? ». Ce que Jarvis RETIENT de toi — les souvenirs de l'onglet
          Mémoire — n'est jamais effacé par ce réglage.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {RETENTIONS.map((r) => {
            const actif = choix === r.valeur
            const bouton = (
              <button
                type="button"
                aria-pressed={actif}
                aria-label={`Garder ${r.libelle}`}
                onClick={r.jours === null ? () => appliquer(r.valeur) : undefined}
                className={`flex-1 rounded-md border px-2 py-2 text-xs whitespace-nowrap ${
                  actif ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {r.libelle}
              </button>
            )
            // « Sans limite » n'efface rien : aucune raison de demander.
            if (r.jours === null) return <span key={r.valeur} className="flex-1">{bouton}</span>

            const perdues = dates === null ? null : combienSeraientEffaces(dates, r.jours)
            return (
              <span key={r.valeur} className="flex-1">
                <ConfirmerAction
                  titre={`Ne garder que ${r.libelle} ?`}
                  libelleConfirmation="Effacer et garder cette durée"
                  description={
                    <>
                      {perdues === null ? (
                        <>
                          Les conversations de plus de {r.libelle} seront effacées définitivement à
                          la prochaine phrase. Impossible de dire combien : leur liste n'a pas pu
                          être chargée.
                        </>
                      ) : perdues === 0 ? (
                        <>
                          Rien n'est effacé aujourd'hui : aucune conversation n'a plus de{" "}
                          {r.libelle}. Mais à partir de maintenant, tout ce qui dépassera cette
                          durée le sera, définitivement.
                        </>
                      ) : (
                        <>
                          <strong>
                            {perdues} conversation{perdues > 1 ? "s" : ""}
                          </strong>{" "}
                          {perdues > 1 ? "seront effacées" : "sera effacée"} définitivement à la
                          prochaine phrase, et il n'y a pas de corbeille. Les souvenirs que Jarvis
                          en a tirés, eux, restent.
                        </>
                      )}
                    </>
                  }
                  onConfirmer={() => appliquer(r.valeur)}
                  trigger={bouton}
                />
              </span>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground">{actuel.aide}</p>

        {erreur ? (
          <p className="text-xs text-destructive">
            La liste des conversations n'a pas pu être chargée ({erreur}) : le nombre annoncé avant
            d'effacer sera inconnu.
          </p>
        ) : dates === null ? (
          <p className="text-xs text-muted-foreground">Lecture des conversations…</p>
        ) : dates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucune conversation enregistrée pour l'instant.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {dates.length} conversation{dates.length > 1 ? "s" : ""} gardée
            {dates.length > 1 ? "s" : ""} aujourd'hui. Tu peux les lire et en effacer depuis
            l'onglet Mémoire.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
