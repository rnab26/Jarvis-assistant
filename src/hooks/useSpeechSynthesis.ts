import { TextToSpeech } from "@capacitor-community/text-to-speech"
import { Capacitor } from "@capacitor/core"
import { useCallback, useRef, useState } from "react"

// Même logique que useSpeechRecognition : la synthèse vocale du navigateur
// (speechSynthesis) fonctionne généralement dans la webview Android, mais
// on passe par le plugin natif dans l'app empaquetée pour plus de fiabilité
// (voix installées garanties, pas de dépendance à l'implémentation webview).
const isNative = Capacitor.isNativePlatform()

// Vitesse de lecture par défaut : un peu plus rapide que le rythme "normal"
// (1.0), pour un rendu moins lent à l'usage répété — reste raisonnable pour
// rester compréhensible.
const SPEECH_RATE = 1.15

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false)
  const isSupported = isNative || "speechSynthesis" in window
  // Permet à stop() de débloquer un speak() en cours : sur Android natif,
  // TextToSpeech.stop() n'a pas toujours la garantie de déclencher le
  // callback de fin (onDone/onError) de l'utterance interrompue — sans ce
  // filet, un stop() pendant la lecture laisserait le "await speak(...)"
  // de l'appelant bloqué indéfiniment.
  const pendingStopRef = useRef<(() => void) | null>(null)

  /**
   * Attend la fin réelle de la lecture (côté web comme natif) avant de
   * résoudre — important : sans ça, l'appelant croit Jarvis silencieux et
   * relance l'écoute (ou repasse en idle) alors que l'audio joue encore,
   * ce qui fait parler Jarvis "par-dessus" une nouvelle écoute ou une
   * interaction de l'utilisateur.
   */
  const speak = useCallback(
    async (text: string) => {
      if (!isSupported) return

      await new Promise<void>((resolve) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          setSpeaking(false)
          pendingStopRef.current = null
          resolve()
        }
        pendingStopRef.current = finish

        if (isNative) {
          setSpeaking(true)
          TextToSpeech.speak({ text, lang: "fr-FR", rate: SPEECH_RATE, pitch: 1, volume: 1 }).finally(
            finish,
          )
          return
        }

        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = "fr-FR"
        utterance.rate = SPEECH_RATE
        utterance.onstart = () => setSpeaking(true)
        utterance.onend = finish
        utterance.onerror = finish
        window.speechSynthesis.speak(utterance)
      })
    },
    [isSupported],
  )

  /** Coupe la voix en cours (interruption / "barge-in"). */
  const stop = useCallback(() => {
    if (isNative) {
      TextToSpeech.stop()
    } else {
      window.speechSynthesis.cancel()
    }
    setSpeaking(false)
    pendingStopRef.current?.()
  }, [])

  return { speak, stop, speaking, isSupported }
}
