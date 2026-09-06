import type { PrefsNotifications } from "@/lib/notifications/prefs"
import type { Task } from "@/types/database"

/**
 * Ce que Jarvis fera sonner, calculé à l'avance.
 *
 * Ce fichier ne parle à personne : ni à Android, ni à la base, ni à React.
 * Il transforme des tâches et des réglages en une liste de notifications
 * datées. C'est volontaire — c'est la seule partie du système de
 * notifications qui puisse être vérifiée sans téléphone, et c'est là que
 * vivent toutes les décisions qui peuvent être fausses (le bon moment, le
 * bon texte, ne pas réveiller pour une tâche déjà faite).
 *
 * `scripts/verifier-notifications.ts` rejoue ces fonctions sur des cas
 * précis. Le reste (permissions, canaux, alarmes) est dans service.ts et ne
 * se vérifie que sur l'appareil.
 */

export type CanalNotif = "taches" | "matin" | "nuit" | "app" | "livraisons" | "blocages"

export interface NotifPlanifiee {
  id: number
  titre: string
  corps: string
  /** Le moment exact où elle doit sonner. */
  quand: Date
  canal: CanalNotif
  /** Où emmener Raphaël quand il appuie dessus (route du HashRouter). */
  route: string
}

/**
 * Les identifiants Android sont des entiers, et ils sont NOTRE responsabilité :
 * reprogrammer sans annuler l'ancienne donne deux notifications pour la même
 * tâche. On réserve donc des plages, et on n'annule jamais que ce qui vient
 * de nous — le plugin est partagé avec tout ce qui pourrait en programmer
 * plus tard.
 */
export const PLAGE_ECHEANCE = { debut: 100_000, fin: 500_000 }
export const PLAGE_MATIN = { debut: 600_000, fin: 600_100 }
/** Instantanées : un seul emplacement chacune, la suivante remplace la précédente. */
export const ID_MAJ_APP = 700_001
export const ID_CHANTIERS_LIVRES = 710_001
export const ID_SESSION_BLOQUEE = 710_002
export const ID_TEST = 799_999

/** Vrai si cet identifiant vient de nous. */
export function estNotreNotif(id: number): boolean {
  return id >= PLAGE_ECHEANCE.debut && id <= ID_TEST
}

/** Nombre maximal de notifications programmées d'avance. Android accepte
 * beaucoup plus d'alarmes, mais au-delà on programme des rappels que
 * personne n'attend, et chaque reprogrammation coûte un aller-retour natif. */
export const MAX_PROGRAMMEES = 64

/** Combien de matins on prépare à l'avance. Le texte du point du matin est
 * figé au moment où on le programme : sept jours, c'est assez pour couvrir
 * une semaine sans ouvrir l'app, et assez peu pour que le contenu reste
 * proche de la réalité. */
export const MATINS_A_PREPARER = 7

/** FNV-1a, réduit à la plage des échéances. Un identifiant STABLE tiré de
 * l'identifiant de la tâche : reprogrammer la même tâche doit tomber sur le
 * même emplacement, sinon on empile les doublons à chaque rechargement. */
function empreinte(texte: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const taille = PLAGE_ECHEANCE.fin - PLAGE_ECHEANCE.debut
  return PLAGE_ECHEANCE.debut + (h % taille)
}

/**
 * « 2026-09-05 » + « 14:30 » dans le fuseau de l'appareil.
 *
 * `new Date("2026-09-05T14:30")` marche, mais `new Date("2026-09-05")` est
 * interprété en UTC : la même fonction rendrait deux fuseaux différents
 * selon qu'il y a une heure ou non, et le rappel d'une tâche sans heure
 * partirait avec deux heures d'écart. On construit donc toujours à partir
 * des composants.
 */
export function momentLocal(dateIso: string, heure: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim())
  const h = /^(\d{1,2}):(\d{2})/.exec(heure.trim())
  if (!d || !h) return null
  const [annee, mois, jour] = [Number(d[1]), Number(d[2]), Number(d[3])]
  const moment = new Date(annee, mois - 1, jour, Number(h[1]), Number(h[2]), 0, 0)
  // Le constructeur ne rejette rien : new Date(2026, 12, 45) déborde en
  // silence sur février 2027. Une date fausse programmerait une alarme à un
  // moment absurde, sans erreur nulle part.
  if (
    moment.getFullYear() !== annee ||
    moment.getMonth() !== mois - 1 ||
    moment.getDate() !== jour
  ) {
    return null
  }
  return moment
}

/** L'heure d'une tâche, telle qu'elle est stockée : "20:00" ou "20:00:00". */
function heureDeLaTache(task: Task): string | null {
  if (!task.due_time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(task.due_time.trim())
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null
}

/**
 * Quand faire sonner cette tâche, ou null s'il n'y a rien à programmer.
 *
 * L'avance ne s'applique qu'aux tâches qui ont une heure. Pour une tâche
 * datée sans heure, l'heure choisie dans Paramètres EST le moment du
 * rappel : lui retrancher une avance ferait sonner la veille au soir une
 * tâche dont on n'a jamais dit qu'elle était du matin.
 */
export function momentDeLaTache(task: Task, prefs: PrefsNotifications): Date | null {
  if (task.status !== "todo" || !task.due_date) return null
  const heure = heureDeLaTache(task)
  const base = momentLocal(task.due_date, heure ?? prefs.heureSansHeure)
  if (!base) return null
  if (!heure || prefs.avantMin === 0) return base
  return new Date(base.getTime() - prefs.avantMin * 60_000)
}

/**
 * Est-ce que cette tâche fera sonner quelque chose, et quand ?
 *
 * SA QUESTION, dictée le 5 sept. (chantier 336be5fb) : « Les taches a faire
 * hors cockpit n'ont que des dates decheances, est-ce qu'elles correspondent
 * au rappel qui pourrait lancer a jarvis de me faire un rappel oral par
 * notifications ? Déterminer et régler cette question. »
 *
 * MESURÉ SUR SES 30 TÂCHES OUVERTES le 6 sept. 2026, et c'est la vraie
 * réponse : 22 n'ont AUCUNE date et ne sonneront donc jamais, 4 sont déjà en
 * retard (rien n'est programmé dans le passé — Android les ferait toutes
 * sonner d'un coup à la prochaine ouverture), et 4 seulement déclencheront un
 * rappel. Il ne pouvait pas le savoir : rien ne le disait nulle part.
 *
 * Cette fonction ne calcule RIEN de neuf. Elle passe par `momentDeLaTache`,
 * exactement celle qui programme les alarmes, et se contente d'expliquer son
 * résultat. Deux calculs séparés finiraient par dire deux choses différentes,
 * et c'est l'écran qui mentirait — c'est justement ce qu'on veut éviter.
 */
export type RaisonSansRappel = "faite" | "sans_date" | "passee" | "coupe" | "date_illisible"

export type RappelTache =
  | { sonnera: true; quand: Date; silencieux: boolean }
  | { sonnera: false; raison: RaisonSansRappel }

export function rappelDeLaTache(
  task: Task,
  prefs: PrefsNotifications,
  maintenant: Date,
): RappelTache {
  if (task.status !== "todo") return { sonnera: false, raison: "faite" }
  if (!task.due_date) return { sonnera: false, raison: "sans_date" }
  // Le réglage passe avant tout le reste : coupé, aucune tâche ne sonne, et
  // annoncer une heure serait un mensonge.
  if (!prefs.echeance) return { sonnera: false, raison: "coupe" }

  const quand = momentDeLaTache(task, prefs)
  if (!quand) return { sonnera: false, raison: "date_illisible" }
  if (quand.getTime() <= maintenant.getTime()) return { sonnera: false, raison: "passee" }

  return { sonnera: true, quand, silencieux: dansLaPlageSilencieuse(quand, prefs) }
}

/**
 * Combien de ses tâches feront réellement sonner quelque chose.
 *
 * Sert à répondre une fois pour toutes, dans Paramètres › Notifications, à la
 * question qu'il pose : sur trente tâches, combien me préviendront ?
 */
export interface BilanRappels {
  total: number
  sonneront: number
  sansDate: number
  enRetard: number
  coupe: boolean
}

export function bilanRappels(
  tasks: Task[],
  prefs: PrefsNotifications,
  maintenant: Date,
): BilanRappels {
  const ouvertes = tasks.filter((t) => t.status === "todo")
  let sonneront = 0
  let sansDate = 0
  let enRetard = 0
  for (const task of ouvertes) {
    const rappel = rappelDeLaTache(task, prefs, maintenant)
    if (rappel.sonnera) sonneront++
    else if (rappel.raison === "sans_date") sansDate++
    else if (rappel.raison === "passee") enRetard++
  }
  return { total: ouvertes.length, sonneront, sansDate, enRetard, coupe: !prefs.echeance }
}

/** "14 h 30" — la même façon de dire l'heure que le reste de l'app. */
function heureLisible(d: Date): string {
  return d
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .replace(":", " h ")
    .replace(/ 00$/, "")
}

function corpsEcheance(task: Task, prefs: PrefsNotifications, moment: Date): string {
  const heure = heureDeLaTache(task)
  if (heure && prefs.avantMin > 0) {
    const echeance = momentLocal(task.due_date!, heure)
    if (echeance) return `C'est à ${heureLisible(echeance)}.`
  }
  if (heure) return `C'est maintenant, ${heureLisible(moment)}.`
  return "C'est pour aujourd'hui."
}

/** Minutes depuis minuit, pour comparer deux heures sans se soucier du jour. */
function minutesDuJour(heure: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(heure.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Ce moment tombe-t-il dans la plage silencieuse ?
 *
 * La plage passe minuit dans le cas normal (22:30 → 07:30) : la comparaison
 * naïve « début <= t < fin » serait alors toujours fausse et la nuit
 * sonnerait comme le jour. On teste donc les deux formes, selon que la plage
 * franchit minuit ou non.
 */
export function dansLaPlageSilencieuse(moment: Date, prefs: PrefsNotifications): boolean {
  if (!prefs.silenceNuit) return false
  const debut = minutesDuJour(prefs.silenceDebut)
  const fin = minutesDuJour(prefs.silenceFin)
  if (debut === null || fin === null || debut === fin) return false
  const t = moment.getHours() * 60 + moment.getMinutes()
  return debut < fin ? t >= debut && t < fin : t >= debut || t < fin
}

/**
 * Les rappels d'échéance à venir, les plus proches d'abord.
 *
 * Rien de passé n'est programmé : Android ferait sonner immédiatement toutes
 * les tâches en retard à chaque ouverture de l'app. Le retard est du ressort
 * du point du matin, qui le résume en une fois.
 */
export function planifierEcheances(
  tasks: Task[],
  prefs: PrefsNotifications,
  maintenant: Date,
): NotifPlanifiee[] {
  if (!prefs.echeance) return []

  const pris = new Set<number>()
  const plan: NotifPlanifiee[] = []

  for (const task of tasks) {
    const quand = momentDeLaTache(task, prefs)
    if (!quand || quand.getTime() <= maintenant.getTime()) continue

    // Deux tâches peuvent tomber sur la même empreinte. Sans ce décalage, la
    // seconde écraserait la première en silence — une notification perdue
    // qu'absolument rien ne signalerait.
    let id = empreinte(task.id)
    while (pris.has(id)) id = id + 1 >= PLAGE_ECHEANCE.fin ? PLAGE_ECHEANCE.debut : id + 1
    pris.add(id)

    plan.push({
      id,
      titre: task.title,
      corps: corpsEcheance(task, prefs, quand),
      quand,
      // La nuit, le même rappel part sur un canal muet plutôt que d'être
      // supprimé ou décalé : il est là au réveil, il n'a réveillé personne.
      canal: dansLaPlageSilencieuse(quand, prefs) ? "nuit" : "taches",
      route: "/",
    })
  }

  return plan.sort((a, b) => a.quand.getTime() - b.quand.getTime())
}

/** Les tâches dues ce jour-là (date locale), non faites. */
function tachesDuJour(tasks: Task[], jour: Date): Task[] {
  const iso = isoLocal(jour)
  return tasks.filter((t) => t.status === "todo" && t.due_date === iso)
}

/** "2026-09-05" pour une date locale — toISOString() basculerait sur la
 * veille ou le lendemain selon le fuseau. */
export function isoLocal(d: Date): string {
  const mois = String(d.getMonth() + 1).padStart(2, "0")
  const jour = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mois}-${jour}`
}

/** Le texte du point du matin d'un jour donné. Écrit pour être lu sur un
 * écran verrouillé : le nombre d'abord, les titres ensuite. */
/**
 * Un rendez-vous de son agenda Google, réduit à ce que le point du matin dit.
 *
 * `debut` est l'instant ISO rendu par `google-calendar` ; `journee_entiere`
 * distingue « 9h30 Dupont » de « Congés », qui n'a pas d'heure à annoncer.
 */
export interface RendezVous {
  titre: string
  debut: string | null
  journee_entiere: boolean
}

/** « 9h » ou « 9h30 » — jamais « 09:00 », qui se lit mal dans une phrase. */
function heureCourte(debut: string | null): string {
  if (!debut) return ""
  const d = new Date(debut)
  if (Number.isNaN(d.getTime())) return ""
  const m = d.getMinutes()
  return m === 0 ? `${d.getHours()}h` : `${d.getHours()}h${String(m).padStart(2, "0")}`
}

/**
 * Les rendez-vous, en un morceau de phrase.
 *
 * DEUX NOMS AU PLUS. C'est le corps d'une notification : Android le coupe, et
 * un point du matin qu'on doit déplier n'est plus un point du matin. Le nombre
 * total reste dit, lui — c'est l'information qui compte quand il y en a six.
 */
export function morceauRendezVous(rdv: RendezVous[]): string | null {
  if (rdv.length === 0) return null
  const nommes = rdv.slice(0, 2).map((r) => {
    const h = r.journee_entiere ? "" : heureCourte(r.debut)
    return h ? `${h} ${r.titre}` : r.titre
  })
  const reste = rdv.length - nommes.length
  const liste = reste > 0 ? `${nommes.join(", ")} et ${reste} autre${reste > 1 ? "s" : ""}` : nommes.join(", ")
  return `${rdv.length} rendez-vous : ${liste}`
}

/**
 * Le point du matin : ses tâches du jour, ses rendez-vous, ce qui traîne.
 *
 * LES RENDEZ-VOUS SONT UNE EXCEPTION ASSUMÉE à la règle d'aiguillage, et c'est
 * lui qui l'a écrite : « Chez Google (événement d'agenda, mail) → on ne notifie
 * pas, SAUF DANS LE POINT DU MATIN, qui est un RÉSUMÉ et non une alerte. » Un
 * résumé de la journée sans les rendez-vous n'est pas un résumé de la journée.
 * Ça ne rouvre PAS la notification d'un rendez-vous à l'unité, qu'il a refusée
 * — Google la fait déjà.
 *
 * `rdv` est FACULTATIF, et c'est le point à ne pas défaire : quand l'agenda n'a
 * pas pu être lu — compte non branché, jeton expiré, réseau coupé — on rend
 * exactement le texte d'avant ce chantier. Un point du matin qui manque parce
 * que l'agenda n'a pas répondu serait une régression pour quelqu'un qui ne
 * s'était jamais plaint des tâches.
 */
export function corpsDuMatin(tasks: Task[], jour: Date, rdv: RendezVous[] = []): string {
  const duJour = tachesDuJour(tasks, jour)
  const iso = isoLocal(jour)
  const enRetard = tasks.filter(
    (t) => t.status === "todo" && t.due_date !== null && t.due_date < iso,
  ).length

  const morceaux: string[] = []
  const agenda = morceauRendezVous(rdv)

  if (duJour.length === 0) {
    // « Rien de prévu » à côté de trois rendez-vous serait faux : ce qui n'est
    // vide, c'est la liste des tâches, pas la journée.
    if (!agenda) morceaux.push("Rien de prévu aujourd'hui")
    else morceaux.push("Aucune tâche aujourd'hui")
  } else {
    const titres = duJour.slice(0, 3).map((t) => t.title)
    const reste = duJour.length - titres.length
    const liste = reste > 0 ? `${titres.join(", ")} et ${reste} autre${reste > 1 ? "s" : ""}` : titres.join(", ")
    morceaux.push(`${duJour.length} tâche${duJour.length > 1 ? "s" : ""} aujourd'hui : ${liste}`)
  }

  if (agenda) morceaux.push(agenda)
  if (enRetard > 0) morceaux.push(`${enRetard} en retard`)
  return `${morceaux.join(" · ")}.`
}

/**
 * Les rendez-vous par jour, tels que le plan les attend : la clé est la date
 * LOCALE (`isoLocal`), pas la date UTC. Un rendez-vous à 1 h du matin heure
 * d'Israël tombe la veille en UTC, et serait annoncé le mauvais jour.
 */
export type Agenda = Record<string, RendezVous[]>

/**
 * Range les événements de l'agenda par jour LOCAL.
 *
 * DEUX FORMES À DISTINGUER, et s'y tromper annonce un rendez-vous le mauvais
 * jour : un événement à l'heure porte un instant complet
 * (« 2026-09-07T09:30:00+03:00 »), un événement de journée entière porte une
 * date nue (« 2026-09-07 »). Passer la date nue par `new Date()` la lit en UTC,
 * ce qui la décale d'un jour dès qu'on est à l'ouest de Greenwich — on la prend
 * donc telle quelle.
 *
 * Les événements sans début ne sont pas rangeables : on les laisse de côté
 * plutôt que de les mettre dans un jour au hasard.
 */
export function grouperParJour(evenements: RendezVous[]): Agenda {
  const agenda: Agenda = {}
  for (const e of evenements) {
    if (!e.debut) continue
    const jour = /^\d{4}-\d{2}-\d{2}$/.test(e.debut)
      ? e.debut
      : (() => {
          const d = new Date(e.debut)
          return Number.isNaN(d.getTime()) ? null : isoLocal(d)
        })()
    if (!jour) continue
    ;(agenda[jour] ??= []).push(e)
  }
  // Dans l'ordre de la journée : le point du matin nomme les deux premiers,
  // et « les deux premiers » doit vouloir dire les deux plus proches.
  for (const jour of Object.keys(agenda)) {
    agenda[jour].sort((a, b) => (a.debut ?? "").localeCompare(b.debut ?? ""))
  }
  return agenda
}

/**
 * Le point du matin des prochains jours.
 *
 * Une seule notification qui se répète tous les jours (`repeats`) porterait
 * le même texte pendant des semaines : « 3 tâches aujourd'hui » resterait
 * affiché longtemps après que ces trois tâches ont été faites. On programme
 * donc un matin par jour, avec le contenu réel de CE jour-là, et on
 * reprogramme tout dès que les tâches changent.
 */
export function planifierMatins(
  tasks: Task[],
  prefs: PrefsNotifications,
  maintenant: Date,
  agenda: Agenda = {},
): NotifPlanifiee[] {
  if (!prefs.matin) return []

  const plan: NotifPlanifiee[] = []
  for (let i = 0; i < MATINS_A_PREPARER; i++) {
    const jour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + i)
    const quand = momentLocal(isoLocal(jour), prefs.heureMatin)
    if (!quand || quand.getTime() <= maintenant.getTime()) continue
    plan.push({
      id: PLAGE_MATIN.debut + i,
      titre: "Ton point du matin",
      corps: corpsDuMatin(tasks, jour, agenda[isoLocal(jour)] ?? []),
      quand,
      canal: dansLaPlageSilencieuse(quand, prefs) ? "nuit" : "matin",
      route: "/",
    })
  }
  return plan
}

/**
 * Tout ce qui doit être programmé, dans l'ordre où ça sonnera.
 *
 * Le plafond retient les plus proches : si Raphaël a trois cents tâches
 * datées, ce sont celles de cette semaine qui comptent, pas celles de
 * décembre — elles seront programmées au fil des ouvertures de l'app.
 */
export function construirePlan(
  tasks: Task[],
  prefs: PrefsNotifications,
  maintenant: Date = new Date(),
  agenda: Agenda = {},
): NotifPlanifiee[] {
  return [...planifierEcheances(tasks, prefs, maintenant), ...planifierMatins(tasks, prefs, maintenant, agenda)]
    .sort((a, b) => a.quand.getTime() - b.quand.getTime())
    .slice(0, MAX_PROGRAMMEES)
}

/** Le texte d'une livraison de chantiers, groupée — sa demande : « groupé par
 * session, pas par chantier », une session qui archive six chantiers ne doit
 * pas faire sonner six fois. */
export function corpsChantiersLivres(titres: string[]): string {
  if (titres.length === 1) return titres[0]
  const listes = titres.slice(0, 2).join(", ")
  const reste = titres.length - 2
  return reste > 0 ? `${listes} et ${reste} autre${reste > 1 ? "s" : ""}` : listes
}
