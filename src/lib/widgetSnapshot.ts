import { Preferences } from "@capacitor/preferences"
import { Capacitor } from "@capacitor/core"
import { JarvisWidget } from "@/lib/jarvisWidgetPlugin"
import type { Task } from "@/types/database"

/**
 * Écrit un résumé des tâches perso dans le stockage natif (lu par le widget
 * d'écran d'accueil Android, indépendant de l'app) puis déclenche un
 * rafraîchissement immédiat du widget. No-op en dehors de l'app Android
 * empaquetée (web/PWA).
 */
export async function updateWidgetSnapshot(tasks: Task[]) {
  if (!Capacitor.isNativePlatform()) return

  const todo = tasks.filter((t) => t.status === "todo")
  const nextTitle = todo[0]?.title ?? "Aucune tâche"

  await Preferences.set({ key: "jarvis_task_count", value: String(todo.length) })
  await Preferences.set({ key: "jarvis_task_title", value: nextTitle })

  try {
    await JarvisWidget.refresh()
  } catch {
    // Widget pas encore ajouté à l'écran d'accueil, ou plugin indisponible : sans conséquence.
  }
}
