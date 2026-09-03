import { TextToSpeech, type SpeechSynthesisVoice } from "@capacitor-community/text-to-speech"
import { Capacitor } from "@capacitor/core"
import { useCallback, useRef, useState } from "react"
import { errorMessage } from "@/lib/errorMessage"
import { readVoicePrefs } from "@/lib/voicePrefs"

// Même logique que useSpeechRecognition : la synthèse vocale du navigateur
// (speechSynthesis) fonctionne généralement dans la webview Android, mais
// on passe par le plugin natif dans l'app empaquetée pour plus de fiabilité
// (voix installées garanties, pas de dépendance à l'implémentation webview).
const isNative = Capacitor.isNativePlatform()

// La langue de lecture suit la voix choisie. La forcer à "fr-FR" quand
// l'utilisateur a sélectionné une voix d'une autre langue faisait échouer la
// lecture sans un mot d'explication (bouton "Tester" muet dans Paramètres).
const LANGUE_PAR_DEFAUT = "fr-FR"

/** Voix de l'appareil, mises en cache : on en a besoin à chaque lecture pour
 * connaître la langue de la voix choisie, et la liste ne change pas. */
let voixEnCache: SpeechSynthesisVoice[] | null = null

export type { SpeechSynthesisVoice }

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false)
  /** Dernier échec de lecture, pour que l'interface puisse le dire. */
  const [erreur, setErreur] = useState<string | null>(null)
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
   *
   * `voiceIndex` : index dans la liste renvoyée par getVoices(), pour
   * utiliser la voix choisie par l'utilisateur dans Paramètres plutôt que
   * la voix par défaut du système.
   */
  const speak = useCallback(
    async (text: string, voiceIndex?: number, forcer = false) => {
      if (!isSupported) return

      const prefs = readVoicePrefs()
      // Voix coupée : on ne dit rien, mais l'appelant continue normalement —
      // la réponse reste affichée à l'écran. `forcer` sert au bouton
      // « Tester » des Paramètres, qui doit pouvoir faire entendre la voix
      // même quand elle est coupée.
      if (prefs.muted && !forcer) return
      const index = voiceIndex ?? prefs.voiceIndex ?? undefined
      const voix = index === undefined ? undefined : voixEnCache?.[index]

      setErreur(null)
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
          TextToSpeech.speak({
            text,
            // La langue de la voix choisie prime : sinon Android refuse de lire.
            lang: voix?.lang ?? LANGUE_PAR_DEFAUT,
            rate: prefs.rate,
            pitch: prefs.pitch,
            volume: 1,
            voice: index,
          })
            // Sans ce catch, un échec de lecture ne se voyait nulle part.
            .catch((e) => setErreur(errorMessage(e)))
            .finally(finish)
          return
        }

        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        const voixWeb = index === undefined ? undefined : window.speechSynthesis.getVoices()[index]
        utterance.lang = voixWeb?.lang ?? LANGUE_PAR_DEFAUT
        utterance.rate = prefs.rate
        utterance.pitch = prefs.pitch
        if (voixWeb) utterance.voice = voixWeb
        utterance.onstart = () => setSpeaking(true)
        utterance.onend = finish
        utterance.onerror = (e) => {
          setErreur(e.error || "La lecture a échoué.")
          finish()
        }
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

  /** Liste des voix disponibles sur l'appareil (même API des deux côtés). */
  const getVoices = useCallback(async (): Promise<SpeechSynthesisVoice[]> => {
    if (!isSupported) return []
    if (isNative) {
      const { voices } = await TextToSpeech.getSupportedVoices()
      voixEnCache = voices
      return voices
    }
    // Le navigateur charge parfois la liste des voix de façon asynchrone :
    // si elle est vide au premier appel, on attend l'événement dédié.
    const existing = window.speechSynthesis.getVoices()
    if (existing.length > 0) {
      voixEnCache = existing
      return existing
    }
    return new Promise((resolve) => {
      window.speechSynthesis.onvoiceschanged = () => {
        voixEnCache = window.speechSynthesis.getVoices()
        resolve(voixEnCache)
      }
    })
  }, [isSupported])

  return { speak, stop, speaking, erreur, isSupported, getVoices }
}
