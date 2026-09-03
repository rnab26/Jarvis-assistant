import { useState } from "react"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireReglage } from "@/lib/reglages"

const STORAGE_KEY = "jarvis_widget_config"

export interface WidgetConfig {
  /** Nombre de tâches listées sur le widget (1 à 5). */
  maxTasks: number
  /** Ne montrer que les tâches en retard ou dues aujourd'hui. */
  urgentOnly: boolean
  /** Filtrer sur une catégorie précise, ou null pour toutes. */
  categoryId: string | null
}

const DEFAULT_CONFIG: WidgetConfig = { maxTasks: 3, urgentOnly: false, categoryId: null }

function readStoredConfig(): WidgetConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

/** Config du widget d'écran d'accueil (Android) — persistée en local,
 * propre à cet appareil. Partagée entre Paramètres et le calcul du résumé
 * écrit dans le stockage natif lu par le widget. */
export function useWidgetSetting() {
  const [config, setConfigState] = useState<WidgetConfig>(readStoredConfig)

  useRelireApresRestauration(() => setConfigState(readStoredConfig()))

  function setConfig(next: Partial<WidgetConfig>) {
    setConfigState((prev) => {
      const merged = { ...prev, ...next }
      ecrireReglage(STORAGE_KEY, JSON.stringify(merged))
      return merged
    })
  }

  return { config, setConfig }
}
