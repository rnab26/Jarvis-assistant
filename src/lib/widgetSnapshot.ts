import { Preferences } from "@capacitor/preferences"
import { Capacitor } from "@capacitor/core"
import type { WidgetConfig } from "@/hooks/useWidgetSetting"
import { JarvisWidget } from "@/lib/jarvisWidgetPlugin"
import { estUrgente, isoLocal, lignesDuWidget, tachesDuWidget } from "@/lib/widgetTaches"
import type { Category, Task } from "@/types/database"

/** La clé lue côté Android par `JarvisWidgetTachesService` (sa `Factory`
 * interne, champ `KEY_LIGNES`). Un seul endroit la nomme de ce côté-ci ; si tu
 * la changes, change-la là-bas dans le même travail — un widget qui lit une clé
 * disparue n'affiche rien et ne dit rien. Un contrôle compare les deux. */
const CLE_LIGNES = "jarvis_task_rows"

/**
 * Écrit un résumé des tâches perso dans le stockage natif (lu par le widget
 * d'écran d'accueil Android, indépendant de l'app) puis déclenche un
 * rafraîchissement immédiat du widget. No-op en dehors de l'app Android
 * empaquetée (web/PWA). Respecte la config choisie dans Paramètres (tâches
 * portées, urgentes uniquement, filtre catégorie).
 *
 * Depuis le chantier 562f1475 (27 sept. 2026), la liste DÉFILE : ce ne sont
 * plus des titres collés par des retours à la ligne, mais des lignes en JSON,
 * chacune avec son échéance. La décision de ce qui part vit dans
 * `widgetTaches.ts`, vérifiable sans téléphone.
 */
export async function updateWidgetSnapshot(
  tasks: Task[],
  categories: Category[],
  config: WidgetConfig,
) {
  if (!Capacitor.isNativePlatform()) return

  const maintenant = new Date()
  // Le jour LOCAL, pas celui d'UTC : il vit en Israël (UTC+2/+3), et
  // `toISOString()` y désigne encore la veille entre minuit et 3 h du matin —
  // ses tâches dues aujourd'hui cessaient d'être comptées urgentes pendant
  // exactement ces heures-là. Trouvé en écrivant `widgetTaches.ts`.
  const aujourdhuiISO = isoLocal(maintenant)
  const retenues = tachesDuWidget(tasks, config)
  const urgentCount = retenues.filter((t) => estUrgente(t, aujourdhuiISO)).length
  const lignes = lignesDuWidget(tasks, config, maintenant)
  const categoryLabel = config.categoryId
    ? (categories.find((c) => c.id === config.categoryId)?.name ?? "Toutes catégories")
    : "Toutes catégories"

  await Preferences.set({ key: "jarvis_task_count", value: String(retenues.length) })
  await Preferences.set({ key: "jarvis_urgent_count", value: String(urgentCount) })
  await Preferences.set({ key: CLE_LIGNES, value: JSON.stringify(lignes) })
  await Preferences.set({ key: "jarvis_category_label", value: categoryLabel })

  try {
    await JarvisWidget.refresh()
  } catch {
    // Widget pas encore ajouté à l'écran d'accueil, ou plugin indisponible : sans conséquence.
  }
}
