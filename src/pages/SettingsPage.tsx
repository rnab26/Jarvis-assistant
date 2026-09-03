import { Capacitor } from "@capacitor/core"
import { Download, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { JarvisCore, CORE_IMAGE_CHANGEE, type CoreEtat } from "@/components/JarvisCore"
import { detourerCore, ecrireCoreImage, lireCoreImage } from "@/lib/coreImage"
import { Geofence } from "@/lib/geofencePlugin"
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

const isNative = Capacitor.isNativePlatform()

/** Active/désactive le déclenchement des rappels de lieu par
 * géolocalisation réelle (Geofencing Android) — demande les permissions
 * la première fois, y compris l'écran "tout le temps" séparé requis à
 * partir d'Android 10. */
function RappelsGeolocalises() {
  const [enAttente, setEnAttente] = useState(false)
  const [arrierePlanOk, setArrierePlanOk] = useState<boolean | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const { geofenceState } = useJarvisData()

  useEffect(() => {
    if (!isNative || !geofenceState.enabled) return
    Geofence.hasBackgroundPermission()
      .then((r) => setArrierePlanOk(r.granted))
      .catch(() => setArrierePlanOk(null))
  }, [geofenceState.enabled])

  async function activer() {
    setErreur(null)
    if (!isNative) {
      geofenceState.setEnabled(true)
      return
    }
    setEnAttente(true)
    try {
      const { granted, backgroundGranted } = await Geofence.requestLocationPermissions()
      if (!granted) {
        setErreur("Localisation refusée. Autorise-la dans les paramètres de l'app pour activer cette option.")
        return
      }
      geofenceState.setEnabled(true)
      setArrierePlanOk(backgroundGranted)
    } catch {
      setErreur("La demande de permission a échoué.")
    } finally {
      setEnAttente(false)
    }
  }

  function desactiver() {
    geofenceState.setEnabled(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rappels de lieu : géolocalisation réelle</CardTitle>
        <CardDescription>
          En plus du déclenchement par la conversation (toujours actif), Jarvis peut te prévenir
          automatiquement en arrivant près d'un lieu enregistré — même sans lui parler. Utilise
          l'API Geofencing d'Android (pas de suivi GPS continu, la plus économe en batterie pour
          ça), mais consomme quand même plus que sans. Désactivé par défaut.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          variant={geofenceState.enabled ? "default" : "outline"}
          disabled={enAttente}
          onClick={geofenceState.enabled ? desactiver : activer}
          className="w-fit"
        >
          {geofenceState.enabled ? "Activé" : "Désactivé"}
        </Button>

        {geofenceState.enabled && arrierePlanOk === false && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p>
              Il manque l'autorisation "Tout le temps" — sans elle, les rappels ne se déclenchent
              que pendant que l'app est ouverte à l'écran, comme avant.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => Geofence.openLocationSettings()}
            >
              Ouvrir les réglages de localisation
            </Button>
          </div>
        )}
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  )
}

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

const ETATS_APERCU: { etat: CoreEtat; label: string }[] = [
  { etat: "idle", label: "Au repos" },
  { etat: "listening", label: "Il écoute" },
  { etat: "processing", label: "Il réfléchit" },
  { etat: "speaking", label: "Il parle" },
]

/** Personnalisation du réacteur : import d'une image, détourage automatique,
 * et aperçu de la façon dont il réagit selon ce que fait Jarvis. */
function CoeurDeJarvis() {
  const fichierRef = useRef<HTMLInputElement>(null)
  const [personnalisee, setPersonnalisee] = useState(() => lireCoreImage() !== null)
  const [apercu, setApercu] = useState<CoreEtat>("idle")
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function prevenirLApp() {
    window.dispatchEvent(new Event(CORE_IMAGE_CHANGEE))
  }

  async function importer(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setErreur(null)
    setOccupe(true)
    try {
      const dataUrl = await detourerCore(file)
      ecrireCoreImage(dataUrl)
      setPersonnalisee(true)
      prevenirLApp()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Le détourage a échoué.")
    } finally {
      setOccupe(false)
    }
  }

  function reinitialiser() {
    ecrireCoreImage(null)
    setPersonnalisee(false)
    setErreur(null)
    prevenirLApp()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Le cœur de Jarvis</CardTitle>
        <CardDescription>
          Le réacteur affiché sous le micro. Il bat en permanence, s'emballe quand Jarvis
          écoute, envoie des ondes quand il parle et tourne pendant qu'il réfléchit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <JarvisCore etat={apercu} taille={128} />

        <div className="flex flex-wrap justify-center gap-1.5">
          {ETATS_APERCU.map(({ etat, label }) => (
            <Button
              key={etat}
              size="sm"
              variant={apercu === etat ? "default" : "outline"}
              onClick={() => setApercu(etat)}
            >
              {label}
            </Button>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Tu peux mettre ton propre réacteur : le fond noir autour du disque est retiré
          automatiquement, il n'y a rien à découper avant.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" disabled={occupe} onClick={() => fichierRef.current?.click()}>
            {occupe ? "Détourage..." : "Importer une image"}
          </Button>
          {personnalisee && (
            <Button variant="ghost" size="sm" onClick={reinitialiser}>
              Revenir à l'originale
            </Button>
          )}
          <input ref={fichierRef} type="file" accept="image/*" hidden onChange={importer} />
        </div>

        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { wakeWordState, devItemsState, voiceState, tasksState, widgetState, placeRemindersState } =
    useJarvisData()
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

      <CoeurDeJarvis />

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
          <CardTitle>Rappels liés à un lieu</CardTitle>
          <CardDescription>
            Dis à Jarvis "retiens que quand je parle de [lieu], rappelle-moi [ceci]" — la
            prochaine fois que tu mentionnes ce lieu en lui parlant, il te le rappellera dans sa
            réponse. Déclenché par la conversation par défaut ; active la géolocalisation
            ci-dessous pour un déclenchement automatique en plus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {placeRemindersState.placeReminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun rappel de lieu pour l'instant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {placeRemindersState.placeReminders.map((p) => (
                <li key={p.id} className="flex items-start gap-2 rounded-lg border p-3">
                  <div className="flex-1">
                    <p className="font-medium">{p.place}</p>
                    <p className="text-sm text-muted-foreground">{p.reminder}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Supprimer"
                    onClick={() => placeRemindersState.deletePlaceReminder(p.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RappelsGeolocalises />

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
