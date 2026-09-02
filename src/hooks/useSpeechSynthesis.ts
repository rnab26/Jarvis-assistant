import { useCallback, useState } from "react"

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false)
  const isSupported = "speechSynthesis" in window

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) return
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
