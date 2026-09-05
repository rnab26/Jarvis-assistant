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

/**
 * Une préférence de Raphaël : sa clé de stockage, et OÙ il la règle.
 *
 * Les deux vont ensemble, et c'est le sujet du chantier permanent 776235be.
 * Une clé déclarée sans contrôle est conservée à la réinstallation mais
 * invisible et figée sur sa valeur de départ ; un contrôle sans clé déclarée
 * se perd silencieusement à la prochaine réinstallation. Il faut les deux, et
 * `scripts/verifier-reglages.ts` refuse maintenant qu'on n'en livre qu'une
 * moitié.
 */
export interface ReglageDeclare {
  cle: string
  /** Où il se règle, tel qu'on le dirait à Raphaël. */
  ou: string
  /** Le fichier qui porte ce contrôle. Vérifié : il doit exister. */
  fichier: string
}

/** Les préférences recopiées en base. Toute nouvelle préférence stockée en
 * local s'ajoute ici AVEC son contrôle, sinon elle sera perdue à la
 * prochaine réinstallation — et invisible d'ici là. */
export const REGLAGES: ReglageDeclare[] = [
  {
    cle: "jarvis_wake_word_enabled",
    ou: "Paramètres › Voix et écoute › Mot-clé de réveil",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_geofence_enabled",
    ou: "Paramètres › Tâches et organisation › Rappels de lieu",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_widget_config",
    ou: "Paramètres › Tâches et organisation › Widget d'écran d'accueil",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_voice_index",
    ou: "Paramètres › Voix et écoute › Voix de Jarvis",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_voice_rate",
    ou: "Paramètres › Voix et écoute › Voix de Jarvis",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_voice_pitch",
    ou: "Paramètres › Voix et écoute › Voix de Jarvis",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_voice_muted",
    ou: "Paramètres › Voix et écoute › Jarvis répond à voix haute",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_dialogue_pause_ms",
    ou: "Paramètres › Voix et écoute › Rythme de la discussion",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_dialogue_suite_ms",
    ou: "Paramètres › Voix et écoute › Rythme de la discussion",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_mode_live",
    ou: "Paramètres › Voix et écoute › Mode conversation Live (essai), et la case sous le cœur",
    fichier: "src/components/settings/ModeLive.tsx",
  },
  {
    cle: "jarvis_theme",
    ou: "Paramètres › Apparence › Thème",
    fichier: "src/components/settings/Theme.tsx",
  },
  {
    cle: "jarvis_core_image",
    ou: "Paramètres › Apparence › Le cœur de Jarvis",
    fichier: "src/pages/SettingsPage.tsx",
  },
  {
    cle: "jarvis_app_musique",
    ou: "Paramètres › Ce que Jarvis utilise › Tes applications par défaut",
    fichier: "src/components/settings/AppsParDefaut.tsx",
  },
  {
    cle: "jarvis_app_navigation",
    ou: "Paramètres › Ce que Jarvis utilise › Tes applications par défaut",
    fichier: "src/components/settings/AppsParDefaut.tsx",
  },
  {
    cle: "jarvis_app_ia",
    ou: "Paramètres › Ce que Jarvis utilise › Tes applications par défaut",
    fichier: "src/components/settings/AppsParDefaut.tsx",
  },
  {
    cle: "jarvis_canal_messages",
    ou: "Paramètres › Ce que Jarvis utilise › Tes applications par défaut",
    fichier: "src/components/settings/AppsParDefaut.tsx",
  },
  {
    cle: "jarvis_bulle_flottante",
    ou: "Paramètres › Ce que Jarvis utilise › La bulle Jarvis, par-dessus tout",
    fichier: "src/components/settings/BulleFlottante.tsx",
  },
  {
    cle: "jarvis_delai_annulation",
    ou: "Paramètres › Ce que Jarvis utilise › Le temps de l'arrêter",
    fichier: "src/components/settings/FenetreAnnulation.tsx",
  },
  {
    cle: "jarvis_notifications",
    ou: "Paramètres › Notifications › Quand Jarvis te dérange",
    fichier: "src/components/settings/Notifications.tsx",
  },
  {
    cle: "jarvis_maj_auto",
    ou: "Paramètres › L'application › Mettre à jour l'application",
    fichier: "src/pages/SettingsPage.tsx",
  },
]

/** Les clés recopiées en base, telles que la synchro les lit. */
export const CLES_REGLAGES: readonly string[] = REGLAGES.map((r) => r.cle)

/**
 * Ce qui reste volontairement sur l'appareil, et pourquoi.
 *
 * Une clé de stockage local qui n'est ni ici ni dans REGLAGES est une
 * préférence oubliée : `scripts/verifier-reglages.ts` la signale. Le préfixe
 * suffit quand la clé est construite (une par section, par exemple).
 */
export const STOCKAGE_LOCAL_ASSUME: { prefixe: string; pourquoi: string }[] = [
  {
    prefixe: "jarvis_section_",
    pourquoi:
      "Section de Paramètres ouverte ou fermée : un confort de lecture propre à l'écran du moment, pas une préférence à retrouver sur un autre appareil.",
  },
  {
    prefixe: "jarvis_maj_annoncee",
    pourquoi:
      "Dernière version déjà annoncée sur CE téléphone : un aide-mémoire pour ne pas notifier deux fois, pas un choix de Raphaël.",
  },
  {
    prefixe: "jarvis_question_ia",
    pourquoi:
      "La question envoyée à une IA installée, en attendant que Raphaël en partage la réponse. Un aller-retour en cours sur CET appareil, qui vit une demi-heure : la réponse se partage depuis le téléphone d'où la question est partie, pas depuis un autre.",
  },
  {
    prefixe: "jarvis_autorisations_vues",
    pourquoi:
      "L'écran des autorisations a déjà été présenté sur CET appareil. Les autorisations Android sont propres au téléphone : recopier ce repère en base ferait sauter l'écran sur un appareil neuf, qui n'a justement rien d'accordé.",
  },
  {
    prefixe: "jarvis_cockpit_vu",
    pourquoi:
      "Date de la dernière visite du cockpit sur CET écran, pour dire ce qui a bougé depuis. Un repère de lecture, pas une préférence : la retrouver sur un autre appareil n'aurait aucun sens.",
  },
]

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
