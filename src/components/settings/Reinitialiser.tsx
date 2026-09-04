import { RotateCcw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { CORE_IMAGE_CHANGEE } from "@/components/JarvisCore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CLES_REGLAGES, ecrireReglage, REGLAGES_RESTAURES } from "@/lib/reglages"

/**
 * Remettre tous les réglages à leur valeur d'origine.
 *
 * Ce qui manquait, et qu'on trouve dans n'importe quel écran de réglages :
 * pouvoir DÉFAIRE. Un débit de voix poussé trop loin, un widget mal
 * configuré, une heure de rappel qu'on ne retrouve plus — il n'existait
 * aucun moyen de revenir en arrière autrement qu'en remettant chaque
 * réglage à la main, sans savoir quelle était la valeur de départ.
 *
 * Ce que ça touche est écrit noir sur blanc avant de confirmer : la
 * confusion possible ici est de croire qu'on efface ses données. La
 * réinitialisation ne touche QUE les préférences ; les tâches, chantiers,
 * documents, contacts et souvenirs vivent en base et ne sont pas concernés.
 */
export function Reinitialiser() {
  const [confirmer, setConfirmer] = useState(false)
  const [enCours, setEnCours] = useState(false)

  function remettreParDefaut() {
    setEnCours(true)
    try {
      // ecrireReglage(clé, null) plutôt qu'un localStorage.clear() : on ne
      // touche qu'aux clés déclarées, et chaque effacement est signalé à la
      // synchro, qui vide la copie en base dans la foulée. Un clear() aurait
      // aussi emporté la session Supabase — donc déconnecté Raphaël.
      for (const cle of CLES_REGLAGES) ecrireReglage(cle, null)
      // Les hooks relisent le stockage local, le réacteur reprend son image
      // d'origine : sans ces deux signaux, l'écran continuerait d'afficher
      // les anciennes valeurs jusqu'au prochain lancement.
      window.dispatchEvent(new Event(REGLAGES_RESTAURES))
      window.dispatchEvent(new Event(CORE_IMAGE_CHANGEE))
      setConfirmer(false)
      toast.success("Réglages remis par défaut.", {
        description: "Tes tâches, chantiers, documents et contacts n'ont pas été touchés.",
      })
    } catch {
      toast.error("La réinitialisation a échoué.")
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Remettre les réglages par défaut</CardTitle>
        <CardDescription>
          Repart de la configuration d'origine si quelque chose a été réglé de travers.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        {confirmer ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div>
              <p className="font-medium">Ce qui repart à zéro :</p>
              <p className="text-muted-foreground">
                la voix et son débit, le rythme de la discussion, le mot-clé de réveil, le widget,
                les rappels de lieu, le thème, l'image du cœur, les applications par défaut, les
                notifications et la mise à jour automatique.
              </p>
            </div>
            <div>
              <p className="font-medium">Ce qui n'est pas touché :</p>
              <p className="text-muted-foreground">
                tes tâches, tes chantiers, tes documents, tes contacts, tes souvenirs, ton compte
                Google et tes corrections de prononciation.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={enCours}
                onClick={remettreParDefaut}
              >
                Confirmer la remise à zéro
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmer(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirmer(true)}>
            <RotateCcw className="size-4" />
            Remettre les réglages par défaut
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
