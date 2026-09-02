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
      // continuous=true : évite que la reconnaissance se coupe dès la
      // première petite pause dans la phrase. On accumule les résultats
      // finaux et on résout seulement quand le navigateur arrête vraiment
      // d'écouter (silence prolongé, ou stop() appelé manuellement).
      recognition.continuous = true
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      let finalTranscript = ""

      setError(null)
      setListening(true)

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += `${event.results[i][0].transcript} `
          }
        }
      }

      recognition.onerror = (event) => {
        // "no-speech" en continu arrive souvent après un premier résultat
        // valide (silence final avant coupure) : on l'ignore si on a déjà
        // du texte, sinon c'est une vraie erreur.
        if (event.error === "no-speech" && finalTranscript.trim()) return
        const message = friendlyErrorMessage(event.error)
        setError(message)
        reject(new Error(message))
      }

      recognition.onend = () => {
        setListening(false)
        recognitionRef.current = null
        if (finalTranscript.trim()) {
          resolve(finalTranscript.trim())
        }
      }

      recognition.start()
    })
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  return { listen, stop, listening, error, isSupported }
}
