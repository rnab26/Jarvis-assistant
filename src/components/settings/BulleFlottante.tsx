import { useCallback, useEffect, useState } from "react"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Bulle,
  CLE_BULLE,
  bulleVoulue,
  phraseBulle,
  situationBulle,
  type EtatBulle,
} from "@/lib/bulleFlottante"
import { ecrireReglage } from "@/lib/reglages"

/**
 * L'interrupteur de la bulle flottante.
 *
 * Il commande le SERVICE, et il affiche l'état RÉEL : l'autorisation peut
 * avoir été retirée depuis Android, et la bulle rangée d'un appui long sans
 * passer par ici. Un interrupteur qui affiche seulement ce que le réglage
 * prétend redirait « Activé » au-dessus d'un écran vide.
 *
 * Il n'y a PAS d'interrupteur pour l'appui long à côté, et ce n'est pas un
 * oubli : c'est un rôle Android qu'une application ne peut ni s'attribuer ni
 * se retirer (vérifié dans AOSP, roles.xml : `requestable="false"`). Sa
 * carte, juste au-dessus, lit l'état réel et ouvre l'écran système.
 */
export function BulleFlottante() {
  const [etat, setEtat] = useState<EtatBulle | null>(null)
  const [disponible, setDisponible] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [voulue, setVoulue] = useState(() => bulleVoulue())

  const relire = useCallback(async () => {
    try {
      setEtat(await Bulle.etat())
      setDisponible(true)
    } catch {
      // Hors de l'app, ou APK antérieure à ce plugin : ce n'est pas une
      // panne, et ça ne se dit pas comme une panne.
      setDisponible(false)
    }
  }, [])

  useEffect(() => {
    void relire()
    // L'autorisation se donne dans un écran d'Android, donc hors de l'app :
    // sans cette relecture au retour, la carte afficherait encore « refusée »
    // juste après qu'il l'a accordée.
    const auRetour = () => {
      if (document.visibilityState === "visible") void relire()
    }
    document.addEventListener("visibilitychange", auRetour)
    return () => document.removeEventListener("visibilitychange", auRetour)
  }, [relire])

  const situation = situationBulle(disponible, etat)

  const basculer = async (actif: boolean) => {
    setErreur(null)
    setVoulue(actif)
    ecrireReglage(CLE_BULLE, actif ? "1" : "0")
    try {
      if (actif) await Bulle.demarrer()
      else await Bulle.arreter()
    } catch (e) {
      const message = e instanceof Error ? e.message : ""
      setErreur(
        message.includes("AUTORISATION_MANQUANTE")
          ? "Android n'autorise pas encore Jarvis à s'afficher par-dessus les autres applications."
          : "La bulle n'a pas pu démarrer.",
      )
    }
    await relire()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>La bulle Jarvis, par-dessus tout</CardTitle>
        <CardDescription>
          Une pastille posée sur l'écran, atteignable depuis n'importe quelle application. Elle
          n'écoute rien tant que tu ne l'as pas touchée.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Interrupteur
          titre="Afficher la bulle"
          actif={voulue && situation === "affichee"}
          onChange={basculer}
          disabled={situation === "hors_app"}
        />

        <p className="text-xs text-muted-foreground">{phraseBulle(situation)}</p>

        {situation === "sans_autorisation" && (
          <Button size="sm" variant="outline" onClick={() => void Bulle.demanderAutorisation()}>
            Ouvrir les réglages d'Android
          </Button>
        )}

        {erreur && <p className="text-xs text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  )
}
