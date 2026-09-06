import { registerPlugin } from "@capacitor/core"
import { ActionsTelephone, trouverApplication } from "@/lib/actionsTelephone"
import { noterEcoute } from "@/lib/journalEcoute"
import {
  CLE_LECTURE_NOTIFICATIONS,
  lectureVoulue,
  phraseApplicationInconnue,
  phraseAucuneNotificationDe,
  phraseLectureCoupee,
  phraseNotifications,
  phraseServiceInactif,
  type NotificationLue,
} from "@/lib/notificationsLues"

/**
 * Le pont vers JarvisNotificationListenerService, et l'enchaînement complet
 * d'une demande : vérifier l'interrupteur, résoudre l'application visée,
 * lire, TRACER (jamais le contenu), et rendre la phrase à dire.
 *
 * Exigence 3 de sa réponse (chantier b1b6172d) : chaque lecture est tracée
 * (quelle app, quand, à la suite de quelle phrase) et visible dans l'app —
 * voir src/components/settings/LectureNotifications.tsx, qui relit
 * `journal_ecoute` en direct. Le CONTENU des notifications, lui, ne part
 * jamais dans le journal : seule la phrase parlée (transitoire) le porte.
 */

interface NotificationsPluginNative {
  etat(): Promise<{ declare: boolean; actif: boolean }>
  ouvrirReglages(): Promise<void>
  lire(options: { paquet?: string }): Promise<{
    disponible: boolean
    raison?: string
    notifications?: NotificationLue[]
  }>
}

/** Pont vers android/.../NotificationsPlugin.java. N'existe que dans l'app
 * empaquetée : sur le web, il n'y a pas d'autres applications à surveiller. */
export const NotificationsAndroid = registerPlugin<NotificationsPluginNative>("Notifications")

export interface EtatLectureNotifications {
  /** Autorisé dans les réglages d'Android. */
  declare: boolean
  /** Et réellement relié — c'est celui-là qui compte pour agir. */
  actif: boolean
}

/** L'état RÉEL, lu du système. Jamais un réglage : Android peut couper ce
 * service sans que l'application en sache rien. */
export async function etatLectureNotifications(): Promise<EtatLectureNotifications> {
  try {
    return await NotificationsAndroid.etat()
  } catch {
    return { declare: false, actif: false }
  }
}

export async function ouvrirReglagesLectureNotifications(): Promise<void> {
  await NotificationsAndroid.ouvrirReglages()
}

export function lectureNotificationsVoulue(): boolean {
  try {
    return lectureVoulue(localStorage.getItem(CLE_LECTURE_NOTIFICATIONS))
  } catch {
    return lectureVoulue(null)
  }
}

/**
 * Lit les notifications actuellement affichées et rend ce que Jarvis dira.
 *
 * `nomApplication` : filtre demandé à la voix (« lis-moi mes mails »). Sans
 * lui, tout ce qui est affiché.
 */
export async function lireNotifications(nomApplication?: string): Promise<string> {
  if (!lectureNotificationsVoulue()) {
    noterEcoute("notification_lue", { demandee: nomApplication ?? null, resultat: "coupe" })
    return phraseLectureCoupee()
  }

  let paquet: string | undefined
  if (nomApplication) {
    const { applications } = await ActionsTelephone.listerApplications()
    const trouvee = trouverApplication(applications, nomApplication)
    if (!trouvee) {
      noterEcoute("notification_lue", { demandee: nomApplication, resultat: "app_introuvable" })
      return phraseApplicationInconnue(nomApplication)
    }
    paquet = trouvee.paquet
  }

  const r = await NotificationsAndroid.lire({ paquet })
  if (!r.disponible) {
    noterEcoute("notification_lue", { demandee: nomApplication ?? null, resultat: "service_inactif" })
    return phraseServiceInactif()
  }

  const notifications = r.notifications ?? []
  // TRACE : quelle app, quand, combien — jamais le titre ni le texte. C'est
  // la seule façon pour Raphaël de vérifier que « seulement sur demande » est
  // respecté, sans que le registre devienne lui-même une deuxième copie du
  // contenu de ses notifications.
  noterEcoute("notification_lue", {
    demandee: nomApplication ?? null,
    resultat: notifications.length > 0 ? "lu" : "aucune",
    compte: notifications.length,
    applications: [...new Set(notifications.map((n) => n.application))].join(", "),
  })

  if (notifications.length === 0) {
    return nomApplication ? phraseAucuneNotificationDe(nomApplication) : phraseNotifications([])
  }
  return phraseNotifications(notifications)
}

export interface TraceLectureNotifications {
  at: string
  demandee: string | null
  resultat: string
  compte: number | null
  applications: string[] | null
}

/**
 * L'historique des lectures, tel que tracé par `noterEcoute` — jamais le
 * contenu, seulement quelle app, quand, et à la suite de quelle demande.
 * C'est la seule façon pour Raphaël de vérifier que « seulement sur demande »
 * est respecté (exigence 3 de sa réponse), donc affiché dans
 * src/components/settings/LectureNotifications.tsx.
 */
export async function historiqueLectureNotifications(
  limite = 15,
): Promise<TraceLectureNotifications[]> {
  const { supabase } = await import("@/lib/supabase")
  const { data, error } = await supabase
    .from("journal_ecoute")
    .select("at, detail")
    .eq("evenement", "notification_lue")
    .order("at", { ascending: false })
    .limit(limite)
  if (error || !data) return []
  return data.map((ligne) => {
    const detail = (ligne.detail ?? {}) as Record<string, unknown>
    return {
      at: ligne.at as string,
      demandee: typeof detail.demandee === "string" ? detail.demandee : null,
      resultat: typeof detail.resultat === "string" ? detail.resultat : "inconnu",
      compte: typeof detail.compte === "number" ? detail.compte : null,
      // Stocké comme une chaîne jointe par des virgules : noterEcoute
      // n'accepte que des valeurs scalaires dans son détail.
      applications:
        typeof detail.applications === "string" && detail.applications.length > 0
          ? detail.applications.split(", ")
          : null,
    }
  })
}
