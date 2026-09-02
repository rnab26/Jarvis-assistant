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
  // "ready" distingue la phase de démarrage du moteur natif (encore sourd
  // aux premiers mots) de l'écoute effective. Corrige le bug où le premier
  // clic sur le micro ratait le début de la phrase : l'UI passait en
  // "écoute" avant même que le moteur natif ait fini de démarrer, donc
  // l'utilisateur parlait trop tôt.
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported = isNative || getSpeechRecognitionCtor() !== null

  // Filet de sécurité si l'événement "stopped" ne vient jamais (device/plugin
  // qui reste bloqué en écoute) — pas un vrai minuteur de silence.
  const NATIVE_MAX_LISTEN_MS = 20000

  const listenNative = useCallback(async (): Promise<string> => {
    setError(null)
    setReady(false)
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

    // partialResults:true (plutôt que le simple maxResults:1 d'avant) active
    // aussi côté plugin le "DICTATION_MODE" natif d'Android, dont la
    // tolérance au silence est bien plus longue que le mode commande
    // classique — c'est ce qui coupait la phrase trop tôt en cours de
    // dictée. On accumule les résultats (partiels puis final) via
    // l'événement "partialResults", et on attend l'événement "stopped" de
    // "listeningState" (fin de parole détectée par Android) pour résoudre.
    let latestTranscript = ""
    let safetyTimer: ReturnType<typeof setTimeout> | null = null
    let resolveStopped: (() => void) | undefined

    const partialResultsHandle = await NativeSpeechRecognition.addListener(
      "partialResults",
      ({ matches }) => {
        if (matches?.[0]) latestTranscript = matches[0]
      },
    )
    const listeningStateHandle = await NativeSpeechRecognition.addListener(
      "listeningState",
      ({ status }) => {
        setReady(status === "started")
        if (status === "stopped") resolveStopped?.()
      },
    )

    try {
      const stopped = new Promise<void>((resolve) => {
        resolveStopped = resolve
        safetyTimer = setTimeout(() => {
          NativeSpeechRecognition.stop().catch(() => {})
          resolve()
        }, NATIVE_MAX_LISTEN_MS)
      })

      await NativeSpeechRecognition.start({
        language: "fr-FR",
        maxResults: 1,
        partialResults: true,
        popup: false,
      })
      await stopped
      // Petite marge : le résultat final (post-traitement Android) arrive
      // parfois juste après l'événement "stopped".
      await new Promise((r) => setTimeout(r, 300))

      const transcript = latestTranscript.trim()
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
      if (safetyTimer) clearTimeout(safetyTimer)
      setListening(false)
      setReady(false)
      await partialResultsHandle.remove()
      await listeningStateHandle.remove()
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
      setReady(false)

      recognition.onstart = () => setReady(true)

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
        setReady(false)
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

  return {
    listen: isNative ? listenNative : listenWeb,
    stop,
    listening,
    ready,
    error,
    isSupported,
  }
}
