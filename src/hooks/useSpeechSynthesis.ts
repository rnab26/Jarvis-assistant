import { TextToSpeech } from "@capacitor-community/text-to-speech"
import { Capacitor } from "@capacitor/core"
import { useCallback, useState } from "react"

// Même logique que useSpeechRecognition : la synthèse vocale du navigateur
// (speechSynthesis) fonctionne généralement dans la webview Android, mais
// on passe par le plugin natif dans l'app empaquetée pour plus de fiabilité
// (voix installées garanties, pas de dépendance à l'implémentation webview).
const isNative = Capacitor.isNativePlatform()

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false)
  const isSupported = isNative || "speechSynthesis" in window

  const speak = useCallback(
    async (text: string) => {
      if (!isSupported) return

      if (isNative) {
        setSpeaking(true)
        try {
          await TextToSpeech.speak({ text, lang: "fr-FR", rate: 1, pitch: 1, volume: 1 })
        } finally {
          setSpeaking(false)
        }
        return
      }

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = "fr-FR"
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(utterance)
    },
    [isSupported],
  )

  return { speak, speaking, isSupported }
}
