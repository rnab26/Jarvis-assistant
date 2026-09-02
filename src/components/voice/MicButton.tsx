import { Loader2, Mic, Volume2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis"
import { supabase } from "@/lib/supabase"
import { executeVoiceAction, type TasksApi, type VoiceAction } from "@/lib/voiceActions"
import type { Category, Task } from "@/types/database"

type Status = "idle" | "listening" | "processing" | "speaking" | "error"

interface MicButtonProps extends TasksApi {
  tasks: Task[]
  categories: Category[]
}

export function MicButton(props: MicButtonProps) {
  const { listen, isSupported } = useSpeechRecognition()
  const { speak } = useSpeechSynthesis()
  const [status, setStatus] = useState<Status>("idle")
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  async function handleClick() {
    if (status !== "idle" && status !== "error") return

    try {
      setStatus("listening")
      const transcript = await listen()

      setStatus("processing")
      const { data, error } = await supabase.functions.invoke<{ action: VoiceAction }>(
        "voice-command",
        {
          body: {
            transcript,
            categories: props.categories.map((c) => ({ id: c.id, name: c.name })),
            tasks: props.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              category_id: t.category_id,
              status: t.status,
              due_date: t.due_date,
            })),
            todayISO: new Date().toISOString().slice(0, 10),
          },
        },
      )

      if (error || !data) {
        throw new Error(error?.message ?? "Réponse vide du serveur vocal.")
      }

      const reply = await executeVoiceAction(data.action, props)
      setLastMessage(reply)
      setStatus("speaking")
      speak(reply)
      setStatus("idle")
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
