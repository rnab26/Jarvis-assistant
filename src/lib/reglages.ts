/**
 * Les réglages personnels de Raphaël, et leur voyage entre l'appareil et la
 * base.
 *
 * Ce module ne contient AUCUN réglage : il ne connaît que la liste des clés
 * de stockage local qui, ensemble, forment "ses réglages". Chaque réglage
 * garde son propre module (voix, rythme, widget…) — ici on ne fait que les
 * recopier d'un côté à l'autre.
 *
 * Pourquoi : ces réglages ne vivaient que dans le localStorage du téléphone.
 * Une mise à jour normale de l'APK les préserve, mais une réinstallation ou
 * un nettoyage des données de l'app les efface — y compris l'image du
 * réacteur importée à la main. Et ils n'existaient pas du tout côté web.
 */

/** Les clés recopiées en base. Toute nouvelle préférence stockée en local
 * doit être ajoutée ici, sinon elle sera perdue à la prochaine
 * réinstallation — c'est le seul endroit à tenir à jour. */
export const CLES_REGLAGES = [
  "jarvis_wake_word_enabled",
  "jarvis_geofence_enabled",
  "jarvis_widget_config",
  "jarvis_voice_index",
  "jarvis_voice_rate",
  "jarvis_voice_pitch",
  "jarvis_voice_muted",
  "jarvis_dialogue_pause_ms",
  "jarvis_dialogue_suite_ms",
  "jarvis_mode_live",
  "jarvis_core_image",
] as const

/** Émis après une écriture locale : la synchro sait qu'elle a à pousser. */
export const REGLAGE_MODIFIE = "jarvis:reglage-modifie"
/** Émis après avoir appliqué les réglages venus de la base : les hooks
 * relisent le stockage local, sinon leur état React resterait sur ce qu'ils
 * avaient lu au montage. */
export const REGLAGES_RESTAURES = "jarvis:reglages-restaures"

/** Écrit un réglage en local et le signale. Passer par ici plutôt que par
 * localStorage directement, sinon le réglage ne remontera jamais en base. */
export function ecrireReglage(cle: string, valeur: string | null) {
  try {
    if (valeur === null) localStorage.removeItem(cle)
    else localStorage.setItem(cle, valeur)
  } catch {
    // Stockage indisponible (navigation privée, quota) : le réglage vaut
    // pour la session en cours seulement.
  }
  window.dispatchEvent(new Event(REGLAGE_MODIFIE))
}

/** L'état local, tel qu'il partira en base. Les clés jamais renseignées sont
 * absentes plutôt que nulles : on ne veut pas écraser un réglage existant
 * en base avec le "pas encore choisi" d'un appareil neuf. */
export function lireReglagesLocaux(): Record<string, string> {
  const valeurs: Record<string, string> = {}
  try {
    for (const cle of CLES_REGLAGES) {
      const v = localStorage.getItem(cle)
      if (v !== null) valeurs[cle] = v
    }
  } catch {
    // Stockage illisible : on renvoie ce qu'on a pu lire.
  }
  return valeurs
}

/**
 * Applique les réglages venus de la base, et dit si quelque chose a changé.
 *
 * On n'écrit que ce qui diffère réellement : sans ça, appliquer les réglages
 * au démarrage déclencherait une resynchronisation en boucle.
 */
export function appliquerReglages(valeurs: Record<string, unknown>): boolean {
  let change = false
  try {
    for (const cle of CLES_REGLAGES) {
      const recu = valeurs[cle]
      if (typeof recu !== "string") continue
      if (localStorage.getItem(cle) === recu) continue
      localStorage.setItem(cle, recu)
      change = true
    }
  } catch {
    return false
  }
  return change
}
