import { Download } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { useSpeechSynthesis, type SpeechSynthesisVoice } from "@/hooks/useSpeechSynthesis"
import { useUpdateCheck } from "@/hooks/useUpdateCheck"

const APK_DOWNLOAD_URL =
  "https://github.com/rnab26/Jarvis-assistant/releases/download/latest-debug/app-debug.apk"

/** Les notes archivées finissent par "Commit <hash>." — même logique que
 * DevItemCard, pour rendre le hash cliquable vers GitHub. */
function renderNotes(notes: string) {
  const match = notes.match(/^(.*commit )([0-9a-f]{7,40})(\.?)$/i)
  if (!match) return notes
  const [, prefix, hash, suffix] = match
  return (
    <>
      {prefix}
      <a
        href={`https://github.com/rnab26/Jarvis-assistant/commit/${hash}`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {hash}
      </a>
      {suffix}
    </>
  )
}

const UPDATE_STATUS_LABEL = {
  checking: "Vérification...",
  "up-to-date": "À jour",
  "update-available": "Nouvelle version disponible",
  unknown: "Impossible de vérifier",
} as const

export function SettingsPage() {
  const { wakeWordState, devItemsState, voiceState } = useJarvisData()
  const { status } = useUpdateCheck()
  const { getVoices, speak } = useSpeechSynthesis()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    getVoices().then(setVoices)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Voix françaises en premier (les plus utiles ici), le reste ensuite —
  // en gardant l'index d'origine (celui attendu par speak()/TTSOptions.voice).
  const sortedVoices = voices
    .map((voice, index) => ({ voice, index }))
    .sort((a, b) => {
      const aFr = a.voice.lang.toLowerCase().startsWith("fr") ? 0 : 1
      const bFr = b.voice.lang.toLowerCase().startsWith("fr") ? 0 : 1
      return aFr - bFr
    })

  const recentChanges = devItemsState.devItems
    .filter((item) => item.archived_at)
    .sort((a, b) => (b.archived_at! < a.archived_at! ? -1 : 1))
    .slice(0, 5)

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
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={APK_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              <Download className="size-4" />
              Télécharger la dernière version
            </a>
          </Button>
          <Badge variant={status === "update-available" ? "destructive" : "outline"}>
            {UPDATE_STATUS_LABEL[status]}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nouveautés</CardTitle>
          <CardDescription>Derniers chantiers terminés (depuis le cockpit).</CardDescription>
        </CardHeader>
        <CardContent>
          {recentChanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien à afficher pour l'instant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentChanges.map((item) => (
                <li key={item.id} className="text-sm">
                  <p className="font-medium">{item.title}</p>
                  {item.notes && (
                    <p className="text-muted-foreground">{renderNotes(item.notes)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voix de Jarvis</CardTitle>
          <CardDescription>
            Choisis parmi les voix déjà installées sur l'appareil (gratuit, hors-ligne).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select
            value={voiceState.voiceIndex === null ? "default" : String(voiceState.voiceIndex)}
            onValueChange={(v) => voiceState.setVoiceIndex(v === "default" ? null : Number(v))}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Voix par défaut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Voix par défaut</SelectItem>
              {sortedVoices.map(({ voice, index }) => (
                <SelectItem key={index} value={String(index)}>
                  {voice.name} ({voice.lang})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() =>
              speak("Bonjour, voici un exemple de ma voix.", voiceState.voiceIndex ?? undefined)
            }
          >
            Tester
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
