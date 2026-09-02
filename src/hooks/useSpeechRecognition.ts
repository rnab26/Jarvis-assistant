import { useCallback, useRef, useState } from "react"

type SpeechRecognitionCtor = new () => SpeechRecognition

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function friendlyErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Micro refusé. Autorise l'accès au micro dans les paramètres du navigateur."
    case "no-speech":
      return "Je n'ai rien entendu, réessaie."
    case "audio-capture":
      return "Aucun micro détecté sur cet appareil."
    case "network":
      return "Problème réseau pendant l'écoute, réessaie."
    default:
      return `Erreur de reconnaissance vocale : ${code}`
  }
}

export function useSpeechRecognition() {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported = getSpeechRecognitionCtor() !== null

  const listen = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) {
        const message =
          "La reconnaissance vocale n'est pas supportée par ce navigateur (utilise Chrome sur Android)."
        setError(message)
        reject(new Error(message))
        return
      }

      const recognition = new Ctor()
      recognitionRef.current = recognition
      recognition.lang = "fr-FR"
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      setError(null)
      setListening(true)

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        resolve(transcript)
      }

      recognition.onerror = (event) => {
        const message = friendlyErrorMessage(event.error)
        setError(message)
        reject(new Error(message))
      }

      recognition.onend = () => {
        setListening(false)
        recognitionRef.current = null
      }

      recognition.start()
    })
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  return { listen, stop, listening, error, isSupported }
}
