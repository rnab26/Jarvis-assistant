import { useState } from "react"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireModeLive, lireModeLive } from "@/lib/livePrefs"
import { REGLAGES_RESTAURES } from "@/lib/reglages"

/**
 * Le mode conversation Live, réglable depuis Paramètres.
 *
 * Il ne se réglait que par une petite case sous le cœur, dans l'écran
 * principal. Conforme à la moitié de la règle du chantier permanent (la clé
 * était bien déclarée et recopiée en base), inutilisable pour l'autre :
 * personne ne va chercher un réglage ailleurs que dans Paramètres, et une
 * préférence qu'on ne trouve pas est une préférence figée.
 *
 * La case sous le cœur reste : elle sert à basculer d'une piste à l'autre en
 * pleine séance d'essai, sans quitter l'écran. Les deux écrivent la même clé
 * par la même fonction (`src/lib/livePrefs.ts`), donc il n'y a qu'un seul
 * état — pas deux réglages qui se contrediraient.
 */
export function ModeLive() {
  const [actif, setActif] = useState(lireModeLive)

  useRelireApresRestauration(() => setActif(lireModeLive()))

  function basculer(valeur: boolean) {
    setActif(valeur)
    ecrireModeLive(valeur)
    // Le micro garde le mode dans son propre état React : sans ce signal, il
    // continuerait sur l'ancien mode jusqu'au prochain lancement de l'app, et
    // l'interrupteur aurait l'air de ne rien commander. C'est exactement le
    // signal que tous les réglages écoutent déjà pour se relire.
    window.dispatchEvent(new Event(REGLAGES_RESTAURES))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mode conversation Live (essai)</CardTitle>
        <CardDescription>
          Deux façons de parler à Jarvis, et on mesure laquelle tient. Sans ce mode, le téléphone
          transcrit ta phrase puis l'envoie. Avec, l'audio part en continu chez Google, qui gère
          lui-même la fin de tour, l'interruption et la transcription — plus fluide en principe,
          encore en essai en pratique.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Interrupteur
          titre="Mode conversation Live"
          description={
            actif
              ? "Le cœur ouvre une conversation continue. Dis « terminé » ou « au revoir » pour la fermer."
              : "Le micro classique : tu appuies, tu parles, Jarvis répond."
          }
          actif={actif}
          onChange={basculer}
        />
      </CardContent>
    </Card>
  )
}
