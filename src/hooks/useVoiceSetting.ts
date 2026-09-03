import { useState } from "react"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import {
  DEFAULT_PITCH,
  DEFAULT_RATE,
  PITCH_MAX,
  PITCH_MIN,
  RATE_MAX,
  RATE_MIN,
  readVoicePrefs,
  VOICE_INDEX_KEY,
  VOICE_PITCH_KEY,
  VOICE_RATE_KEY,
  writeVoiceMuted,
  writeVoicePref,
} from "@/lib/voicePrefs"

/**
 * Réglages de voix choisis par l'utilisateur — voix, vitesse, hauteur —
 * persistés sur cet appareil. voiceIndex null = voix par défaut du système.
 */
export function useVoiceSetting() {
  const [prefs, setPrefs] = useState(readVoicePrefs)

  useRelireApresRestauration(() => setPrefs(readVoicePrefs()))

  function setVoiceIndex(value: number | null) {
    setPrefs((p) => ({ ...p, voiceIndex: value }))
    writeVoicePref(VOICE_INDEX_KEY, value)
  }

  function setRate(value: number) {
    const borne = Math.min(Math.max(value, RATE_MIN), RATE_MAX)
    setPrefs((p) => ({ ...p, rate: borne }))
    writeVoicePref(VOICE_RATE_KEY, borne)
  }

  function setPitch(value: number) {
    const borne = Math.min(Math.max(value, PITCH_MIN), PITCH_MAX)
    setPrefs((p) => ({ ...p, pitch: borne }))
    writeVoicePref(VOICE_PITCH_KEY, borne)
  }

  /** Coupe ou remet la voix. Écrit tout de suite en local : la synthèse lit
   *  cette préférence à chaque lecture, y compris juste après une commande
   *  vocale, sans attendre un nouveau rendu React. */
  function setMuted(value: boolean) {
    setPrefs((p) => ({ ...p, muted: value }))
    writeVoiceMuted(value)
  }

  /** Remet vitesse et hauteur aux valeurs d'origine, sans toucher à la voix. */
  function resetTon() {
    setPrefs((p) => ({ ...p, rate: DEFAULT_RATE, pitch: DEFAULT_PITCH }))
    writeVoicePref(VOICE_RATE_KEY, DEFAULT_RATE)
    writeVoicePref(VOICE_PITCH_KEY, DEFAULT_PITCH)
  }

  return {
    voiceIndex: prefs.voiceIndex,
    rate: prefs.rate,
    pitch: prefs.pitch,
    muted: prefs.muted,
    setMuted,
    setVoiceIndex,
    setRate,
    setPitch,
    resetTon,
  }
}
