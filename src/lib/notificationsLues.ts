/**
 * Lire les notifications des autres applications — la partie qui décide.
 *
 * D'OÙ ÇA VIENT ET CE QUI A ÉTÉ ACCEPTÉ (chantier b1b6172d, réponse de
 * Raphaël le 5 sept. 2026) : « Oui, mais il ne s'en sert que si je le
 * demande. » Il a lu et accepté que l'autorisation Android est TOTALE et
 * PERMANENTE (WhatsApp, banque, messages) — c'est le CODE qui se retient.
 *
 * Ce module est PUR (aucun appel à Android, à la base ni à React) : c'est ici
 * que vivent les décisions qui peuvent être fausses en silence — formuler la
 * phrase, et surtout dire quand il ne faut RIEN lire. Le pont vers le service
 * Android est dans src/lib/notificationsAndroid.ts, comme la séparation
 * ecranTelephone.ts (décision) / controleEcran.ts (pont) pour l'écran.
 */

export interface NotificationLue {
  paquet: string
  application: string
  titre: string
  texte: string
  quand: number
}

export const CLE_LECTURE_NOTIFICATIONS = "jarvis_lecture_notifications"

/**
 * L'interrupteur maître, EN PLUS de l'autorisation Android — exigence 2 de sa
 * réponse : « un interrupteur maître dans Paramètres, qui coupe l'accès d'un
 * geste ». Par défaut activé (il a dit oui à la fonctionnalité elle-même) ;
 * une valeur absente ou invalide ne coupe pas un garde-fou par accident dans
 * l'autre sens : `"0"` est la SEULE façon de le désactiver.
 */
export function lectureVoulue(brut: string | null): boolean {
  return brut !== "0"
}

/** Une seule ligne, courte : ce que Jarvis dit pour une notification isolée. */
function ligneNotification(n: NotificationLue): string {
  if (n.titre && n.texte) return `${n.application} : ${n.titre} — ${n.texte}`
  return `${n.application} : ${n.titre || n.texte}`
}

/**
 * La phrase que Jarvis dit après une lecture réussie.
 *
 * Une notification isolée se lit en entier. Plusieurs : groupées par
 * application, chacune résumée — lire quinze notifications mot pour mot
 * serait un briefing qu'on n'écoute plus, exactement le défaut déjà corrigé
 * pour le point du matin.
 */
export function phraseNotifications(notifications: NotificationLue[]): string {
  if (notifications.length === 0) return "Tu n'as aucune notification en ce moment."
  if (notifications.length === 1) return ligneNotification(notifications[0])

  const parApplication = new Map<string, NotificationLue[]>()
  for (const n of notifications) {
    const liste = parApplication.get(n.application) ?? []
    liste.push(n)
    parApplication.set(n.application, liste)
  }
  const lignes = [...parApplication.entries()].map(([application, groupe]) =>
    groupe.length === 1 ? ligneNotification(groupe[0]) : `${groupe.length} de ${application}`,
  )
  const pluriel = notifications.length > 1 ? "s" : ""
  return `Tu as ${notifications.length} notification${pluriel}. ${lignes.join(". ")}.`
}

/** Ciblée sur une application précise, mais rien trouvé. */
export function phraseAucuneNotificationDe(nomApplication: string): string {
  return `Tu n'as aucune notification de ${nomApplication} en ce moment.`
}

export function phraseLectureCoupee(): string {
  return "La lecture des notifications est coupée dans Paramètres. Tu peux la rallumer sous « Ce que Jarvis utilise »."
}

export function phraseServiceInactif(): string {
  return "Je ne peux pas lire tes notifications : l'accès n'est pas activé sur ton téléphone. Ouvre Paramètres › Ce que Jarvis utilise › « Lire tes notifications »."
}

export function phraseApplicationInconnue(nomDemande: string): string {
  return `Je ne trouve pas d'application qui s'appelle "${nomDemande}" sur ton téléphone.`
}
