import { useState } from "react"
import { TOUTES } from "@/lib/widgetTaches"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireReglage } from "@/lib/reglages"

const STORAGE_KEY = "jarvis_widget_config"

export interface WidgetConfig {
  /**
   * Combien de tâches le widget PORTE — plus « combien il en montre ».
   *
   * La liste défile depuis le chantier 562f1475 (27 sept. 2026) : ce qui est
   * visible d'un coup ne se règle donc plus ici, c'est la hauteur qu'il donne
   * au widget sur son écran d'accueil qui le décide. Ce nombre n'est plus qu'un
   * plafond, et `TOUTES` (0) veut dire « pas de plafond », borné par
   * `PLAFOND_WIDGET`.
   *
   * MESURÉ le 27 sept. 2026 : sa valeur était 5, l'ANCIEN MAXIMUM du
   * sélecteur, posée huit minutes avant qu'il demande à pouvoir défiler — avec
   * 43 tâches à faire dont 14 urgentes. Le plafond était le problème, jamais
   * un choix.
   */
  maxTasks: number
  /** Ne montrer que les tâches en retard ou dues aujourd'hui. */
  urgentOnly: boolean
  /** Filtrer sur une catégorie précise, ou null pour toutes. */
  categoryId: string | null
}

// Défaut : TOUTES. Un plafond par défaut n'avait de sens que tant que la liste
// ne défilait pas — il faisait alors office de « combien de lignes tiennent à
// l'écran ». Maintenant, le limiter d'entrée cacherait des tâches sans que rien
// ne le dise.
const DEFAULT_CONFIG: WidgetConfig = { maxTasks: TOUTES, urgentOnly: false, categoryId: null }

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
