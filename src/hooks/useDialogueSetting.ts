import { useState } from "react"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import {
  DEFAULT_PAUSE_MS,
  DEFAULT_SUITE_MS,
  PAUSE_KEY,
  PAUSE_MAX_MS,
  PAUSE_MIN_MS,
  readDialoguePrefs,
  SUITE_KEY,
  SUITE_MAX_MS,
  SUITE_MIN_MS,
  writeDialoguePref,
} from "@/lib/dialoguePrefs"

/**
 * Rythme de la discussion choisi par l'utilisateur — pause tolérée en
 * parlant, et durée d'écoute après une réponse de Jarvis — persisté sur cet
 * appareil.
 */
export function useDialogueSetting() {
  const [prefs, setPrefs] = useState(readDialoguePrefs)

  useRelireApresRestauration(() => setPrefs(readDialoguePrefs()))

  function setPauseMs(valeur: number) {
    const borne = Math.min(Math.max(Math.round(valeur), PAUSE_MIN_MS), PAUSE_MAX_MS)
    setPrefs((p) => ({ ...p, pauseMs: borne }))
    writeDialoguePref(PAUSE_KEY, borne)
  }

  function setSuiteMs(valeur: number) {
    const borne = Math.min(Math.max(Math.round(valeur), SUITE_MIN_MS), SUITE_MAX_MS)
    setPrefs((p) => ({ ...p, suiteMs: borne }))
    writeDialoguePref(SUITE_KEY, borne)
  }

  /** Remet le rythme aux valeurs d'origine. */
  function resetRythme() {
    setPrefs({ pauseMs: DEFAULT_PAUSE_MS, suiteMs: DEFAULT_SUITE_MS })
    writeDialoguePref(PAUSE_KEY, DEFAULT_PAUSE_MS)
    writeDialoguePref(SUITE_KEY, DEFAULT_SUITE_MS)
  }

  return {
    pauseMs: prefs.pauseMs,
    suiteMs: prefs.suiteMs,
    setPauseMs,
    setSuiteMs,
    resetRythme,
  }
}
