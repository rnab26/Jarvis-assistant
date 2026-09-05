/**
 * Vérifie ce que Jarvis programmera comme notifications.
 *
 *   node --experimental-strip-types scripts/verifier-notifications.ts
 *
 * Aucun réseau, aucun téléphone. Tout ce qui peut être FAUX sans que ça se
 * voie est ici : un rappel programmé dans le passé (Android le ferait sonner
 * immédiatement, en rafale, à chaque ouverture de l'app), une tâche faite qui
 * sonne quand même, deux tâches qui tombent sur le même identifiant et dont
 * une disparaît en silence, une avance appliquée à une tâche sans heure, et
 * le décalage d'un jour dû au fuseau. Le moment de référence est injecté :
 * un contrôle de date qui dépend de l'heure à laquelle on le lance ne vaut
 * rien.
 *
 * Ce que ce script NE PEUT PAS vérifier, et qui ne se voit que sur
 * l'appareil : la permission Android, la création des canaux, et le fait que
 * l'alarme sonne vraiment. C'est le rôle du bouton « Tester » de Paramètres.
 */
import {
  construirePlan,
  dansLaPlageSilencieuse,
  corpsChantiersLivres,
  corpsDuMatin,
  estNotreNotif,
  ID_TEST,
  isoLocal,
  momentDeLaTache,
  MAX_PROGRAMMEES,
  PLAGE_ECHEANCE,
  planifierEcheances,
  planifierMatins,
} from "../src/lib/notifications/plan.ts"
import { phraseAnnonce, raisonDuSilence } from "../src/lib/notifications/annonceVocale.ts"
import { normaliserPrefs, PREFS_NOTIFS_DEFAUT } from "../src/lib/notifications/prefs.ts"
import type { PrefsNotifications } from "../src/lib/notifications/prefs.ts"
import type { Task } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/** Un jeudi, 14 h 30 — rien de limite, les cas limites sont plus bas. */
const MAINTENANT = new Date(2026, 8, 3, 14, 30)

let compteur = 0
function tache(partiel: Partial<Task>): Task {
  compteur++
  return {
    id: `tache-${compteur}`,
    user_id: "u",
    category_id: null,
    title: `Tâche ${compteur}`,
    notes: null,
    due_date: null,
    due_time: null,
    status: "todo",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...partiel,
  }
}

// ---------------------------------------------------------------- échéances

{
  const t = tache({ due_date: "2026-09-03", due_time: "18:00" })
  const moment = momentDeLaTache(t, PREFS_NOTIFS_DEFAUT)
  verifier(
    "une tâche avec heure sonne à l'heure dite",
    moment?.getHours() === 18 && moment?.getMinutes() === 0 && moment?.getDate() === 3,
    `obtenu ${moment?.toString()}`,
  )
}

{
  const t = tache({ due_date: "2026-09-03", due_time: "18:00:00" })
  const moment = momentDeLaTache(t, { ...PREFS_NOTIFS_DEFAUT, avantMin: 60 })
  verifier(
    "l'avance d'une heure s'applique (et « 18:00:00 » se lit comme « 18:00 »)",
    moment?.getHours() === 17 && moment?.getMinutes() === 0,
    `obtenu ${moment?.toString()}`,
  )
}

{
  const t = tache({ due_date: "2026-09-04" })
  const moment = momentDeLaTache(t, { ...PREFS_NOTIFS_DEFAUT, avantMin: 180 })
  verifier(
    "une tâche SANS heure ignore l'avance et sonne à l'heure réglée",
    moment?.getHours() === 9 && moment?.getMinutes() === 0 && moment?.getDate() === 4,
    `obtenu ${moment?.toString()} — l'avance ferait sonner la veille au soir une tâche dont on n'a jamais dit qu'elle était du matin`,
  )
}

{
  const faite = tache({ due_date: "2026-09-10", due_time: "10:00", status: "done" })
  verifier("une tâche faite ne sonne pas", momentDeLaTache(faite, PREFS_NOTIFS_DEFAUT) === null)
  const sansDate = tache({})
  verifier("une tâche sans date ne sonne pas", momentDeLaTache(sansDate, PREFS_NOTIFS_DEFAUT) === null)
  const dateFausse = tache({ due_date: "2026-13-45", due_time: "10:00" })
  verifier(
    "une date impossible ne programme rien",
    momentDeLaTache(dateFausse, PREFS_NOTIFS_DEFAUT) === null,
    "new Date(2026, 12, 45) déborde en silence sur février 2027",
  )
}

{
  const passee = tache({ due_date: "2026-09-03", due_time: "09:00" })
  const future = tache({ due_date: "2026-09-03", due_time: "20:00" })
  const plan = planifierEcheances([passee, future], PREFS_NOTIFS_DEFAUT, MAINTENANT)
  verifier(
    "rien de passé n'est programmé",
    plan.length === 1 && plan[0].quand.getHours() === 20,
    `${plan.length} notification(s) — Android ferait sonner tout le retard d'un coup à chaque ouverture`,
  )
}

{
  const plan = planifierEcheances(
    [tache({ due_date: "2026-09-05", due_time: "10:00" })],
    { ...PREFS_NOTIFS_DEFAUT, echeance: false },
    MAINTENANT,
  )
  verifier("l'interrupteur « échéance » coupe vraiment", plan.length === 0)
}

{
  // Deux tâches, mille fois : les identifiants doivent rester distincts et
  // stables. Une collision non traitée ferait disparaître une notification
  // sans que rien ne le signale.
  const taches = Array.from({ length: 60 }, (_, i) =>
    tache({ due_date: "2026-09-20", due_time: `${String(6 + (i % 12)).padStart(2, "0")}:00` }),
  )
  const plan = planifierEcheances(taches, PREFS_NOTIFS_DEFAUT, MAINTENANT)
  const ids = new Set(plan.map((n) => n.id))
  verifier(
    "aucune collision d'identifiant sur 60 tâches",
    ids.size === plan.length,
    `${plan.length} notifications pour ${ids.size} identifiants`,
  )
  verifier(
    "tous les identifiants sont dans notre plage",
    plan.every((n) => estNotreNotif(n.id) && n.id >= PLAGE_ECHEANCE.debut && n.id < PLAGE_ECHEANCE.fin),
  )
  const rejoue = planifierEcheances(taches, PREFS_NOTIFS_DEFAUT, MAINTENANT)
  verifier(
    "les identifiants sont stables d'un calcul à l'autre",
    rejoue.map((n) => n.id).join() === plan.map((n) => n.id).join(),
    "sinon chaque rechargement empilerait des doublons au lieu de remplacer",
  )
}

// ---------------------------------------------------------- heures de silence

{
  // La plage par défaut passe minuit : 22:30 -> 07:30. C'est le cas où une
  // comparaison naïve « début <= t < fin » est toujours fausse, et où la
  // nuit sonnerait comme le jour sans que rien ne le signale.
  const cas: [string, number, number, boolean][] = [
    ["23 h 00, en pleine nuit", 23, 0, true],
    ["02 h 00, après minuit", 2, 0, true],
    ["07 h 29, juste avant la fin", 7, 29, true],
    ["07 h 30, à la fin pile", 7, 30, false],
    ["22 h 30, au début pile", 22, 30, true],
    ["22 h 29, juste avant", 22, 29, false],
    ["14 h 00, en plein jour", 14, 0, false],
  ]
  for (const [nom, h, min, attendu] of cas) {
    const moment = new Date(2026, 8, 3, h, min)
    verifier(
      `plage silencieuse : ${nom}`,
      dansLaPlageSilencieuse(moment, PREFS_NOTIFS_DEFAUT) === attendu,
    )
  }

  verifier(
    "l'interrupteur des heures de silence coupe vraiment",
    !dansLaPlageSilencieuse(new Date(2026, 8, 3, 23, 0), {
      ...PREFS_NOTIFS_DEFAUT,
      silenceNuit: false,
    }),
  )

  // Une plage qui NE passe PAS minuit (sieste) doit marcher aussi.
  const sieste = { ...PREFS_NOTIFS_DEFAUT, silenceDebut: "13:00", silenceFin: "15:00" }
  verifier(
    "une plage dans la même journée fonctionne aussi",
    dansLaPlageSilencieuse(new Date(2026, 8, 3, 14, 0), sieste) &&
      !dansLaPlageSilencieuse(new Date(2026, 8, 3, 23, 0), sieste),
  )

  verifier(
    "une plage vide (début = fin) ne fait taire personne",
    !dansLaPlageSilencieuse(new Date(2026, 8, 3, 23, 0), {
      ...PREFS_NOTIFS_DEFAUT,
      silenceDebut: "22:00",
      silenceFin: "22:00",
    }),
    "sinon on ne saurait pas si « de 22 h à 22 h » veut dire rien ou toute la journée",
  )
}

{
  // Ce qui compte vraiment : le rappel EXISTE toujours, il change juste de
  // canal. Le supprimer ou le décaler ferait manquer une échéance.
  const nuit = tache({ due_date: "2026-09-03", due_time: "23:30" })
  const jour = tache({ due_date: "2026-09-03", due_time: "18:00" })
  const plan = planifierEcheances([nuit, jour], PREFS_NOTIFS_DEFAUT, MAINTENANT)
  verifier(
    "un rappel de nuit est programmé quand même, sur le canal muet",
    plan.length === 2 &&
      plan.find((n) => n.quand.getHours() === 23)?.canal === "nuit" &&
      plan.find((n) => n.quand.getHours() === 18)?.canal === "taches",
    `obtenu ${JSON.stringify(plan.map((n) => [n.quand.getHours(), n.canal]))}`,
  )
}

// ------------------------------------------------------------ point du matin

{
  const matins = planifierMatins([], PREFS_NOTIFS_DEFAUT, MAINTENANT)
  verifier(
    "le point du matin d'aujourd'hui (09:15, déjà passé) n'est pas reprogrammé",
    matins.length === 6 && matins[0].quand.getDate() === 4,
    `${matins.length} matins, premier le ${matins[0]?.quand.toString()}`,
  )
  verifier(
    "chaque matin est à l'heure réglée",
    matins.every((m) => m.quand.getHours() === 9 && m.quand.getMinutes() === 15),
  )
}

{
  const tot = planifierMatins([], { ...PREFS_NOTIFS_DEFAUT, heureMatin: "23:00" }, MAINTENANT)
  verifier(
    "une heure encore à venir aujourd'hui compte pour aujourd'hui",
    tot.length === 7 && tot[0].quand.getDate() === 3,
    `${tot.length} matins, premier le ${tot[0]?.quand.toString()}`,
  )
}

{
  const matins = planifierMatins([], { ...PREFS_NOTIFS_DEFAUT, matin: false }, MAINTENANT)
  verifier("l'interrupteur « point du matin » coupe vraiment", matins.length === 0)
}

{
  const jour = new Date(2026, 8, 4)
  const corps = corpsDuMatin(
    [
      tache({ due_date: "2026-09-04", title: "Appeler le notaire" }),
      tache({ due_date: "2026-09-04", title: "Signer le bail" }),
      tache({ due_date: "2026-09-01", title: "Vieux truc" }),
      tache({ due_date: "2026-09-04", title: "Déjà fait", status: "done" }),
    ],
    jour,
  )
  verifier(
    "le point du matin compte les tâches du jour et le retard",
    corps.includes("2 tâches aujourd'hui") &&
      corps.includes("Appeler le notaire") &&
      corps.includes("1 en retard") &&
      !corps.includes("Déjà fait"),
    `obtenu : ${corps}`,
  )
  verifier(
    "un jour vide se dit, il ne reste pas muet",
    corpsDuMatin([], jour) === "Rien de prévu aujourd'hui.",
    `obtenu : ${corpsDuMatin([], jour)}`,
  )
}

{
  const beaucoup = Array.from({ length: 6 }, (_, i) =>
    tache({ due_date: "2026-09-04", title: `T${i}` }),
  )
  const corps = corpsDuMatin(beaucoup, new Date(2026, 8, 4))
  verifier(
    "au-delà de trois tâches, le texte reste lisible sur un écran verrouillé",
    corps.includes("et 3 autres") && corps.length < 120,
    `obtenu : ${corps}`,
  )
}

// ------------------------------------------------------------------ le plan

{
  const taches = Array.from({ length: 200 }, (_, i) =>
    tache({ due_date: `2026-${String(9 + Math.floor(i / 28)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, due_time: "10:00" }),
  )
  const plan = construirePlan(taches, PREFS_NOTIFS_DEFAUT, MAINTENANT)
  verifier(
    "le plan est plafonné et trié par ordre de sonnerie",
    plan.length === MAX_PROGRAMMEES &&
      plan.every((n, i) => i === 0 || n.quand.getTime() >= plan[i - 1].quand.getTime()),
    `${plan.length} notifications`,
  )
  verifier(
    "rien dans le plan n'est daté du passé",
    plan.every((n) => n.quand.getTime() > MAINTENANT.getTime()),
  )
}

// ------------------------------------------------------------------- fuseau

{
  // toISOString() rendrait la veille pour un fuseau à l'ouest de Greenwich.
  const minuitPasse = new Date(2026, 8, 4, 0, 30)
  verifier(
    "la date locale ne recule pas d'un jour juste après minuit",
    isoLocal(minuitPasse) === "2026-09-04",
    `obtenu ${isoLocal(minuitPasse)}`,
  )
}

// --------------------------------------------------------------- groupement

{
  verifier(
    "une seule livraison se nomme, plusieurs se résument",
    corpsChantiersLivres(["A"]) === "A" &&
      corpsChantiersLivres(["A", "B", "C", "D"]) === "A, B et 2 autres",
    `obtenu « ${corpsChantiersLivres(["A", "B", "C", "D"])} »`,
  )
}

// ---------------------------------------------------------------- réglages

{
  verifier(
    "un réglage abîmé retombe sur les valeurs par défaut sans planter",
    JSON.stringify(normaliserPrefs({ heureMatin: "25:99", avantMin: 7, matin: "oui" })) ===
      JSON.stringify(PREFS_NOTIFS_DEFAUT),
    `obtenu ${JSON.stringify(normaliserPrefs({ heureMatin: "25:99", avantMin: 7, matin: "oui" }))}`,
  )
  verifier(
    "un réglage valide est conservé tel quel",
    normaliserPrefs({ ...PREFS_NOTIFS_DEFAUT, heureMatin: "07:45", avantMin: 60 }).heureMatin ===
      "07:45",
  )
  verifier("l'identifiant de test nous appartient", estNotreNotif(ID_TEST))
  verifier("un identifiant étranger n'est jamais annulé par nous", !estNotreNotif(42))
}

// ── Ce que Jarvis DIT quand une notification arrive (chantier 7567cd47) ──
// Quatre façons de rendre cette annonce nuisible, et aucune ne lève d'erreur :
// parler la nuit, parler alors qu'il a coupé la voix, parler quand il a dit
// non, et répéter deux fois la même phrase.
{
  const base: PrefsNotifications = { ...PREFS_NOTIFS_DEFAUT, direAVoixHaute: true }
  const jour = new Date("2026-09-05T14:00:00")
  const nuit = new Date("2026-09-05T03:00:00")
  const dire = (
    notif: { title?: string | null; body?: string | null },
    p: Partial<PrefsNotifications> = {},
    voixCoupee = false,
    maintenant = jour,
  ) => phraseAnnonce(notif, { prefs: { ...base, ...p }, voixCoupee, maintenant })

  verifier(
    "un rappel arrivé pendant que l'app est ouverte se dit",
    dire({ title: "Appeler le plombier", body: "C'est l'heure." }) ===
      "Appeler le plombier. C'est l'heure.",
    String(dire({ title: "Appeler le plombier", body: "C'est l'heure." })),
  )
  verifier(
    "le corps qui reprend le titre ne le fait pas répéter",
    dire({ title: "Appeler le plombier", body: "Appeler le plombier, c'est l'heure." }) ===
      "Appeler le plombier, c'est l'heure.",
    String(dire({ title: "Appeler le plombier", body: "Appeler le plombier, c'est l'heure." })),
  )
  verifier(
    "l'interrupteur de Paramètres fait taire l'annonce",
    dire({ title: "Appeler le plombier" }, { direAVoixHaute: false }) === null,
  )
  verifier(
    "voix de Jarvis coupée : on n'annonce rien non plus",
    dire({ title: "Appeler le plombier" }, {}, true) === null,
    "le réglage de voix vaut pour tout ce que Jarvis dit",
  )
  verifier(
    "pendant les heures de silence, la notification s'affiche mais ne se dit pas",
    dire({ title: "Appeler le plombier" }, {}, false, nuit) === null,
    "une voix à 3 h du matin réveille exactement ce que le canal muet protégeait",
  )
  verifier(
    "sauf s'il a désactivé les heures de silence",
    dire({ title: "Appeler le plombier" }, { silenceNuit: false }, false, nuit) ===
      "Appeler le plombier",
  )
  verifier(
    "une notification vide ne fait rien dire",
    dire({ title: "  ", body: null }) === null,
  )
  // La RAISON du silence part dans le journal d'écoute : sans elle, une
  // annonce muette sur son téléphone serait indistinguable, vue d'ici, d'une
  // annonce jamais déclenchée.
  const pourquoi = (
    notif: { title?: string | null; body?: string | null },
    p: Partial<PrefsNotifications> = {},
    voixCoupee = false,
    maintenant = jour,
  ) => raisonDuSilence(notif, { prefs: { ...base, ...p }, voixCoupee, maintenant })

  verifier(
    "quand il parle, aucune raison de se taire n'est écrite",
    pourquoi({ title: "Appeler le plombier" }) === null,
  )
  for (const [attendu, p, coupee, quand] of [
    ["desactive", { direAVoixHaute: false }, false, jour],
    ["voix_coupee", {}, true, jour],
    ["heures_de_silence", {}, false, nuit],
    ["rien_a_dire", {}, false, jour],
  ] as [string, Partial<PrefsNotifications>, boolean, Date][]) {
    const notif = attendu === "rien_a_dire" ? { title: " " } : { title: "Appeler le plombier" }
    verifier(
      `le journal dira « ${attendu} »`,
      pourquoi(notif, p, coupee, quand) === attendu,
      String(pourquoi(notif, p, coupee, quand)),
    )
  }

  const long = dire({ title: "Point du matin", body: "x".repeat(900) })
  verifier(
    "un point du matin très chargé est écourté, pas lu pendant une minute",
    !!long && long.length <= 600 && long.endsWith("…"),
    `${long?.length} caractères`,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
