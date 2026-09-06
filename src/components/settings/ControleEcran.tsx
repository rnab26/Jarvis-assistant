import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { Trash2, Plus, RotateCcw } from "lucide-react"
import {
  CLE_LISTE_NOIRE,
  LISTE_NOIRE_DOFFICE,
  entreeDepuisLaVoix,
  lireReglagesListeNoire,
  type EntreeListeNoire,
  type ReglagesListeNoire,
} from "@/lib/listeNoire"
import {
  agirSurEcran,
  etatAccessibilite,
  ouvrirReglagesAccessibilite,
  type EtatAccessibilite,
} from "@/lib/controleEcran"
import { ecrireReglage } from "@/lib/reglages"

/**
 * « Appuyer sur l'écran à ta place » : l'état réel du service, et la liste
 * des applications où Jarvis n'a pas le droit de le faire.
 *
 * L'état vient du SYSTÈME, jamais du réglage — Android peut couper un service
 * d'accessibilité sans que l'application en sache rien, et il n'y a pas de
 * bouton pour l'accorder : c'est un accès spécial, comme « afficher par-dessus
 * les autres applications ». Même motif que la bulle et les autorisations.
 *
 * Et un mot est dit ici une fois, en toutes lettres, parce qu'il est vrai : la
 * liste noire est appliquée par NOTRE code. Elle empêche Jarvis d'AGIR, mais
 * le service garde techniquement la visibilité sur l'écran. Aucune application
 * ne peut se restreindre elle-même là-dessus.
 */
export function ControleEcran() {
  const [etat, setEtat] = useState<EtatAccessibilite | null>(null)
  const [chargement, setChargement] = useState(true)
  const [reglages, setReglages] = useState<ReglagesListeNoire>(() =>
    lireReglagesListeNoire(localStorage.getItem(CLE_LISTE_NOIRE)),
  )
  const [ajout, setAjout] = useState("")
  const [essai, setEssai] = useState<string | null>(null)

  const relire = useCallback(async () => {
    setEtat(await etatAccessibilite())
    setChargement(false)
  }, [])

  useEffect(() => {
    void relire()
    // L'accès se donne dans un écran d'Android, donc hors de l'app : sans
    // cette relecture au retour, la carte dirait encore « pas activé » juste
    // après qu'il vient de l'activer.
    const auRetour = () => {
      if (document.visibilityState === "visible") void relire()
    }
    document.addEventListener("visibilitychange", auRetour)
    return () => document.removeEventListener("visibilitychange", auRetour)
  }, [relire])

  function enregistrer(suivant: ReglagesListeNoire) {
    setReglages(suivant)
    ecrireReglage(CLE_LISTE_NOIRE, JSON.stringify(suivant))
  }

  const retires = new Set(reglages.retraits.map((m) => m.toLowerCase()))
  const dOffice = LISTE_NOIRE_DOFFICE.filter((e) => !retires.has(e.motif.toLowerCase()))
  const remisEnJeu = LISTE_NOIRE_DOFFICE.filter((e) => retires.has(e.motif.toLowerCase()))

  function retirerDOffice(entree: EntreeListeNoire) {
    enregistrer({ ...reglages, retraits: [...reglages.retraits, entree.motif] })
  }

  function remettreDOffice(entree: EntreeListeNoire) {
    enregistrer({
      ...reglages,
      retraits: reglages.retraits.filter((m) => m.toLowerCase() !== entree.motif.toLowerCase()),
    })
  }

  function supprimerAjout(entree: EntreeListeNoire) {
    enregistrer({
      ...reglages,
      ajouts: reglages.ajouts.filter((e) => e.motif !== entree.motif),
    })
  }

  function ajouter() {
    const entree = entreeDepuisLaVoix(ajout)
    if (!entree) return
    const deja = [...dOffice, ...reglages.ajouts].some(
      (e) => e.motif.toLowerCase() === entree.motif.toLowerCase(),
    )
    if (!deja) enregistrer({ ...reglages, ajouts: [...reglages.ajouts, entree] })
    setAjout("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appuyer sur l'écran à ta place</CardTitle>
        <CardDescription>
          Pour que « lance la deuxième vidéo », « descends » ou « appuie sur envoyer » marchent
          pendant que tu es dans une autre application. Jarvis ne lit l'écran qu'au moment où tu
          lui demandes quelque chose.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {chargement ? (
          <p className="text-xs text-muted-foreground">Je regarde où ça en est…</p>
        ) : etat?.actif ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Activé. Jarvis peut appuyer sur l'écran quand tu le lui demandes.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {etat?.declare
                ? "Autorisé dans Android, mais le service n'est pas encore relié. Rouvre l'app, ou désactive puis réactive Jarvis dans les réglages d'accessibilité."
                : "Pas encore activé. C'est un accès spécial d'Android : aucun bouton de Jarvis ne peut te l'accorder, il faut le faire une fois dans les réglages du téléphone — Accessibilité, puis Jarvis, puis Activer."}
            </p>
            <Button size="sm" variant="outline" onClick={() => void ouvrirReglagesAccessibilite()}>
              Ouvrir les réglages d'accessibilité
            </Button>
          </div>
        )}

        {etat?.actif && (
          <div className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => setEssai(await agirSurEcran("lire"))}
            >
              Voir ce que Jarvis lit sur cet écran
            </Button>
            {essai && <p className="text-xs text-muted-foreground">{essai}</p>}
          </div>
        )}

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Là où je n'appuie jamais</p>
          <p className="text-xs text-muted-foreground">
            Tout est autorisé par défaut, sauf ces applications-là. Tu peux en ajouter à la voix :
            « n'appuie jamais dans Bitwarden ».
          </p>

          <ul className="space-y-1">
            {[...dOffice, ...reglages.ajouts].map((entree) => {
              const propre = reglages.ajouts.some((a) => a.motif === entree.motif)
              return (
                <li
                  key={`${propre ? "a" : "o"}-${entree.motif}`}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1"
                >
                  <span className="truncate text-xs">{entree.libelle}</span>
                  <ConfirmerAction
                    trigger={
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    }
                    titre={`Laisser Jarvis appuyer dans ${entree.libelle} ?`}
                    description="Il pourra alors cliquer sur les boutons de cette application quand tu le lui demandes à la voix. Tu peux la remettre dans la liste à tout moment."
                    libelleConfirmation="Retirer de la liste"
                    onConfirmer={() =>
                      propre ? supprimerAjout(entree) : retirerDOffice(entree)
                    }
                  />
                </li>
              )
            })}
          </ul>

          <div className="flex gap-2">
            <Input
              value={ajout}
              onChange={(e) => setAjout(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ajouter()
              }}
              placeholder="Ajouter une application"
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" onClick={ajouter} disabled={ajout.trim().length < 2}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {remisEnJeu.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs text-muted-foreground">
                Retirées de la liste d'origine — appuie pour les y remettre :
              </p>
              <div className="flex flex-wrap gap-1">
                {remisEnJeu.map((entree) => (
                  <Button
                    key={entree.motif}
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => remettreDOffice(entree)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {entree.libelle}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            À savoir, une fois : cette liste est appliquée par le code de Jarvis, et elle l'empêche
            vraiment d'agir dans ces applications. Mais le service d'accessibilité d'Android, lui,
            garde techniquement la visibilité sur l'écran — aucune application ne peut se
            restreindre elle-même là-dessus.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
