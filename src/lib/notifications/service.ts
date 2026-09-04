import { Capacitor } from "@capacitor/core"
import {
  LocalNotifications,
  type PendingLocalNotificationSchema,
} from "@capacitor/local-notifications"
import {
  estNotreNotif,
  ID_TEST,
  type CanalNotif,
  type NotifPlanifiee,
} from "@/lib/notifications/plan"

/**
 * Le pont vers les notifications d'Android.
 *
 * Tout ce qui ne se vérifie QUE sur un appareil est ici, et rien d'autre :
 * les permissions, les canaux, la programmation des alarmes. Le calcul de ce
 * qu'il faut programmer est dans plan.ts, qui se vérifie sans téléphone.
 *
 * Sur le web, rien de tout ça n'existe : le plugin n'a pas d'implémentation
 * navigateur. Chaque fonction rend un état "non disponible" plutôt que de
 * lever — Paramètres l'affiche en clair au lieu de laisser croire que les
 * notifications sont actives.
 */

export const notificationsDisponibles = () => Capacitor.isNativePlatform()

/**
 * Un canal par niveau de dérangement, et pas un par notification : c'est
 * Android qui décide du son et de la vibration, et Raphaël peut régler
 * chaque canal depuis le système sans passer par nous.
 *
 * Les importances suivent le classement de la fiche « Quand Jarvis doit te
 * déranger » : ce qui sonne (une échéance qu'on rate coûte cher), ce qui
 * arrive une fois par jour, et ce qui reste silencieux dans le tiroir.
 */
const CANAUX: Record<CanalNotif, { id: string; nom: string; description: string; importance: 2 | 3 | 4 }> = {
  taches: {
    id: "jarvis_taches",
    nom: "Échéances de tâches",
    description: "Quand l'heure d'une tâche arrive.",
    importance: 4,
  },
  matin: {
    id: "jarvis_matin",
    nom: "Point du matin",
    description: "Le résumé de la journée, une fois par jour.",
    importance: 3,
  },
  app: {
    id: "jarvis_app",
    nom: "Mises à jour de l'application",
    description: "Quand une nouvelle version est disponible. Silencieux.",
    importance: 2,
  },
  livraisons: {
    id: "jarvis_livraisons",
    nom: "Chantiers livrés",
    description: "Quand une session Claude Code a terminé des chantiers. Silencieux.",
    importance: 2,
  },
  blocages: {
    id: "jarvis_blocages",
    nom: "Sessions bloquées",
    description: "Quand une session attend une réponse de ta part.",
    importance: 3,
  },
}

let canauxPrets = false

/** Android refuse d'afficher une notification dont le canal n'existe pas —
 * en silence. On les crée une fois par lancement, avant toute programmation. */
async function assurerCanaux() {
  if (canauxPrets || !notificationsDisponibles()) return
  for (const canal of Object.values(CANAUX)) {
    await LocalNotifications.createChannel({
      id: canal.id,
      name: canal.nom,
      description: canal.description,
      importance: canal.importance,
      visibility: 1,
    })
  }
  canauxPrets = true
}

export interface EtatNotifications {
  disponible: boolean
  /** L'utilisateur a accordé la permission (Android 13+ la demande). */
  autorise: boolean
  /** Les notifications de l'app ne sont pas coupées dans les réglages système. */
  actives: boolean
  /**
   * Android 12+ : sans "alarmes et rappels", le système a le droit de
   * décaler une notification programmée de plusieurs minutes, voire de
   * l'attendre jusqu'à la prochaine sortie de veille. Un rappel à 14 h qui
   * sonne à 14 h 40 n'est plus un rappel.
   */
  alarmesExactes: boolean
}

export const ETAT_INDISPONIBLE: EtatNotifications = {
  disponible: false,
  autorise: false,
  actives: false,
  alarmesExactes: false,
}

export async function lireEtat(): Promise<EtatNotifications> {
  if (!notificationsDisponibles()) return ETAT_INDISPONIBLE
  try {
    const [permission, actives] = await Promise.all([
      LocalNotifications.checkPermissions(),
      LocalNotifications.areEnabled(),
    ])
    let alarmesExactes = true
    try {
      const exact = await LocalNotifications.checkExactNotificationSetting()
      alarmesExactes = exact.exact_alarm === "granted"
    } catch {
      // Android < 12 : la notion n'existe pas, les alarmes sont exactes.
    }
    return {
      disponible: true,
      autorise: permission.display === "granted",
      actives: actives.value,
      alarmesExactes,
    }
  } catch {
    return ETAT_INDISPONIBLE
  }
}

/** Ouvre la demande système. Rend l'état obtenu — un refus est une réponse,
 * pas une erreur : Paramètres l'affiche et propose d'ouvrir les réglages. */
export async function demanderPermission(): Promise<EtatNotifications> {
  if (!notificationsDisponibles()) return ETAT_INDISPONIBLE
  try {
    await LocalNotifications.requestPermissions()
  } catch {
    // Refus définitif (l'utilisateur a coché "ne plus demander") : l'état
    // relu juste après dira que ce n'est pas accordé, et c'est ce qui compte.
  }
  await assurerCanaux()
  return lireEtat()
}

/** Ouvre l'écran système "alarmes et rappels" (Android 12+). */
export async function ouvrirReglageAlarmes(): Promise<EtatNotifications> {
  if (!notificationsDisponibles()) return ETAT_INDISPONIBLE
  try {
    await LocalNotifications.changeExactNotificationSetting()
  } catch {
    // Écran absent avant Android 12 : rien à ouvrir, rien à signaler.
  }
  return lireEtat()
}

function versSchema(notif: NotifPlanifiee, quand: Date | null) {
  return {
    id: notif.id,
    title: notif.titre,
    body: notif.corps,
    channelId: CANAUX[notif.canal].id,
    // Ce qui permet d'ouvrir la bonne page quand on appuie dessus.
    extra: { route: notif.route },
    autoCancel: true,
    schedule: quand
      ? {
          at: quand,
          // Sans ça, Android met le rappel en attente pendant le Doze : un
          // téléphone posé sur la table toute la nuit n'annoncerait le point
          // du matin qu'au premier déverrouillage.
          allowWhileIdle: true,
        }
      : undefined,
  }
}

/** Ce qui est actuellement programmé, à nous seulement. */
export async function listerProgrammees(): Promise<PendingLocalNotificationSchema[]> {
  if (!notificationsDisponibles()) return []
  try {
    const { notifications } = await LocalNotifications.getPending()
    return notifications.filter((n) => estNotreNotif(n.id))
  } catch {
    return []
  }
}

/**
 * Aligne ce qui est programmé sur le plan : ce qui n'y est plus est annulé,
 * le reste est (re)programmé.
 *
 * On annule d'abord ce qui a disparu du plan, et seulement dans NOS plages :
 * une tâche supprimée ou faite doit cesser de sonner, mais on ne touche pas
 * à une notification programmée par quelqu'un d'autre.
 */
export async function appliquerPlan(plan: NotifPlanifiee[]): Promise<number> {
  if (!notificationsDisponibles()) return 0
  await assurerCanaux()

  const voulus = new Set(plan.map((n) => n.id))
  const enCours = await listerProgrammees()
  const aAnnuler = enCours.filter((n) => !voulus.has(n.id)).map((n) => ({ id: n.id }))
  if (aAnnuler.length > 0) {
    await LocalNotifications.cancel({ notifications: aAnnuler })
  }
  if (plan.length > 0) {
    await LocalNotifications.schedule({
      notifications: plan.map((n) => versSchema(n, n.quand)),
    })
  }
  return plan.length
}

/** Une notification tout de suite (mise à jour prête, chantiers livrés, test). */
export async function notifierMaintenant(notif: Omit<NotifPlanifiee, "quand">) {
  if (!notificationsDisponibles()) return
  await assurerCanaux()
  await LocalNotifications.schedule({
    notifications: [versSchema({ ...notif, quand: new Date() }, null)],
  })
}

/** Tout effacer : les programmées comme celles déjà affichées. Le bouton
 * "défaire" du chantier — on doit pouvoir faire taire Jarvis d'un geste. */
export async function toutAnnuler() {
  if (!notificationsDisponibles()) return
  const enCours = await listerProgrammees()
  if (enCours.length > 0) {
    await LocalNotifications.cancel({ notifications: enCours.map((n) => ({ id: n.id })) })
  }
  try {
    const affichees = await LocalNotifications.getDeliveredNotifications()
    const notres = affichees.notifications.filter((n) => estNotreNotif(n.id))
    if (notres.length > 0) {
      await LocalNotifications.removeDeliveredNotifications({ notifications: notres })
    }
  } catch {
    // Rien d'affiché à retirer, ou API absente : sans conséquence.
  }
}

/** Une notification de test, immédiate : la seule preuve qui vaille que la
 * chaîne entière fonctionne sur CE téléphone (permission, canal, affichage). */
export async function envoyerTest() {
  await notifierMaintenant({
    id: ID_TEST,
    titre: "Jarvis te dérange (test)",
    corps: "Si tu vois ce message, les notifications fonctionnent.",
    canal: "taches",
    route: "/settings",
  })
}
