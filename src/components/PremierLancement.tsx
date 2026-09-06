import { Capacitor } from "@capacitor/core"
import { ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"
import { ListeAutorisations, useAutorisations } from "@/components/settings/Autorisations"
import { Button } from "@/components/ui/button"
import { resumeAutorisations } from "@/lib/autorisationsTelephone"

/**
 * Le premier lancement : on demande TOUT d'un coup, une fois, et plus jamais
 * par surprise.
 *
 * Demande de Raphaël, 5 sept. 2026 : « quand on installe l'application, on
 * fait une sélection directement des autorisations ». Avant, chaque
 * autorisation arrivait au milieu d'une phrase, la première fois qu'il
 * essayait la fonction concernée — et une seule fois : refusée, Android ne la
 * redemande plus jamais et rien dans l'app ne le disait.
 *
 * Deux choses à ne pas défaire :
 *
 * 1. La marque « déjà vu » est posée quand il FERME l'écran, pas à
 *    l'affichage. Posée à l'affichage, un démarrage interrompu (il éteint
 *    l'écran, l'app est tuée en arrière-plan) consommerait l'unique
 *    occasion de la lui montrer.
 * 2. L'écran ne s'affiche pas du tout quand il n'y a rien à demander — tout
 *    est déjà accordé, ou on n'est pas dans l'app. Un écran qui ne sert à
 *    rien au premier démarrage apprend surtout à passer sans lire.
 */
const CLE_VUE = "jarvis_autorisations_vues"

function dejaVu(): boolean {
  try {
    return localStorage.getItem(CLE_VUE) === "1"
  } catch {
    // Stockage indisponible : on préfère montrer l'écran une fois de trop
    // que de ne jamais le montrer.
    return false
  }
}

function noterVu() {
  try {
    localStorage.setItem(CLE_VUE, "1")
  } catch {
    // Rien à faire : au pire il le reverra au prochain démarrage.
  }
}

function EcranAutorisations({ onFermer }: { onFermer: () => void }) {
  const a = useAutorisations()
  const [ferme, setFerme] = useState(false)

  const resume = resumeAutorisations(a.etats)
  const rienADemander = !a.chargement && !a.erreur && resume.accordees === resume.total

  // Rien à demander (tout est déjà accordé) ou pas d'app Android : on se
  // retire sans rien afficher, et on note que c'est vu — sinon le calcul
  // repartirait à chaque démarrage.
  useEffect(() => {
    if (a.chargement) return
    if (!a.disponible || rienADemander) {
      noterVu()
      setFerme(true)
      onFermer()
    }
  }, [a.chargement, a.disponible, rienADemander, onFermer])

  if (ferme || a.chargement || !a.disponible || rienADemander) return null

  const terminer = () => {
    noterVu()
    setFerme(true)
    onFermer()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Autorisations du téléphone"
      data-premier-lancement
    >
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <div className="space-y-2">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <ShieldCheck className="size-5 text-primary" aria-hidden />
              Ce que Jarvis a le droit de faire
            </h1>
            <p className="text-sm text-muted-foreground">
              Une seule fois, maintenant, plutôt qu'une demande par surprise à chaque
              fonctionnalité. Tu peux tout accorder d'un geste, ou choisir ligne par ligne — et
              revenir dessus quand tu veux dans Paramètres.
            </p>
          </div>

          <ListeAutorisations
            etats={a.etats}
            chargement={a.chargement}
            erreur={a.erreur}
            disponible={a.disponible}
            enCours={a.enCours}
            onDemander={a.demander}
            onOuvrirReglages={a.ouvrirReglages}
            onReessayer={a.relire}
          />
        </div>
      </div>

      {/* Collé en bas : sur un écran de téléphone la liste dépasse la
          hauteur, et un bouton en fin de page ne se trouve qu'en défilant. */}
      <div className="border-t bg-background px-4 py-3">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Rien n'est copié : Jarvis lit le téléphone au moment où il en a besoin.
          </p>
          <Button onClick={terminer} data-terminer>
            Continuer
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Monté une fois dans la coquille des pages protégées. Ne fait rien du tout
 * hors de l'app Android, ni une fois l'écran vu.
 */
export function PremierLancement() {
  const [aMontrer, setAMontrer] = useState(() => Capacitor.isNativePlatform() && !dejaVu())
  if (!aMontrer) return null
  return <EcranAutorisations onFermer={() => setAMontrer(false)} />
}
