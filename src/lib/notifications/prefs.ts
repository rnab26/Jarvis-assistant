import { ecrireReglage } from "../reglages.ts"

/**
 * Ce que Jarvis a le droit de faire sonner, et quand.
 *
 * Les valeurs par défaut ne sont pas choisies ici : ce sont les réponses de
 * Raphaël à la fiche « Quand Jarvis doit te déranger » (4 sept. 2026,
 * artefact 7d87dcb4, document fiche/notifications). Il a dit OUI à l'échéance
 * d'une tâche, au point du matin (09:15), à la nouvelle APK, au chantier
 * livré et à la session bloquée ; NON au message programmé, au rendez-vous
 * d'agenda et au mail — Google prévient déjà pour ces deux-là, et une
 * notification en double coûte plus qu'elle ne rapporte.
 *
 * Sa consigne écrite, mot pour mot : « Le point du matin il faut que je
 * puisse l'activer et le paramètre quand je veux dans l'application. »
 * D'où l'heure réglable, et pas une constante.
 */

export const NOTIFICATIONS_KEY = "jarvis_notifications"

export interface PrefsNotifications {
  /** L'heure d'une tâche arrive : Jarvis le dit. */
  echeance: boolean
  /** Minutes d'avance sur l'heure d'une tâche qui en a une. 0 = à l'heure dite. */
  avantMin: number
  /** Heure du rappel d'une tâche datée SANS heure (sinon on ne saurait pas
   * quand la faire sonner : minuit réveillerait pour rien). */
  heureSansHeure: string
  /** Un point sur la journée, chaque matin. */
  matin: boolean
  /** Heure du point du matin, "HH:MM". */
  heureMatin: string
  /** Une nouvelle version de l'app est disponible. */
  apk: boolean
  /** Une session Claude Code a livré des chantiers. */
  livre: boolean
  /** Une session est bloquée et attend une réponse de Raphaël. */
  bloque: boolean
  /**
   * Ne rien faire SONNER pendant la nuit. Les rappels s'affichent quand
   * même, en silence : les supprimer ou les décaler ferait manquer une
   * échéance, alors qu'un rappel muet dans le volet est encore là au
   * réveil.
   */
  silenceNuit: boolean
  /** Début de la plage silencieuse, "HH:MM". Peut passer minuit. */
  silenceDebut: string
  /** Fin de la plage silencieuse, "HH:MM". */
  silenceFin: string
  /**
   * Dire la notification à voix haute quand l'app est ouverte, ou quand il
   * vient d'appuyer dessus — au lieu de seulement l'afficher. Sa demande
   * d'origine (chantier 7567cd47) : « Jarvis doit pouvoir intervenir à l'oral
   * pour donner une information tel un rappel ». Jamais pendant les heures de
   * silence, jamais si la voix de Jarvis est coupée.
   */
  direAVoixHaute: boolean
  /**
   * Pendant les heures de silence, Jarvis parle QUAND MÊME si Raphaël vient
   * de s'en servir.
   *
   * Sa demande du 6 sept. 2026 : « concernant les heures de silence, si on
   * l'utilise pour lancer une action, il faudrait que ça marche, oui. » Le
   * cas visé est le rappel qu'il a demandé lui-même le soir (« rappelle-moi
   * dans dix minutes ») : il partait sur le canal muet, et de son fauteuil il
   * avait demandé quelque chose sans que rien ne se passe.
   *
   * La règle : les heures de silence protègent son SOMMEIL, pas son
   * attention. Elles taisent ce que Jarvis initie pendant qu'il ne s'en sert
   * pas, jamais ce qu'il a demandé.
   */
  silenceLeveParUsage: boolean
}

export const PREFS_NOTIFS_DEFAUT: PrefsNotifications = {
  echeance: true,
  avantMin: 0,
  heureSansHeure: "09:00",
  matin: true,
  heureMatin: "09:15",
  apk: true,
  livre: true,
  bloque: true,
  // Activé par défaut, et c'est un choix : sa règle est qu'« une
  // notification non désirée sur un téléphone se paie cher ». Rien n'est
  // perdu — les rappels de nuit s'affichent, ils ne sonnent pas — et il
  // suffit d'un interrupteur pour rendre la nuit sonore.
  silenceNuit: true,
  silenceDebut: "22:30",
  silenceFin: "07:30",
  // Activé : une notification qu'on entend pendant qu'on a le téléphone en
  // main évite de le déverrouiller pour lire trois mots. Les heures de
  // silence la retiennent déjà, et un interrupteur suffit à la couper.
  direAVoixHaute: true,
  // Activé : c'est la règle qu'il a énoncée. L'interrupteur existe pour le
  // cas inverse — lire au lit à côté de quelqu'un qui dort.
  silenceLeveParUsage: true,
}

/** Les avances proposées dans Paramètres. Une liste fermée : un champ libre
 * en minutes n'apporterait rien et se remplit mal au pouce. */
export const CHOIX_AVANT_MIN = [
  { valeur: 0, label: "À l'heure dite" },
  { valeur: 5, label: "5 minutes avant" },
  { valeur: 15, label: "15 minutes avant" },
  { valeur: 30, label: "30 minutes avant" },
  { valeur: 60, label: "1 heure avant" },
  { valeur: 180, label: "3 heures avant" },
  { valeur: 1440, label: "La veille, à la même heure" },
] as const

const HEURE_VALIDE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Une heure lue du stockage peut être n'importe quoi (réglage écrit par une
 * version plus ancienne, stockage bricolé) : on ne programme pas une alarme
 * sur "NaN:NaN", on retombe sur la valeur par défaut. */
function heureValide(valeur: unknown, defaut: string): string {
  return typeof valeur === "string" && HEURE_VALIDE.test(valeur) ? valeur : defaut
}

function booleen(valeur: unknown, defaut: boolean): boolean {
  return typeof valeur === "boolean" ? valeur : defaut
}

/** Normalise ce qui sort du stockage. Toute clé absente ou aberrante reprend
 * sa valeur par défaut, sans jamais faire échouer la lecture. */
export function normaliserPrefs(brut: unknown): PrefsNotifications {
  const o = (brut ?? {}) as Partial<Record<keyof PrefsNotifications, unknown>>
  const avant = Number(o.avantMin)
  return {
    echeance: booleen(o.echeance, PREFS_NOTIFS_DEFAUT.echeance),
    avantMin: CHOIX_AVANT_MIN.some((c) => c.valeur === avant)
      ? avant
      : PREFS_NOTIFS_DEFAUT.avantMin,
    heureSansHeure: heureValide(o.heureSansHeure, PREFS_NOTIFS_DEFAUT.heureSansHeure),
    matin: booleen(o.matin, PREFS_NOTIFS_DEFAUT.matin),
    heureMatin: heureValide(o.heureMatin, PREFS_NOTIFS_DEFAUT.heureMatin),
    apk: booleen(o.apk, PREFS_NOTIFS_DEFAUT.apk),
    livre: booleen(o.livre, PREFS_NOTIFS_DEFAUT.livre),
    bloque: booleen(o.bloque, PREFS_NOTIFS_DEFAUT.bloque),
    silenceNuit: booleen(o.silenceNuit, PREFS_NOTIFS_DEFAUT.silenceNuit),
    silenceDebut: heureValide(o.silenceDebut, PREFS_NOTIFS_DEFAUT.silenceDebut),
    silenceFin: heureValide(o.silenceFin, PREFS_NOTIFS_DEFAUT.silenceFin),
    direAVoixHaute: booleen(o.direAVoixHaute, PREFS_NOTIFS_DEFAUT.direAVoixHaute),
    silenceLeveParUsage: booleen(o.silenceLeveParUsage, PREFS_NOTIFS_DEFAUT.silenceLeveParUsage),
  }
}

export function lirePrefsNotifs(): PrefsNotifications {
  try {
    const brut = localStorage.getItem(NOTIFICATIONS_KEY)
    if (!brut) return PREFS_NOTIFS_DEFAUT
    return normaliserPrefs(JSON.parse(brut))
  } catch {
    // Stockage illisible ou JSON abîmé : les réglages par défaut valent mieux
    // qu'un écran de paramètres vide.
    return PREFS_NOTIFS_DEFAUT
  }
}

/** Passe par ecrireReglage : sans ça, le réglage ne remonterait jamais en
 * base et serait perdu à la prochaine réinstallation (voir src/lib/reglages.ts). */
export function ecrirePrefsNotifs(prefs: PrefsNotifications) {
  ecrireReglage(NOTIFICATIONS_KEY, JSON.stringify(prefs))
}
