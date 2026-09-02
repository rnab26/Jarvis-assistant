import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useJarvisData } from "@/contexts/JarvisDataContext"

const APK_DOWNLOAD_URL =
  "https://github.com/rnab26/Jarvis-assistant/releases/download/latest-debug/app-debug.apk"

export function SettingsPage() {
  const { wakeWordState } = useJarvisData()

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Mettre à jour l'application</CardTitle>
          <CardDescription>
            Ce lien pointe toujours vers le dernier APK construit automatiquement à chaque mise à
            jour de Jarvis — pas besoin de naviguer dans GitHub Actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href={APK_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              <Download className="size-4" />
              Télécharger la dernière version
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mot-clé de réveil "Jarvis"</CardTitle>
          <CardDescription>
            Une fois activé, dis "Jarvis" pour démarrer une commande sans toucher le bouton
            micro — tant que l'app est ouverte à l'écran (pas en arrière-plan, écran éteint).
            Consomme plus de batterie/données que l'usage normal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant={wakeWordState.enabled ? "default" : "outline"}
            onClick={() => wakeWordState.setEnabled(!wakeWordState.enabled)}
          >
            {wakeWordState.enabled ? "Activé" : "Désactivé"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
