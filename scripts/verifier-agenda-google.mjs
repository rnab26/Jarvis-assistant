/**
 * Vérifie l'agenda Google de bout en bout, sur le compte réellement branché.
 *
 *   node --experimental-strip-types scripts/verifier-agenda-google.mjs
 *
 * Deux étages, et le premier vaut d'être lu même quand le second ne peut pas
 * tourner :
 *
 * 1. LES RÈGLES DE DATES, sans réseau. Le script importe le VRAI fichier
 *    déployé (supabase/functions/google-calendar/dates.ts), pas une copie :
 *    une règle qui change sans que le contrôle bouge se verrait ici.
 *
 * 2. L'ALLER-RETOUR RÉEL avec Google : lire la journée, créer un rendez-vous,
 *    le relire, le décaler, le supprimer, vérifier qu'il a disparu.
 *    L'événement d'essai porte un titre reconnaissable et est supprimé même
 *    si un contrôle échoue en route.
 *
 * POURQUOI C'EST ÉCRIT COMME ÇA. L'étage 2 a besoin du jeton d'accès Google
 * du compte branché, qui vit dans la table `google_tokens` et dure une heure.
 * Le rafraîchir demande GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, qui sont des
 * secrets Supabase et n'ont rien à faire ici. Quand le jeton est périmé, le
 * script le DIT et s'arrête au lieu de faire semblant : il suffit d'ouvrir
 * l'app une fois (l'Edge Function rafraîchit le jeton et le réenregistre)
 * puis de relancer.
 *
 * Écrit le 3 sept. 2026, après trois écarts trouvés sur l'API réelle :
 *   — « qu'est-ce que j'ai demain ? » renvoyait un 400 de Google (timeMin
 *     sans fuseau) ;
 *   — « rendez-vous à 14h » créait un créneau de quatre heures (début local
 *     naïf mêlé à une fin en UTC) ;
 *   — décaler un rendez-vous de deux heures le ramenait à une heure.
 */
import { execFileSync } from "node:child_process"
import { bornes, instant, instantISO } from "../supabase/functions/google-calendar/dates.ts"

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
const TITRE_ESSAI = "Essai Jarvis — suppression automatique"

let echecs = 0
const verifier = (nom, ok, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/** L'heure locale à Jérusalem d'un instant, pour comparer ce qu'il a dicté. */
const heureLocale = (iso) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso))

// ───────────────────────── 1. Les règles, sans réseau ─────────────────────

console.log("— Règles de dates (sans réseau) —")

{
  // Le cas qui cassait : un début local naïf et aucune fin annoncée.
  const b = bornes("2026-09-04T14:00:00")
  const duree = (Date.parse(b.end.dateTime) - Date.parse(b.start.dateTime)) / 60000
  verifier(
    "« rendez-vous à 14h » dure une heure, pas quatre",
    duree === 60,
    `durée obtenue : ${duree} min — ${b.start.dateTime} → ${b.end.dateTime}`,
  )
  verifier(
    "14h dicté reste 14h à Jérusalem",
    heureLocale(b.start.dateTime).endsWith("14:00"),
    `heure locale obtenue : ${heureLocale(b.start.dateTime)}`,
  )
}

{
  // Israël passe à l'heure d'été : le décalage ne peut pas être codé en dur.
  const ete = bornes("2026-07-15T09:00:00")
  const hiver = bornes("2026-12-15T09:00:00")
  verifier(
    "9h reste 9h été comme hiver (changement d'heure)",
    heureLocale(ete.start.dateTime).endsWith("09:00") &&
      heureLocale(hiver.start.dateTime).endsWith("09:00"),
    `été ${heureLocale(ete.start.dateTime)} / hiver ${heureLocale(hiver.start.dateTime)}`,
  )
  verifier(
    "et le décalage réel diffère bien entre les deux",
    ete.start.dateTime.slice(11, 13) !== hiver.start.dateTime.slice(11, 13),
    "l'été et l'hiver donnent le même instant UTC : le fuseau est figé quelque part",
  )
}

{
  const b = bornes("2026-09-12", "2026-09-14", true)
  verifier(
    "« du 12 au 14 » en journée entière inclut le 14",
    b.start.date === "2026-09-12" && b.end.date === "2026-09-15",
    `obtenu : ${b.start.date} → ${b.end.date} (end.date est exclusif chez Google)`,
  )
  const seul = bornes("2026-09-12", null, true)
  verifier(
    "une journée entière seule tient sur un jour",
    seul.end.date === "2026-09-13",
    `obtenu : ${seul.start.date} → ${seul.end.date}`,
  )
}

{
  verifier(
    "une date déjà datée d'un fuseau n'est pas retouchée",
    instantISO("2026-09-04T14:00:00Z") === "2026-09-04T14:00:00.000Z",
    `obtenu : ${instantISO("2026-09-04T14:00:00Z")}`,
  )
  verifier(
    "une date illisible est refusée, pas devinée",
    instantISO("demain vers midi") === null && bornes("n'importe quoi") === null,
    "une date illisible devrait donner null",
  )
}

// ────────────────────── 2. L'aller-retour avec Google ─────────────────────

console.log("\n— Aller-retour réel avec Google —")

const sql = (q) =>
  JSON.parse(execFileSync("scripts/sql.sh", [q], { encoding: "utf8" })).rows ?? []

const [compte] = sql(
  "select ga.user_id, ga.email, gt.access_token, gt.expires_at" +
    " from google_accounts ga join google_tokens gt on gt.user_id = ga.user_id limit 1",
)

if (!compte) {
  console.log("Aucun compte Google branché : rien à vérifier côté Google.")
  console.log(`\n${echecs} échec(s) sur les règles de dates.`)
  process.exit(echecs ? 1 : 0)
}

if (new Date(compte.expires_at).getTime() <= Date.now()) {
  console.log(
    `Le jeton d'accès de ${compte.email} a expiré le ${compte.expires_at}.\n` +
      "Ouvre l'app une fois (n'importe quelle commande d'agenda) : l'Edge\n" +
      "Function le rafraîchit et le réenregistre, puis relance ce script.\n" +
      "Le rafraîchir ici demanderait GOOGLE_CLIENT_SECRET, qui reste côté Supabase.",
  )
  console.log(`\n${echecs} échec(s) sur les règles de dates ; Google non vérifié.`)
  process.exit(2)
}

const entetes = {
  Authorization: `Bearer ${compte.access_token}`,
  "Content-Type": "application/json",
}
console.log(`Compte : ${compte.email}`)

let idEssai = null
try {
  // — lire sa journée, exactement comme le fait l'action list —
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "10",
    timeMin: instantISO(`${demain}T00:00:00`),
    timeMax: instantISO(`${demain}T23:59:59`),
    timeZone: "Asia/Jerusalem",
  })
  const rList = await fetch(`${API}?${params}`, { headers: entetes })
  verifier(
    "lire une journée avec des heures locales (« qu'est-ce que j'ai demain ? »)",
    rList.ok,
    `Google a répondu ${rList.status} : ${JSON.stringify(await rList.clone().json()).slice(0, 200)}`,
  )

  // — créer « demain à 14h », sans fin annoncée —
  const debutDicte = `${demain}T14:00:00`
  const dates = bornes(debutDicte)
  const rCreate = await fetch(API, {
    method: "POST",
    headers: entetes,
    body: JSON.stringify({ summary: TITRE_ESSAI, ...dates }),
  })
  const cree = await rCreate.json()
  verifier("créer un rendez-vous", rCreate.ok && !!cree.id, JSON.stringify(cree).slice(0, 300))
  if (!cree.id) throw new Error("création impossible, on ne peut pas continuer")
  idEssai = cree.id

  // — le relire chez Google : c'est Google qui doit dire 14h, pas nous —
  const relu = await (await fetch(`${API}/${cree.id}`, { headers: entetes })).json()
  verifier(
    "Google le place bien à 14h heure d'Israël",
    heureLocale(relu.start.dateTime).endsWith("14:00"),
    `Google renvoie ${relu.start.dateTime} = ${heureLocale(relu.start.dateTime)}`,
  )
  const dureeRelue = (Date.parse(relu.end.dateTime) - Date.parse(relu.start.dateTime)) / 60000
  verifier(
    "et lui donne une heure, pas quatre",
    dureeRelue === 60,
    `durée vue par Google : ${dureeRelue} min`,
  )

  // — le retrouver par son intitulé, comme « quand est-ce que je vois … ? » —
  const q = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "10",
    timeMin: instantISO(`${demain}T00:00:00`),
    q: "Essai Jarvis",
  })
  const trouve = await (await fetch(`${API}?${q}`, { headers: entetes })).json()
  verifier(
    "le retrouver par son intitulé",
    (trouve.items ?? []).some((e) => e.id === cree.id),
    `${(trouve.items ?? []).length} résultat(s), aucun ne correspond`,
  )

  // — le décaler à 16h sans annoncer de durée : elle doit être conservée —
  const dureeAvant = Date.parse(relu.end.dateTime) - Date.parse(relu.start.dateTime)
  const nouveauDebut = instant(`${demain}T16:00:00`)
  const rPatch = await fetch(`${API}/${cree.id}`, {
    method: "PATCH",
    headers: entetes,
    body: JSON.stringify(
      bornes(`${demain}T16:00:00`, new Date(nouveauDebut.getTime() + dureeAvant).toISOString()),
    ),
  })
  const modifie = await rPatch.json()
  verifier(
    "le décaler à 16h",
    rPatch.ok && heureLocale(modifie.start.dateTime).endsWith("16:00"),
    `Google renvoie ${modifie.start?.dateTime} = ${heureLocale(modifie.start?.dateTime ?? 0)}`,
  )
  verifier(
    "le décalage ne raccourcit pas le rendez-vous",
    Date.parse(modifie.end.dateTime) - Date.parse(modifie.start.dateTime) === dureeAvant,
    `durée après décalage : ${
      (Date.parse(modifie.end.dateTime) - Date.parse(modifie.start.dateTime)) / 60000
    } min au lieu de ${dureeAvant / 60000}`,
  )
} finally {
  // — le supprimer, quoi qu'il soit arrivé plus haut —
  if (idEssai) {
    const rDel = await fetch(`${API}/${idEssai}`, { method: "DELETE", headers: entetes })
    verifier("supprimer le rendez-vous", rDel.ok || rDel.status === 410, `HTTP ${rDel.status}`)
    const apres = await fetch(`${API}/${idEssai}`, { headers: entetes })
    const corps = apres.ok ? await apres.json() : null
    verifier(
      "il a bien disparu de l'agenda",
      !apres.ok || corps?.status === "cancelled",
      `il répond encore ${apres.status} avec le statut ${corps?.status}`,
    )
  }
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs ? 1 : 0)
