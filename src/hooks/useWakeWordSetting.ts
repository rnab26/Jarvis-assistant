import { useState } from "react"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireReglage } from "@/lib/reglages"
import { REFUS_AVANT_ABANDON } from "@/lib/veille"

const STORAGE_KEY = "jarvis_wake_word_enabled"
const CLE_ABANDON = "jarvis_veille_abandon_refus"

function lire() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Combien de démarrages refusés d'affilée avant que la veille renonce.
 *
 * 0 = ne jamais renoncer (le comportement d'avant le 17 sept. 2026). Une
 * valeur illisible ou absente retombe sur le défaut mesuré, jamais sur 0 :
 * un stockage vide ne doit pas rendre en silence le harcèlement du micro.
 */
function lireSeuilAbandon() {
  try {
    const brut = localStorage.getItem(CLE_ABANDON)
    if (brut === null) return REFUS_AVANT_ABANDON
    const n = Number.parseInt(brut, 10)
    return Number.isFinite(n) && n >= 0 ? n : REFUS_AVANT_ABANDON
  } catch {
    return REFUS_AVANT_ABANDON
  }
}

/**
 * Préférence "écoute du mot-clé Jarvis" (activation manuelle, off par
 * défaut) — persistée en local, propre à cet appareil/navigateur.
 */
export function useWakeWordSetting() {
  const [enabled, setEnabledState] = useState(lire)
  const [seuilAbandon, setSeuilAbandonState] = useState(lireSeuilAbandon)

  useRelireApresRestauration(() => {
    setEnabledState(lire())
    setSeuilAbandonState(lireSeuilAbandon())
  })

  function setEnabled(value: boolean) {
    setEnabledState(value)
    ecrireReglage(STORAGE_KEY, value ? "1" : "0")
  }

  function setSeuilAbandon(value: number) {
    setSeuilAbandonState(value)
    ecrireReglage(CLE_ABANDON, String(value))
  }

  return { enabled, setEnabled, seuilAbandon, setSeuilAbandon }
}
