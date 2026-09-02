import { Preferences } from "@capacitor/preferences"
import { Capacitor } from "@capacitor/core"
import type { WidgetConfig } from "@/hooks/useWidgetSetting"
import { JarvisWidget } from "@/lib/jarvisWidgetPlugin"
import type { Category, Task } from "@/types/database"

function isUrgent(task: Task, todayISO: string) {
  return !!task.due_date && task.due_date <= todayISO
}

/**
 * Écrit un résumé des tâches perso dans le stockage natif (lu par le widget
 * d'écran d'accueil Android, indépendant de l'app) puis déclenche un
 * rafraîchissement immédiat du widget. No-op en dehors de l'app Android
 * empaquetée (web/PWA). Respecte la config choisie dans Paramètres
 * (nombre de tâches affichées, urgentes uniquement, filtre catégorie).
 */
export async function updateWidgetSnapshot(
  tasks: Task[],
  categories: Category[],
  config: WidgetConfig,
) {
  if (!Capacitor.isNativePlatform()) return

  const todayISO = new Date().toISOString().slice(0, 10)
  const scoped = tasks.filter(
    (t) => t.status === "todo" && (!config.categoryId || t.category_id === config.categoryId),
  )
  const urgentCount = scoped.filter((t) => isUrgent(t, todayISO)).length
  const listed = (config.urgentOnly ? scoped.filter((t) => isUrgent(t, todayISO)) : scoped).slice(
    0,
    config.maxTasks,
  )
  const categoryLabel = config.categoryId
    ? (categories.find((c) => c.id === config.categoryId)?.name ?? "Toutes catégories")
    : "Toutes catégories"

  await Preferences.set({ key: "jarvis_task_count", value: String(scoped.length) })
  await Preferences.set({ key: "jarvis_urgent_count", value: String(urgentCount) })
  await Preferences.set({
    key: "jarvis_task_titles",
    value: listed.map((t) => t.title).join("\n"),
  })
  await Preferences.set({ key: "jarvis_category_label", value: categoryLabel })

  try {
    await JarvisWidget.refresh()
  } catch {
    // Widget pas encore ajouté à l'écran d'accueil, ou plugin indisponible : sans conséquence.
  }
}
