import { Gauge, RefreshCw, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  libelleRang,
  lignesCommandeTriees,
  plafondDeLaLigne,
  resumerConsommation,
  type LigneConsommation,
} from "@/lib/consommationModele"
import { errorMessage } from "@/lib/errorMessage"
import { debutFenetre } from "@/lib/ouJenSuis"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/**
 * « Savoir combien il me reste de crédit et à combien de temps de discussion
 * ça équivaut. » — sa demande, dictée le 5 sept. 2026.
 *
 * TOUT LE RAISONNEMENT EST AILLEURS, et il faut que ça reste ainsi :
 * `src/lib/consommationModele.ts` est pur, il rend déjà la phrase à afficher,
 * l'alerte et l'état vide, et il est gardé par 26 contrôles hors ligne. Cette
 * carte n'a pas le droit de recalculer quoi que ce soit — elle affiche.
 *
 * TROIS CHOSES QU'ELLE NE FAIT PAS, chacune pour une raison mesurée :
 *
 * 1. AUCUN SOLDE, AUCUN POURCENTAGE. L'offre Gemini est gratuite : il n'y a
 *    pas d'argent, et les plafonds ne se lisent que dans le corps d'un 429 —
 *    donc une fois dépassés. Un pourcentage inventé se lirait comme une
 *    mesure. Le module rend la phrase honnête dans `marge`, et elle dit ce
 *    qu'on sait vraiment (« au moins 100 phrases passent dans une journée,
 *    mesuré, et tu en es à 40 »).
 * 2. AUCUNE ALERTE SUR LES REFUS PAR MINUTE. C'est le fonctionnement normal
 *    quand il enchaîne vite, ça se lève en soixante secondes, et un bandeau
 *    qui s'allume tous les jours n'est plus lu. Le module met déjà `alerte` à
 *    null dans ce cas ; on affiche le chiffre, sans le peindre en rouge.
 * 3. ELLE NE DEVINE PAS si Jarvis tourne sur un secours en comparant des noms
 *    de modèles : le principal se règle par le secret `GEMINI_MODELE`, que
 *    l'app ne peut pas lire. Le RANG vient du serveur, et c'est lui qui fait
 *    foi.
 */

/** Ce dont la carte a besoin. Injecté, comme `NotificationsApi` : le banc
 * d'essai monte ainsi la VRAIE carte sans Supabase, y compris dans l'état où
 * la lecture a échoué. */
export interface ConsommationApi {
  /** null = pas encore lu, ou lecture en échec. */
  lignes: LigneConsommation[] | null
  erreur: string | null
  enCours: boolean
  rafraichir: () => Promise<void>
}

export function useConsommation(): ConsommationApi {
  const [lignes, setLignes] = useState<LigneConsommation[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const rafraichir = useCallback(async () => {
    setEnCours(true)
    try {
      // Depuis MINUIT LOCAL, la même notion que la fenêtre « aujourd'hui » du
      // cockpit : à une heure du matin, le travail de la soirée ne doit pas
      // tomber à zéro. On passe par `debutFenetre` plutôt que de recalculer
      // un minuit ici — deux minuits finiraient par différer.
      const depuis = new Date(debutFenetre("aujourdhui", Date.now())).toISOString()
      const { data, error } = await withTimeout(
        supabase.rpc("etat_consommation", { p_depuis: depuis }),
      )
      if (error) throw error
      setLignes((data ?? []) as LigneConsommation[])
      setErreur(null)
    } catch (e) {
      // Une panne de lecture ne doit pas se lire comme « tu n'as rien
      // consommé » : ce serait le rassurer juste avant un quota vide.
      setLignes(null)
      setErreur(errorMessage(e))
    } finally {
      setEnCours(false)
    }
  }, [])

  useEffect(() => {
    rafraichir()
  }, [rafraichir])

  return { lignes, erreur, enCours, rafraichir }
}

/** « 1,8 M », « 12 400 » — un nombre de jetons se lit d'un coup d'œil ou pas
 * du tout. Sept chiffres collés ne veulent rien dire sur un téléphone. */
function jetonsLisibles(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`
  if (n >= 10_000) return `${Math.round(n / 1000)} k`
  return n.toLocaleString("fr-FR")
}

/** La date ET l'heure exactes d'un refus, jamais juste « aujourd'hui » : c'est
 * précisément ce qui manquait pour savoir si le plafond vu tient encore. */
function dateHeureLisible(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function Consommation({ api }: { api: ConsommationApi }) {
  const { lignes, erreur, enCours, rafraichir } = api
  const resume = lignes === null ? null : resumerConsommation(lignes)

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-start gap-2">
        <span className="min-w-0">
          <CardTitle>
            <Gauge className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
            Ce que Jarvis a consommé aujourd'hui
          </CardTitle>
          <CardDescription>
            Depuis minuit. L'offre Gemini est gratuite : il n'y a pas de solde en argent, seulement
            des plafonds par minute et par jour — et ils ne se lisent qu'une fois touchés.
          </CardDescription>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={enCours}
          onClick={() => rafraichir()}
        >
          <RefreshCw className={`size-3.5 ${enCours ? "animate-spin" : ""}`} />
          {enCours ? "Lecture…" : "Relire"}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {erreur ? (
          <p className="text-sm text-destructive">
            La consommation n'a pas pu être lue ({erreur}). Ce n'est pas « rien consommé » : on ne
            sait simplement pas.
          </p>
        ) : resume === null ? (
          <p className="text-sm text-muted-foreground">Lecture de la journée…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">
                {resume.phrases} phrase{resume.phrases > 1 ? "s" : ""}
              </Badge>
              {resume.jetons > 0 && (
                <Badge variant="outline">{jetonsLisibles(resume.jetons)} de jetons</Badge>
              )}
              {resume.surSecours && <Badge variant="destructive">sur un secours</Badge>}
            </div>

            {/* La phrase du module, telle quelle : c'est elle qui répond à
                « à combien de temps de discussion ça équivaut », et elle ne
                dit que ce qui a été mesuré. */}
            <p className="text-sm">{resume.marge}</p>

            {resume.alerte && (
              <p
                className={`text-sm ${
                  resume.alerte.niveau === "rouge" ? "text-destructive" : "text-foreground"
                }`}
              >
                <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" />
                {resume.alerte.texte}
              </p>
            )}

            {resume.modele && (
              <p className="text-xs text-muted-foreground">
                Modèle qui a répondu : {resume.modele}
                {resume.msMedian !== null &&
                  ` · réponse en ${(resume.msMedian / 1000).toFixed(1).replace(".", ",")} s en moyenne`}
                .
              </p>
            )}

            {/* PAR MODÈLE, pas juste un agrégat : c'est ça qui manquait le
                plus le 17 sept. — savoir LEQUEL des trois (principal, secours
                1, secours 2) est à sec, avec son plafond réel et l'heure
                exacte du dernier refus vu, plutôt qu'un vieux chiffre statique. */}
            {lignes && lignesCommandeTriees(lignes).length > 0 && (
              <div className="flex flex-col gap-2 rounded-md border p-2">
                <p className="text-xs font-medium text-muted-foreground">Détail par modèle</p>
                {lignesCommandeTriees(lignes).map((l) => {
                  const p = plafondDeLaLigne(l)
                  return (
                    <div key={`${l.modele}-${l.rang ?? "inconnu"}`} className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={l.rang === 0 ? "secondary" : "outline"} className="text-[10px]">
                          {libelleRang(l.rang)}
                        </Badge>
                        <span className="text-xs font-mono">{l.modele}</span>
                        {l.refus_jour > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            quota du jour vide
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {l.reussis} réussi{l.reussis > 1 ? "s" : ""} sur {l.appels}
                        {p?.parJour !== undefined &&
                          ` · plafond du jour : ${p.parJour} (${p.frais ? "vu aujourd'hui" : "mesuré, ancien"})`}
                        {p?.parJour === undefined &&
                          p?.parMinute !== undefined &&
                          ` · plafond par minute : ${p.parMinute} (${p.frais ? "vu aujourd'hui" : "mesuré, ancien"})`}
                        {l.dernierQuotaAt &&
                          ` · dernier refus vu le ${dateHeureLisible(l.dernierQuotaAt)}`}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Le chiffre, sans le peindre en rouge : enchaîner vite les
                déclenche, et ça se lève en soixante secondes. */}
            {resume.refusMinute > 0 && (
              <p className="text-xs text-muted-foreground">
                {resume.refusMinute} refus « trop vite » — c'est normal quand tu enchaînes les
                phrases, ça se lève tout seul en une minute.
              </p>
            )}

            {resume.phrases === 0 && resume.jetons === 0 && (
              <p className="text-xs text-muted-foreground">
                Le décompte ne porte que sur aujourd'hui, et il n'existe que depuis que chaque
                appel est enregistré : une journée vide ici ne veut pas dire que Jarvis n'a jamais
                servi.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
