import { useState } from "react"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"
import { usePassesAutonomes } from "@/hooks/usePassesAutonomes"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireAutonomie, lireAutonomie } from "@/lib/autonomiePrefs"
import { etatDesPasses, LIBELLE_VERDICT, type PasseAutonome } from "@/lib/passeAutonome"

/**
 * Ce qui avance pendant ses absences — et le bouton pour tout arrêter.
 *
 * Chantier 59d8587f. Sa demande dictée : « Tout les chantiers ne nécessitant
 * pas l'action de traiter des chantiers disponibles a travailler doivent etres
 * travailler seul afin de gagner du temps en developpement sur les temps mort
 * de ma présence ». Sa réponse quand la question lui a été posée : « Oui en
 * continue même la journee. Éviter de lancer une session si une autre en est
 * deja en cours ».
 *
 * DEUX CHOSES SONT ICI, ET IL FAUT LES DEUX. L'interrupteur, parce que ça
 * dépense son crédit et que du code part pendant qu'il dort : il doit pouvoir
 * tout arrêter d'un geste, sans nous. Et la trace des passes, parce que sans
 * elle « il n'y avait rien à faire cette nuit » et « le déclencheur ne tourne
 * plus depuis trois jours » se ressemblent parfaitement.
 */

/** Injectable, pour que le banc d'essai parcoure la vraie carte sans Supabase. */
export interface PassesApi {
  passes: PasseAutonome[]
  loading: boolean
  error: string | null
}

const TON: Record<string, string> = {
  ok: "border-primary/40 bg-primary/5",
  alerte: "border-destructive/50 bg-destructive/5",
  eteint: "border-muted bg-muted/40",
  jamais: "border-muted bg-muted/40",
}

/**
 * Deux composants et pas un seul : un hook ne se saute pas selon une prop, et
 * `useAuth` n'existe pas dans le banc d'essai. La carte branchée sur la base
 * n'est montée que quand personne ne lui fournit ses données.
 */
export function SessionsAutonomes({ api }: { api?: PassesApi }) {
  return api ? <Carte api={api} /> : <CarteBranchee />
}

function CarteBranchee() {
  const { session } = useAuth()
  const { passes, loading, error } = usePassesAutonomes(session?.user.id)
  return <Carte api={{ passes, loading, error }} />
}

function Carte({ api }: { api: PassesApi }) {
  const { passes, loading, error } = api
  const [actif, setActif] = useState(lireAutonomie)
  const [tout, setTout] = useState(false)

  useRelireApresRestauration(() => setActif(lireAutonomie()))

  function basculer(valeur: boolean) {
    setActif(valeur)
    ecrireAutonomie(valeur)
  }

  const etat = etatDesPasses(passes, actif, new Date())
  const visibles = tout ? passes : passes.slice(0, 3)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions autonomes</CardTitle>
        <CardDescription>
          Une session s'ouvre toute seule chaque heure et prend un chantier marqué « libre ». Elle
          se retire aussitôt si une autre session travaille déjà, s'il n'y a rien à prendre, ou si
          tu éteins ici.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Interrupteur
          titre="Travailler sans moi"
          description="Éteint, plus aucune session ne démarrera d'elle-même."
          actif={actif}
          onChange={basculer}
        />

        <div className={`rounded-lg border p-3 ${TON[etat.ton] ?? ""}`}>
          <p className="text-sm font-medium">{etat.titre}</p>
          <p className="text-xs text-muted-foreground">{etat.detail}</p>
        </div>

        {loading && <p className="text-xs text-muted-foreground">Lecture des dernières passes…</p>}

        {error && (
          <p className="text-xs text-destructive">
            Impossible de lire les passes : {error}. Ça ne dit rien de l'autonomie elle-même —
            seulement qu'on n'arrive pas à la consulter d'ici.
          </p>
        )}

        {!loading && !error && passes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Aucune passe enregistrée pour l'instant.
          </p>
        )}

        {visibles.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {visibles.map((p) => (
              <li key={p.id} className="rounded-md border px-2.5 py-2 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {new Date(p.demarre_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-muted-foreground">{LIBELLE_VERDICT[p.verdict]}</span>
                </div>
                <p className="text-muted-foreground">{p.resume ?? p.raison}</p>
              </li>
            ))}
          </ul>
        )}

        {passes.length > 3 && (
          <button
            type="button"
            onClick={() => setTout((v) => !v)}
            className="self-start text-xs underline text-muted-foreground"
          >
            {tout ? "Ne montrer que les trois dernières" : `Voir les ${passes.length} dernières`}
          </button>
        )}

        <p className="text-xs text-muted-foreground">
          La cadence, elle, ne se règle pas ici : c'est un déclencheur horaire, visible dans tes
          Routines sur claude.ai. Une session autonome ne prend jamais un chantier « à cadrer », ni
          un sujet que tu as mis à part (contrôle du téléphone, envoi de messages, clonage vocal,
          dépense).
        </p>
      </CardContent>
    </Card>
  )
}
