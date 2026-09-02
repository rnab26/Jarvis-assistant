import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const APK_DOWNLOAD_URL =
  "https://github.com/rnab26/Jarvis-assistant/releases/download/latest-debug/app-debug.apk"

export function SettingsPage() {
  return (
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
  )
}
