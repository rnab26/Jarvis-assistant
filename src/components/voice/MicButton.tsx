import { Loader2, Mic, Volume2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis"
import { supabase } from "@/lib/supabase"
import {
  executeVoiceAction,
  type DevItemsApi,
  type TasksApi,
  type VoiceAction,
} from "@/lib/voiceActions"

type Status = "idle" | "listening" | "processing" | "speaking" | "error"

interface MicButtonProps {
  tasksApi: TasksApi
  devItemsApi: DevItemsApi
}

export function MicButton({ tasksApi, devItemsApi }: MicButtonProps) {
  const { listen, isSupported } = useSpeechRecognition()
  const { speak } = useSpeechSynthesis()
  const [status, setStatus] = useState<Status>("idle")
  const [lastMessage, setLastMessage] = useState<string | null>(null)

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
      setLastMessage(action.message)
      setStatus("speaking")
      speak(action.message)

      setStatus("listening")
      const answer = await listen()
      const combined = `Demande initiale : "${originalTranscript}". Question posée : "${action.message}". Réponse de l'utilisateur : "${answer}".`
      await runTurn(combined, originalTranscript, round + 1)
      return
    }

    const reply = await executeVoiceAction(action, tasksApi, devItemsApi)
    setLastMessage(reply)
    setStatus("speaking")
    speak(reply)
    setStatus("idle")
  }

  async function handleClick() {
    if (status !== "idle" && status !== "error") return

    try {
      setStatus("listening")
      const transcript = await listen()
      await runTurn(transcript)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue."
      setLastMessage(message)
      setStatus("error")
    }
  }

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
        aria-label="Commande vocale"
      >
        {status === "listening" || status === "processing" ? (
          <Loader2 className="size-6 animate-spin" />
        ) : status === "speaking" ? (
          <Volume2 className="size-6" />
        ) : (
          <Mic className="size-6" />
        )}
      </Button>
      {lastMessage && <p className="max-w-xs text-center text-sm text-muted-foreground">{lastMessage}</p>}
    </div>
  )
}
