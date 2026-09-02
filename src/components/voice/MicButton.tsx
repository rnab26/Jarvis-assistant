import { Loader2, Mic, Volume2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis"
import { supabase } from "@/lib/supabase"
import {
  executeVoiceAction,
  type DevItemsApi,
  type DocumentsApi,
  type TasksApi,
  type VoiceAction,
  type WidgetApi,
} from "@/lib/voiceActions"

type Status = "idle" | "wake-listening" | "listening" | "processing" | "speaking" | "error"

interface MicButtonProps {
  tasksApi: TasksApi
  devItemsApi: DevItemsApi
  documentsApi: DocumentsApi
  widgetApi: WidgetApi
  wakeWordEnabled: boolean
  voiceIndex: number | null
}

function containsWakeWord(transcript: string) {
  const normalized = transcript
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  return normalized.includes("jarvis")
}

export function MicButton({
  tasksApi,
  devItemsApi,
  documentsApi,
  widgetApi,
  wakeWordEnabled,
  voiceIndex,
}: MicButtonProps) {
  const { listen, stop: stopListening, isSupported, ready: micReady } = useSpeechRecognition()
  const { speak, stop: stopSpeaking } = useSpeechSynthesis()
  const [status, setStatus] = useState<Status>("idle")
  const [lastUserText, setLastUserText] = useState<string | null>(null)
  const [lastReply, setLastReply] = useState<string | null>(null)
  // Un tap pendant que Jarvis parle (barge-in) relance l'écoute lui-même ;
  // ce flag évite que le await speak(...) interrompu, une fois débloqué,
  // ne relance À SON TOUR une écoute en double (deux listen() concurrents).
  const bargeInRef = useRef(false)
  const statusRef = useRef<Status>("idle")
  statusRef.current = status

  /** Envoie un transcript à la Edge Function et exécute l'action renvoyée. */
  async function resolveTranscript(transcript: string): Promise<VoiceAction> {
    const { data, error } = await supabase.functions.invoke<{ action: VoiceAction }>(
      "voice-command",
      {
        body: {
          transcript,
          categories: tasksApi.categories.map((c) => ({ id: c.id, name: c.name })),
          tasks: tasksApi.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            category_id: t.category_id,
            status: t.status,
            due_date: t.due_date,
          })),
          devItems: devItemsApi.devItems.map((i) => ({
            id: i.id,
            title: i.title,
            status: i.status,
            priority: i.priority,
          })),
          documents: documentsApi.documents.map((d) => ({ name: d.name })),
          widgetConfig: widgetApi.config,
          todayISO: new Date().toISOString().slice(0, 10),
        },
      },
    )

    if (error || !data) {
      throw new Error(error?.message ?? "Réponse vide du serveur vocal.")
    }
    return data.action
  }

  /**
   * Traite une commande vocale ; si l'action est "clarify", parle la
   * question puis réécoute automatiquement la réponse (en donnant à Claude
   * le contexte de la demande initiale) plutôt que de forcer l'utilisateur
   * à réappuyer sur le micro et tout redire.
   */
  async function runTurn(transcript: string, originalTranscript = transcript, round = 0) {
    setStatus("processing")
    const action = await resolveTranscript(transcript)

    if (action.action === "clarify" && round < 3) {
      setLastReply(action.message)
      setStatus("speaking")
      bargeInRef.current = false
      await speak(action.message, voiceIndex ?? undefined)
      if (bargeInRef.current) return // un tap a déjà repris la main entre-temps

      setStatus("listening")
      const answer = await listen()
      setLastUserText(answer)
      const combined = `Demande initiale : "${originalTranscript}". Question posée : "${action.message}". Réponse de l'utilisateur : "${answer}".`
      await runTurn(combined, originalTranscript, round + 1)
      return
    }

    const reply = await executeVoiceAction(action, tasksApi, devItemsApi, documentsApi, widgetApi)
    setLastReply(reply)
    setStatus("speaking")
    bargeInRef.current = false
    await speak(reply, voiceIndex ?? undefined)
    if (bargeInRef.current) return
    setStatus("idle")
  }

  async function startListening() {
    try {
      setStatus("listening")
      const transcript = await listen()
      setLastUserText(transcript)
      await runTurn(transcript)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue."
      setLastReply(message)
      setStatus("error")
    }
  }

  async function handleClick() {
    // Interruption ("barge-in") : si Jarvis est en train de parler, un tap
    // coupe la voix et relance directement l'écoute, sans devoir attendre
    // la fin de la phrase.
    if (status === "speaking") {
      bargeInRef.current = true
      stopSpeaking()
      await startListening()
      return
    }

    // Un tap pendant l'écoute passive du mot-clé interrompt cette écoute et
    // enchaîne directement sur une écoute de commande normale.
    if (status === "wake-listening") {
      stopListening()
      await startListening()
      return
    }

    if (status !== "idle" && status !== "error") return
    await startListening()
  }

  /**
   * Écoute passive du mot-clé "Jarvis" tant que l'app est ouverte (pas de
   * service en arrière-plan — désactivé par défaut, à activer dans
   * Paramètres). Redémarre une écoute courte en boucle quand l'app est
   * inactive (status "idle"), s'arrête dès qu'une interaction (manuelle ou
   * déclenchée par le mot-clé) est en cours.
   */
  useEffect(() => {
    if (!wakeWordEnabled) return
    let cancelled = false

    async function wakeLoop() {
      while (!cancelled) {
        if (statusRef.current !== "idle") {
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
        setStatus("wake-listening")
        try {
          const transcript = await listen()
          if (cancelled) return
          if (containsWakeWord(transcript)) {
            const rest = transcript.replace(/jarvis/i, "").trim()
            if (rest.length > 3) {
              setLastUserText(rest)
              setStatus("idle")
              await runTurn(rest)
            } else {
              await startListening()
            }
          } else {
            setStatus("idle")
          }
        } catch {
          // Silence, erreur de reconnaissance, etc. : on relance simplement.
          if (!cancelled) setStatus("idle")
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }

    wakeLoop()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeWordEnabled])

  // Ouverture avec ?mic=1 (ex: depuis un widget ou le bouton latéral
  // réassigné, Phase 3) : lance directement l'écoute sans avoir à taper
  // sur le bouton.
  const [searchParams, setSearchParams] = useSearchParams()
  const autoStarted = useRef(false)
  useEffect(() => {
    if (searchParams.get("mic") === "1" && !autoStarted.current) {
      autoStarted.current = true
      setSearchParams({}, { replace: true })
      handleClick()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (!isSupported) {
    return (
      <p className="text-sm text-muted-foreground">
        Le micro n'est pas supporté par ce navigateur (utilise Chrome sur Android).
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="icon"
        variant={status === "error" ? "destructive" : "default"}
        className="size-14 rounded-full"
        onClick={handleClick}
        disabled={status === "listening" || status === "processing"}
        aria-label={status === "speaking" ? "Interrompre Jarvis" : "Commande vocale"}
      >
        {status === "listening" || status === "processing" ? (
          <Loader2 className="size-6 animate-spin" />
        ) : status === "speaking" ? (
          <Volume2 className="size-6" />
        ) : (
          <Mic className="size-6" />
        )}
      </Button>
      {status === "listening" && (
        <p className="text-sm text-muted-foreground">
          {micReady ? "Je t'écoute..." : "Préparation du micro..."}
        </p>
      )}
      {status === "wake-listening" && (
        <p className="text-xs text-muted-foreground">En écoute du mot-clé "Jarvis"...</p>
      )}
      {(lastUserText || lastReply) && (
        <div className="max-w-xs text-center text-sm">
          {lastUserText && <p className="text-muted-foreground">Toi : {lastUserText}</p>}
          {lastReply && <p>Jarvis : {lastReply}</p>}
        </div>
      )}
    </div>
  )
}
