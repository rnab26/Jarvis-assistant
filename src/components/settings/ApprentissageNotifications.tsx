import { BrainCircuit, RefreshCw, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"
import {
  CANAUX_AJUSTABLES,
  ECHANTILLON_MIN,
  NOMS_CANAUX,
  peuSuivi,
  statsParCanal,
  type StatsCanal,
} from "@/lib/notifications/apprentissage"
import type { CanalNotif } from "@/lib/notifications/plan"
import {
  lireJournal,
  remettreAZero as remettreAZeroEnBase,
} from "@/lib/notifications/journalApprentissage"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { toast } from "sonner"

/**
 * « Ce que Jarvis a appris » (chantier 05241cc7).
 *
 * Sa réponse, 6 sept. 2026 : « Oui, qu'il apprenne. » Deux exigences de sa
 * réponse tiennent cette carte : VISIBLE (ce que Jarvis a compris de ses
 * priorités, pas une boîte noire) et RÉVERSIBLE (un bouton remet tout à
 * zéro). Rien n'en sort de son téléphone et de sa base — cette carte ne fait
 * QUE lire et effacer `notifications_journal`, qui ne contient déjà que des
 * canaux et deux horodatages, jamais de contenu.
 *
 * Injecté comme ConsommationApi et NotificationsApi : le calcul (qui est
 * « peu suivi », et ce que ça change) vit dans apprentissage.ts, pur et
 * vérifié hors ligne. Cette carte n'a pas le droit de décider, seulement
 * d'afficher ce que le module a décidé.
 */
export interface ApprentissageApi {
  /** null = pas encore lu, ou lecture en échec. */
  stats: Partial<Record<CanalNotif, StatsCanal>> | null
  erreur: string | null
  enCours: boolean
  rafraichir: () => Promise<void>
  /** Sans effet si on n'est pas connecté — le bouton n'est de toute façon
   * jamais affiché dans ce cas, `stats` restant `null`. */
  remettreAZero: () => Promise<void>
}

export function useApprentissageNotifications(): ApprentissageApi {
  const { session } = useAuth()
  const userId = session?.user.id
  const [stats, setStats] = useState<Partial<Record<CanalNotif, StatsCanal>> | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const rafraichir = useCallback(async () => {
    if (!userId) return
    setEnCours(true)
    try {
      const journal = await lireJournal(userId)
      if (journal === null) throw new Error("lecture impossible")
      setStats(statsParCanal(journal, new Date()))
      setErreur(null)
    } catch (e) {
      // Une panne de lecture ne se lit pas comme « rien appris » : ce serait
      // rassurer sur un canal qui, en réalité, s'est peut-être tu à tort.
      setStats(null)
      setErreur(errorMessage(e))
    } finally {
      setEnCours(false)
    }
  }, [userId])

  useEffect(() => {
    void rafraichir()
  }, [rafraichir])

  const remettreAZero = useCallback(async () => {
    if (!userId) return
    await remettreAZeroEnBase(userId)
    await rafraichir()
  }, [userId, rafraichir])

  return { stats, erreur, enCours, rafraichir, remettreAZero }
}

function ligneEngagement(stats: StatsCanal | undefined): string {
  if (!stats || stats.envoyees === 0) return "Pas encore de notification sur ce canal."
  if (stats.jugees < ECHANTILLON_MIN) {
    return `${stats.envoyees} envoyée${stats.envoyees > 1 ? "s" : ""}, pas encore assez pour en tirer quelque chose.`
  }
  const pourcent = Math.round((stats.taux ?? 0) * 100)
  return `${pourcent} % ouvertes sur les ${stats.jugees} qu'on peut juger (${stats.envoyees} envoyées).`
}

export function ApprentissageNotifications({ api }: { api: ApprentissageApi }) {
  const { stats, erreur, enCours, rafraichir, remettreAZero } = api
  const [remiseEnCours, setRemiseEnCours] = useState(false)

  async function surRemiseAZero() {
    setRemiseEnCours(true)
    try {
      await withErrorToast("La remise à zéro a échoué", remettreAZero)
      toast.success("Remis à zéro.", {
        description: "Jarvis recommence à apprendre depuis rien sur ces canaux.",
      })
    } finally {
      setRemiseEnCours(false)
    }
  }

  const rienDuTout =
    stats !== null && CANAUX_AJUSTABLES.every((canal) => !stats[canal] || stats[canal]!.envoyees === 0)

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-start gap-2">
        <span className="min-w-0">
          <CardTitle>
            <BrainCircuit className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
            Ce que Jarvis a appris
          </CardTitle>
          <CardDescription>
            Il regarde, sur ce téléphone et dans ta base, si tu ouvres ou ignores ces
            notifications — jamais leur contenu, jamais ailleurs. Un canal peu suivi se dit
            moins fort à voix haute ; il continue de s'afficher et de sonner normalement,
            comme n'importe lequel des autres.
          </CardDescription>
        </span>
        <Button variant="outline" size="sm" className="shrink-0" disabled={enCours} onClick={() => rafraichir()}>
          <RefreshCw className={`size-3.5 ${enCours ? "animate-spin" : ""}`} />
          {enCours ? "Lecture…" : "Relire"}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {erreur ? (
          <p className="text-sm text-destructive">
            Impossible de lire ce qu'il a appris ({erreur}). Ce n'est pas « rien appris » : on
            ne sait simplement pas.
          </p>
        ) : stats === null ? (
          <p className="text-sm text-muted-foreground">Lecture…</p>
        ) : rienDuTout ? (
          <p className="text-sm text-muted-foreground">
            Rien à apprendre pour l'instant : aucune de ces notifications n'est encore partie.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {CANAUX_AJUSTABLES.map((canal) => {
              const s = stats[canal]
              if (!s || s.envoyees === 0) return null
              return (
                <li key={canal} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{NOMS_CANAUX[canal] ?? canal}</span>
                    {peuSuivi(s) && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Jarvis le dit moins fort
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{ligneEngagement(s)}</p>
                </li>
              )
            })}
          </ul>
        )}

        {!rienDuTout && stats !== null && (
          <ConfirmerAction
            titre="Remettre à zéro ce que Jarvis a appris ?"
            description="Il oubliera ce qu'il a observé sur ces canaux et recommencera à apprendre depuis rien. Tes réglages de notifications, eux, ne changent pas."
            libelleConfirmation="Remettre à zéro"
            destructif={false}
            onConfirmer={surRemiseAZero}
            trigger={
              <Button variant="ghost" size="sm" className="w-fit" disabled={remiseEnCours}>
                <RotateCcw className="size-4" />
                Remettre à zéro
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  )
}
