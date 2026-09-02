import { SpeechRecognition as NativeSpeechRecognition } from "@capacitor-community/speech-recognition"
import { Capacitor } from "@capacitor/core"
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

// Dans l'app Android empaquetée (Capacitor), la webview native ne supporte
// pas l'API Web Speech (SpeechRecognition) — on passe alors par le plugin
// natif @capacitor-community/speech-recognition, qui utilise directement le
// service de reconnaissance vocale d'Android. Dans un navigateur normal
// (Chrome mobile, où le micro a déjà été validé), on garde l'API Web,
// inchangée.
const isNative = Capacitor.isNativePlatform()

export function useSpeechRecognition() {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported = isNative || getSpeechRecognitionCtor() !== null

  const listenNative = useCallback(async (): Promise<string> => {
    setError(null)
    const { available } = await NativeSpeechRecognition.available()
    if (!available) {
      const message = "Reconnaissance vocale indisponible sur cet appareil."
      setError(message)
      throw new Error(message)
    }

    const permission = await NativeSpeechRecognition.requestPermissions()
    if (permission.speechRecognition !== "granted") {
      const message = "Micro refusé. Autorise l'accès au micro dans les paramètres de l'app."
      setError(message)
      throw new Error(message)
    }

    setListening(true)
    try {
      const result = await NativeSpeechRecognition.start({
        language: "fr-FR",
        maxResults: 1,
        partialResults: false,
        popup: false,
      })
      const transcript = result.matches?.[0]
      if (!transcript) {
        const message = "Je n'ai rien entendu, réessaie."
        setError(message)
        throw new Error(message)
      }
      return transcript
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de reconnaissance vocale."
      setError(message)
      throw new Error(message)
    } finally {
      setListening(false)
    }
  }, [])

  const listenWeb = useCallback((): Promise<string> => {
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
    if (isNative) {
      NativeSpeechRecognition.stop()
    } else {
      recognitionRef.current?.stop()
    }
  }, [])

  return { listen: isNative ? listenNative : listenWeb, stop, listening, error, isSupported }
}
