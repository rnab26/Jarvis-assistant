import { useState } from "react"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useVeilleMoteur } from "@/hooks/useVeilleMoteur"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import {
  LIBELLE_VERDICT,
  type MoteurChoisi,
  type PasseVeille,
  ecrireVeille,
  etatDeLaVeille,
  lireVeille,
} from "@/lib/veilleMoteur"

/**
 * Le moteur de langue de Jarvis : lequel répond, et faut-il le laisser changer.
 *
 * Chantier 66a7a233. Sa demande du 5 sept. 2026 : « s'il y a des mises à jour
 * qui sont faites pour quelque chose de plus évolué, évidemment qu'il faut que
 * nous aussi on fasse les mises à jour automatiques en interne sans que
 * forcément je puisse le demander à chaque fois manuellement. »
 *
 * DEUX CHOSES SONT ICI, ET IL FAUT LES DEUX, exactement comme pour les
 * sessions autonomes. L'interrupteur, parce que ce mécanisme change tout seul
 * le modèle qui lui répond : il doit pouvoir le geler d'un geste, sans nous. Et
 * la trace des passes, parce que sans elle « il n'y avait rien de neuf » et
 * « la veille ne tourne plus depuis trois jours » se ressemblent parfaitement.
 *
 * CE QUE CETTE CARTE NE PROPOSE PAS, ET CE N'EST PAS UN OUBLI : choisir le
 * modèle à la main. Un nom de modèle tapé ici serait une valeur qu'on ne peut
 * pas vérifier — `ListModels` n'est pas une autorisation, et les trois modèles
 * de Jarvis sont morts le même jour le 4 sept. en figurant encore dans la
 * liste. Le choix manuel passe donc par un secret côté serveur, qui l'emporte
 * sur la veille, et qui suppose de savoir ce qu'on fait.
 *
 * Sa limite du même soir, respectée : « il ne faut pas changer les voix tout
 * seul, sinon ça peut tout déglinguer d'un coup. » Ceci ne concerne QUE le
 * modèle de langue ; la reconnaissance vocale et la voix de synthèse ne
 * changent jamais toutes seules.
 */

/** Injectable, pour que le banc d'essai parcoure la vraie carte sans Supabase. */
export interface VeilleApi {
  passes: PasseVeille[]
  choix: MoteurChoisi | null
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
 * la base n'existe pas dans le banc d'essai. La carte branchée n'est montée
 * que quand personne ne lui fournit ses données.
 */
export function MoteurDeLangue({ api }: { api?: VeilleApi }) {
  return api ? <Carte api={api} /> : <CarteBranchee />
}

function CarteBranchee() {
  const { passes, choix, loading, error } = useVeilleMoteur()
  return <Carte api={{ passes, choix, loading, error }} />
}

function Carte({ api }: { api: VeilleApi }) {
  const { passes, choix, loading, error } = api
  const [actif, setActif] = useState(lireVeille)
  const [tout, setTout] = useState(false)

  useRelireApresRestauration(() => setActif(lireVeille()))

  function basculer(valeur: boolean) {
    setActif(valeur)
    ecrireVeille(valeur)
  }

  const etat = etatDeLaVeille(passes, choix, actif, new Date())
  const visibles = tout ? passes : passes.slice(0, 3)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Le moteur de langue</CardTitle>
        <CardDescription>
          Chaque jour, Jarvis essaie pour de vrai les modèles qui viennent de sortir, et adopte le
          meilleur — mais seulement après l'avoir vu réussir deux jours différents, et il revient
          tout seul en arrière si le nouveau se comporte mal. Rien de ce que tu as réglé ne vit
          dans le modèle : changer de modèle ne te fait rien perdre.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Interrupteur
          titre="Suivre les nouveaux modèles"
          description="Éteint, Jarvis garde le modèle actuel quoi qu'il arrive."
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
            Impossible de lire les passes : {error}. Ça ne dit rien de la veille elle-même —
            seulement qu'on n'arrive pas à la consulter d'ici.
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
                  <span className="text-muted-foreground">
                    {LIBELLE_VERDICT[p.verdict] ?? p.verdict}
                  </span>
                </div>
                {p.detail && <p className="text-muted-foreground">{p.detail}</p>}
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
          Un modèle n'est jamais adopté sur la foi d'une liste : il est essayé pour de vrai, sur
          nos propres phrases, avec une clé de test qui ne touche pas à ton quota. Et jamais un
          moteur payant sans que tu l'aies posé toi-même.
        </p>
      </CardContent>
    </Card>
  )
}
