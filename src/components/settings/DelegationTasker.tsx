import { useCallback, useEffect, useState } from "react"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CLE_DELEGATION_TASKER,
  NOM_TACHE_TASKER,
  NOM_VARIABLE_CIBLE_TASKER,
  delegationVoulue,
  etatDelegationTasker,
  phraseDelegationTasker,
  situationDelegationTasker,
  type EtatDelegationTasker,
} from "@/lib/delegationTasker"
import { ecrireReglage } from "@/lib/reglages"

/**
 * Déléguer le clic à Tasker + AutoInput (chantier d9ffb735).
 *
 * L'état vient du SYSTÈME, jamais du réglage seul : Tasker ou AutoInput
 * peuvent être désinstallés sans que Jarvis en soit prévenu, même piège déjà
 * corrigé pour la bulle et le service d'accessibilité (BulleFlottante.tsx,
 * ControleEcran.tsx).
 *
 * LA RECETTE TASKER EST DE LA CONFIGURATION MANUELLE, PAS DU CODE. Créer une
 * tâche dans l'app Tasker n'a pas de chemin technique : c'est un geste que
 * seul Raphaël peut faire, une fois, dans Tasker lui-même — comme accorder un
 * accès spécial d'Android. Les champs exacts (« AutoInput Action », « Text »,
 * « Action ») viennent de la documentation officielle d'AutoInput
 * (joaoapps.com/autoinput/faq/), pas devinés.
 */
export function DelegationTasker() {
  const [etat, setEtat] = useState<EtatDelegationTasker | null>(null)
  const [disponible, setDisponible] = useState(true)
  const [voulue, setVoulue] = useState(() => delegationVoulue())

  const relire = useCallback(async () => {
    try {
      setEtat(await etatDelegationTasker())
      setDisponible(true)
    } catch {
      setDisponible(false)
    }
  }, [])

  useEffect(() => {
    void relire()
    // Tasker et AutoInput s'installent hors de l'app : sans cette relecture
    // au retour, la carte dirait encore « pas installé » juste après.
    const auRetour = () => {
      if (document.visibilityState === "visible") void relire()
    }
    document.addEventListener("visibilitychange", auRetour)
    return () => document.removeEventListener("visibilitychange", auRetour)
  }, [relire])

  const situation = situationDelegationTasker(disponible, etat, voulue)

  function basculer(actif: boolean) {
    setVoulue(actif)
    ecrireReglage(CLE_DELEGATION_TASKER, actif ? "1" : "0")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Déléguer le clic à Tasker + AutoInput</CardTitle>
        <CardDescription>
          Sur les écrans qui changent pendant qu'ils se chargent (formulaires, boutons dont
          l'identifiant se régénère), Tasker et son greffon AutoInput retrouvent l'élément par son
          texte au moment même du clic, plutôt qu'à l'avance. Jarvis décide toujours quoi faire ;
          Tasker n'exécute que le geste.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Interrupteur
          titre="Passer par Tasker pour cliquer"
          actif={voulue}
          onChange={basculer}
          disabled={situation === "non_installe" || situation === "hors_app"}
        />
        <p className="text-xs text-muted-foreground">{phraseDelegationTasker(situation, etat)}</p>

        {situation !== "hors_app" && situation !== "non_installe" && (
          <div className="space-y-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              À faire une fois, dans l'app Tasker (pas ici) :
            </p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Ouvre Tasker, onglet <strong>Tasks</strong>, appuie sur « + » et nomme la tâche
                exactement <code className="rounded bg-background px-1">{NOM_TACHE_TASKER}</code>{" "}
                (respecte les majuscules : Jarvis ne déclenche que ce nom précis).
              </li>
              <li>
                Ajoute une action « + » → <strong>Plugin</strong> →{" "}
                <strong>AutoInput</strong> → <strong>AutoInput Action</strong>.
              </li>
              <li>
                Dans cette action : champ « Field Type » sur « Text », champ « Text » sur{" "}
                <code className="rounded bg-background px-1">{NOM_VARIABLE_CIBLE_TASKER}</code>
                , champ « Action » sur « Click ».
              </li>
              <li>
                Dans Tasker, Menu → <strong>Preferences</strong> → <strong>Misc</strong>, coche{" "}
                « Allow External Access ».
              </li>
            </ol>
            <p>
              Jarvis envoie le texte à cliquer dans cette variable à chaque tentative ; si Tasker
              ne répond pas dans les huit secondes, ou que la tâche n'existe pas encore, il revient
              tout seul à son propre service — rien ne casse en attendant que la tâche soit créée.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
