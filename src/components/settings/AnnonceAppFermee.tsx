import { useCallback, useEffect, useState } from "react"
import { Interrupteur } from "@/components/settings/Interrupteur"
import {
  AnnonceNative,
  annonceAppFermeeVoulue,
  ecrireAnnonceAppFermeeVoulue,
  type EtatAnnonceNative,
} from "@/lib/annonceAppFermee"

/**
 * L'interrupteur du service qui parle même app fermée (chantier 23ee3735).
 *
 * Même principe que BulleFlottante.tsx : il commande le SERVICE et affiche
 * l'état RÉEL, jamais seulement ce que le réglage prétend — Android peut
 * l'avoir arrêté pour économiser la batterie sans que l'app le sache.
 */
export function AnnonceAppFermee() {
  const [etat, setEtat] = useState<EtatAnnonceNative | null>(null)
  const [disponible, setDisponible] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [voulue, setVoulue] = useState(() => annonceAppFermeeVoulue())

  const relire = useCallback(async () => {
    try {
      setEtat(await AnnonceNative.etat())
      setDisponible(true)
    } catch {
      // Hors de l'app, ou APK antérieure à ce plugin.
      setDisponible(false)
    }
  }, [])

  useEffect(() => {
    void relire()
  }, [relire])

  const basculer = async (actif: boolean) => {
    setErreur(null)
    setVoulue(actif)
    ecrireAnnonceAppFermeeVoulue(actif)
    try {
      if (actif) await AnnonceNative.demarrer()
      else await AnnonceNative.arreter()
    } catch {
      setErreur("Le service n'a pas pu " + (actif ? "démarrer" : "s'arrêter") + ".")
    }
    await relire()
  }

  if (!disponible) return null

  return (
    <div className="border-t pt-3">
      <Interrupteur
        titre="Parler même app fermée"
        description="Une notification permanente « Jarvis » reste dans la barre d'état — c'est le prix à payer pour qu'Android ne coupe pas le service. Respecte les mêmes règles que ci-dessus (heures de silence, voix coupée)."
        actif={voulue && etat?.active === true}
        onChange={basculer}
      />
      {voulue && etat?.active === false && (
        <p className="mt-1 text-xs text-muted-foreground">
          Le service ne tourne pas en ce moment — réessaie d'activer l'interrupteur.
        </p>
      )}
      {erreur && <p className="mt-1 text-xs text-destructive">{erreur}</p>}
    </div>
  )
}
