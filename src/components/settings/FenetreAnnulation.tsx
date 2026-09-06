import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CLE_DELAI_ANNULATION,
  DELAIS_ANNULATION,
  delaiAnnulation,
  libelleDelai,
} from "@/lib/actionsTelephoneFenetre"
import { ecrireReglage, REGLAGES_RESTAURES } from "@/lib/reglages"

/**
 * Combien de temps Jarvis laisse pour l'arrêter avant d'agir dans une autre
 * application.
 *
 * Ce n'est pas une confirmation, et il ne faut pas le présenter comme telle :
 * Raphaël a explicitement écarté toute question bloquante le 5 sept. 2026
 * (« il doit faire tout ce que je demande sans limite »). Le décompte fini,
 * l'action part toute seule. « Immédiat » est là, en un appui, et c'est
 * volontaire : le garde-fou existe pour les commandes MAL ENTENDUES, pas
 * pour celles qu'il a données.
 */
export function FenetreAnnulation() {
  const [ms, setMs] = useState(() => delaiAnnulation())

  // Les réglages venus de la base sont appliqués après le montage : sans
  // cette relecture, l'écran afficherait encore la valeur de cet appareil.
  useEffect(() => {
    const relire = () => setMs(delaiAnnulation())
    window.addEventListener(REGLAGES_RESTAURES, relire)
    return () => window.removeEventListener(REGLAGES_RESTAURES, relire)
  }, [])

  const changer = (valeur: string) => {
    const nombre = Number(valeur)
    setMs(nombre)
    ecrireReglage(CLE_DELAI_ANNULATION, String(nombre))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Le temps de l'arrêter</CardTitle>
        <CardDescription>
          Avant d'ouvrir une application, d'appeler quelqu'un ou de préparer un message, Jarvis
          annonce ce qu'il fait et laisse quelques secondes pour l'annuler. Il ne demande rien :
          passé ce délai, il y va.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="delai-annulation">Délai avant d'agir</Label>
        <Select value={String(ms)} onValueChange={changer}>
          <SelectTrigger id="delai-annulation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELAIS_ANNULATION.map((valeur) => (
              <SelectItem key={valeur} value={String(valeur)}>
                {libelleDelai(valeur)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {ms === 0
            ? "Jarvis agit tout de suite, sans rien annoncer."
            : "Le 5 septembre, quatre commandes mal entendues ont ouvert des applications au hasard : c'est ce que ce délai permet d'arrêter."}
        </p>
      </CardContent>
    </Card>
  )
}
