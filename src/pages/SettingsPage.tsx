import { Download } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { useSpeechSynthesis, type SpeechSynthesisVoice } from "@/hooks/useSpeechSynthesis"
import { PITCH_MAX, PITCH_MIN, RATE_MAX, RATE_MIN } from "@/lib/voicePrefs"
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

/** Curseur avec sa valeur lisible : régler une voix se fait à l'oreille,
 * il faut voir où on en est et pouvoir revenir en arrière. */
function ReglageVoix({
  id,
  label,
  min,
  max,
  value,
  onChange,
}: {
  id: string
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{value.toFixed(2)}×</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full accent-primary"
      />
    </div>
  )
}

export function SettingsPage() {
  const { wakeWordState, devItemsState, voiceState, tasksState, widgetState } = useJarvisData()
  const { status } = useUpdateCheck()
  const { getVoices, speak, speaking, erreur } = useSpeechSynthesis()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [toutesLesVoix, setToutesLesVoix] = useState(false)

  useEffect(() => {
    getVoices().then(setVoices)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Android installe des dizaines de voix, souvent la même déclinée par pays.
  // On ne montre par défaut que les langues réellement parlées ici, une seule
  // fois chacune — l'index d'origine est conservé, c'est lui qu'attend speak().
  const voixTriees = voices
    .map((voice, index) => ({ voice, index }))
    .sort((a, b) => {
      const rang = (lang: string) => {
        const l = lang.toLowerCase()
        if (l.startsWith("fr")) return 0
        if (l.startsWith("he") || l.startsWith("iw")) return 1
        if (l.startsWith("en")) return 2
        return 3
      }
      const parLangue = rang(a.voice.lang) - rang(b.voice.lang)
      return parLangue !== 0 ? parLangue : a.voice.name.localeCompare(b.voice.name)
    })

  const dejaVues = new Set<string>()
  const voixCourantes = voixTriees.filter(({ voice }) => {
    const langue = voice.lang.toLowerCase()
    const pertinente =
      langue.startsWith("fr") ||
      langue.startsWith("he") ||
      langue.startsWith("iw") ||
      langue.startsWith("en")
    if (!pertinente) return false
    // Même nom décliné en fr-FR, fr-CA, fr-BE… : une seule entrée suffit.
    const cle = `${voice.name}|${langue.slice(0, 2)}`
    if (dejaVues.has(cle)) return false
    dejaVues.add(cle)
    return true
  })

  const voixAffichees = toutesLesVoix ? voixTriees : voixCourantes
  const masquees = voixTriees.length - voixCourantes.length

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
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Select
              value={voiceState.voiceIndex === null ? "default" : String(voiceState.voiceIndex)}
              onValueChange={(v) => voiceState.setVoiceIndex(v === "default" ? null : Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Voix par défaut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Voix par défaut</SelectItem>
                {voixAffichees.map(({ voice, index }) => (
                  <SelectItem key={index} value={String(index)}>
                    {voice.name} ({voice.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {masquees > 0 && (
              <button
                type="button"
                className="self-start text-xs text-muted-foreground underline underline-offset-4"
                onClick={() => setToutesLesVoix(!toutesLesVoix)}
              >
                {toutesLesVoix
                  ? "Ne montrer que les voix utiles"
                  : `Afficher les ${masquees} autres voix installées`}
              </button>
            )}
          </div>

          <ReglageVoix
            id="voix-vitesse"
            label="Vitesse"
            min={RATE_MIN}
            max={RATE_MAX}
            value={voiceState.rate}
            onChange={voiceState.setRate}
          />
          <ReglageVoix
            id="voix-hauteur"
            label="Intensité"
            min={PITCH_MIN}
            max={PITCH_MAX}
            value={voiceState.pitch}
            onChange={voiceState.setPitch}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={speaking}
              onClick={() =>
                speak(
                  "Bonjour Raphaël, voici comment je sonne avec ces réglages.",
                  voiceState.voiceIndex ?? undefined,
                )
              }
            >
              {speaking ? "Lecture en cours..." : "Tester"}
            </Button>
            <Button variant="ghost" size="sm" onClick={voiceState.resetTon}>
              Réglages d'origine
            </Button>
          </div>
          {erreur && (
            <p className="text-sm text-destructive">
              La lecture a échoué : {erreur}. Essaie une autre voix.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Widget d'écran d'accueil</CardTitle>
          <CardDescription>
            Ce que le widget Android affiche : nombre de tâches, urgentes, et les prochaines à
            faire. Le widget se met à jour dès que tu changes un réglage ici.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Tâches affichées</span>
            <Select
              value={String(widgetState.config.maxTasks)}
              onValueChange={(v) => widgetState.setConfig({ maxTasks: Number(v) })}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Catégorie</span>
            <Select
              value={widgetState.config.categoryId ?? "all"}
              onValueChange={(v) =>
                widgetState.setConfig({ categoryId: v === "all" ? null : v })
              }
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {tasksState.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant={widgetState.config.urgentOnly ? "default" : "outline"}
            className="w-fit"
            onClick={() => widgetState.setConfig({ urgentOnly: !widgetState.config.urgentOnly })}
          >
            {widgetState.config.urgentOnly ? "Urgentes uniquement : activé" : "Urgentes uniquement : désactivé"}
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
