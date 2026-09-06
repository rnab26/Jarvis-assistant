import { useCallback, useState } from "react"
import {
  arreterParler,
  parler,
  synthesePriseEnCharge,
  voixDisponibles,
  type SpeechSynthesisVoice,
} from "@/lib/parler"

// Le moteur lui-même vit dans src/lib/parler.ts (chantier f44c6673) : ce hook
// n'est plus qu'une façade React qui expose l'état `speaking`/`erreur` à
// l'écran. Ne réimplémente pas la synthèse ici — src/lib/actionsTelephoneVocales.ts
// appelle le même moteur pour parler en dehors d'un composant.

export type { SpeechSynthesisVoice }

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false)
  /** Dernier échec de lecture, pour que l'interface puisse le dire. */
  const [erreur, setErreur] = useState<string | null>(null)
  const isSupported = synthesePriseEnCharge()

  /**
   * `voiceIndex` : index dans la liste renvoyée par getVoices(), pour
   * utiliser la voix choisie par l'utilisateur dans Paramètres plutôt que
   * la voix par défaut du système.
   */
  const speak = useCallback(async (text: string, voiceIndex?: number, forcer = false) => {
    setErreur(null)
    await parler(text, { voiceIndex, forcer, onSpeakingChange: setSpeaking, onErreur: setErreur })
  }, [])

  /** Coupe la voix en cours (interruption / "barge-in"). */
  const stop = useCallback(() => {
    arreterParler()
    setSpeaking(false)
  }, [])

  const getVoices = useCallback(() => voixDisponibles(), [])

  return { speak, stop, speaking, erreur, isSupported, getVoices }
}
