/**
 * Vérifie que la règle des heures de silence ne diverge pas entre le
 * TypeScript (src/lib/notifications/plan.ts) et son port Java
 * (PlageSilencieuse.java), sans réseau ni Android.
 *
 *   node --experimental-strip-types scripts/verifier-annonce-native.ts
 *
 * POURQUOI CETTE DUPLICATION EXISTE (chantier 23ee3735, décision du 7 sept.
 * 2026 au soir, dev_log) : parler à voix haute quand l'app est FERMÉE doit se
 * décider depuis JarvisNotificationListenerService, qui tourne que la
 * WebView soit vivante ou non — le TypeScript, lui, ne s'exécute que pendant
 * que l'app JS tourne. Porter dansLaPlageSilencieuse en Java était le
 * compromis accepté ; CE CONTRÔLE EST LA VRAIE GARANTIE, pas l'unicité du
 * code. S'il devient rouge, les deux moteurs disent des choses différentes
 * de la même heure — corrige le Java pour rejoindre le TypeScript, jamais
 * l'inverse (le TypeScript reste la référence, déjà vérifié ailleurs).
 */
import { readFileSync } from "node:fs"
import { dansLaPlageSilencieuse } from "../src/lib/notifications/plan.ts"
import { PREFS_NOTIFS_DEFAUT, type PrefsNotifications } from "../src/lib/notifications/prefs.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ---------------------------------------------------------------------------
// Le même algorithme que PlageSilencieuse.java, transcrit ici pour comparer.
// Toute divergence entre ce bloc et le fichier Java doit être visible au
// contrôle "le fichier Java suit bien cet algorithme" plus bas.
// ---------------------------------------------------------------------------
function minutesDuJourJava(heure: string | null): number | null {
  if (heure === null) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(heure.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function dansLaPlageSilencieuseJava(
  moment: Date,
  silenceNuit: boolean,
  silenceDebut: string,
  silenceFin: string,
): boolean {
  if (!silenceNuit) return false
  const debut = minutesDuJourJava(silenceDebut)
  const fin = minutesDuJourJava(silenceFin)
  if (debut === null || fin === null || debut === fin) return false
  const t = moment.getHours() * 60 + moment.getMinutes()
  return debut < fin ? t >= debut && t < fin : t >= debut || t < fin
}

function prefs(partiel: Partial<PrefsNotifications>): PrefsNotifications {
  return { ...PREFS_NOTIFS_DEFAUT, ...partiel }
}

// ---------------------------------------------------------------------------
// Les deux moteurs doivent s'accorder sur un grand nombre de cas, y compris
// les bords : minuit, la plage qui passe minuit, désactivée, des chaînes
// invalides, début == fin.
// ---------------------------------------------------------------------------

const cas: Array<{ heure: string; nuit: boolean; debut: string; fin: string }> = []
for (let h = 0; h < 24; h++) {
  for (const m of [0, 1, 29, 30, 31, 59]) {
    const heure = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    cas.push({ heure, nuit: true, debut: "22:30", fin: "07:30" }) // passe minuit
    cas.push({ heure, nuit: true, debut: "13:00", fin: "14:00" }) // ne passe pas minuit
    cas.push({ heure, nuit: false, debut: "22:30", fin: "07:30" }) // désactivée
    cas.push({ heure, nuit: true, debut: "22:30", fin: "22:30" }) // début == fin
  }
}
// Des chaînes invalides, telles qu'un réglage corrompu pourrait en produire.
for (const invalide of ["", "25:99", "midi", "7:5"]) {
  cas.push({ heure: "23:00", nuit: true, debut: invalide, fin: "07:30" })
  cas.push({ heure: "23:00", nuit: true, debut: "22:30", fin: invalide })
}

let divergences = 0
for (const c of cas) {
  const [hh, mm] = c.heure.split(":").map(Number)
  const moment = new Date(2026, 8, 7, hh, mm, 0)
  const p = prefs({ silenceNuit: c.nuit, silenceDebut: c.debut, silenceFin: c.fin })
  const ts = dansLaPlageSilencieuse(moment, p)
  const java = dansLaPlageSilencieuseJava(moment, c.nuit, c.debut, c.fin)
  if (ts !== java) {
    divergences++
    if (divergences <= 5) {
      console.log(
        `      divergence à ${c.heure} (nuit=${c.nuit}, ${c.debut}->${c.fin}) : TS=${ts} Java=${java}`,
      )
    }
  }
}
verifier(
  `le port Java s'accorde avec le TypeScript sur ${cas.length} cas`,
  divergences === 0,
  `${divergences} divergence(s) — voir le détail ci-dessus`,
)

// ---------------------------------------------------------------------------
// Essayé à l'envers : une transcription volontairement fausse doit être
// détectée par CE contrôle, sinon il ne garantit rien.
// ---------------------------------------------------------------------------
function dansLaPlageSilencieuseFaux(
  moment: Date,
  silenceNuit: boolean,
  silenceDebut: string,
  silenceFin: string,
): boolean {
  if (!silenceNuit) return false
  const debut = minutesDuJourJava(silenceDebut)
  const fin = minutesDuJourJava(silenceFin)
  if (debut === null || fin === null) return false
  const t = moment.getHours() * 60 + moment.getMinutes()
  // Faute volontaire : ignore le passage par minuit.
  return t >= debut && t < fin
}
{
  const moment = new Date(2026, 8, 7, 23, 0, 0) // 23h, plage 22:30 -> 07:30
  const vrai = dansLaPlageSilencieuse(moment, prefs({ silenceNuit: true }))
  const faux = dansLaPlageSilencieuseFaux(moment, true, "22:30", "07:30")
  verifier(
    "le contrôle détecterait une transcription fausse (passage par minuit ignoré)",
    vrai !== faux,
    "si ce contrôle passe, le contrôle ci-dessus ne garantit rien",
  )
}

// ---------------------------------------------------------------------------
// Le fichier Java suit bien CET algorithme — lecture du code, pas exécution
// (aucun SDK Android ici).
// ---------------------------------------------------------------------------
const java = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/PlageSilencieuse.java",
  "utf8",
)
verifier(
  "PlageSilencieuse.java retourne false si silenceNuit est faux",
  /if \(!silenceNuit\) return false;/.test(java),
)
verifier(
  "et compare avec le même opérateur selon que la plage passe minuit ou non",
  /debut < fin \? \(t >= debut && t < fin\) : \(t >= debut \|\| t < fin\)/.test(java),
  "c'est la ligne qui gère « 22:30 -> 07:30 » — une divergence ici passerait inaperçue sans ce contrôle",
)

// ---------------------------------------------------------------------------
// Le reste du mécanisme : la règle ne s'applique QU'à nos propres
// notifications, jamais à celles d'une autre application.
// ---------------------------------------------------------------------------
const listener = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/JarvisNotificationListenerService.java",
  "utf8",
)
verifier(
  "onNotificationPosted ne traite QUE notre propre paquet",
  /getPackageName\(\)\.equals\(sbn\.getPackageName\(\)\)/.test(listener) &&
    /AnnonceApresNotification\.considerer/.test(listener),
  "sinon on retomberait dans la surveillance des autres apps, exactement ce que la règle 1 interdit",
)

const decision = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/AnnonceApresNotification.java",
  "utf8",
)
verifier(
  "rien ne se dit si le service n'est pas actif",
  /AnnonceService\.actif\(\)/.test(decision) && /if \(service == null\) return;/.test(decision),
)
verifier(
  "rien ne se dit si l'app est au premier plan (évite le doublon avec le chemin JS)",
  /MainActivity\.auPremierPlan/.test(decision),
  "sinon la même phrase serait dite deux fois quand l'app est ouverte",
)
verifier(
  "la même notification n'est jamais redite deux fois de suite",
  /derniereCle/.test(decision),
)
verifier(
  "les trois raisons de se taire sont dans le bon ordre : activé, voix coupée, heures de silence",
  (() => {
    const iActif = decision.indexOf("if (!direAVoixHaute)")
    const iVoix = decision.indexOf("if (voixCoupee)")
    const iNuit = decision.indexOf("dansLaPlageSilencieuse(")
    return iActif > 0 && iActif < iVoix && iVoix < iNuit
  })(),
)

const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")
verifier(
  "AnnonceService est déclaré avec son type de service spécial",
  /<service\s+android:name="\.AnnonceService"[\s\S]{0,200}?PROPERTY_SPECIAL_USE_FGS_SUBTYPE/.test(
    manifest,
  ),
)

const mainActivity = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/MainActivity.java",
  "utf8",
)
verifier(
  "le plugin est enregistré",
  /registerPlugin\(AnnonceNativePlugin\.class\)/.test(mainActivity),
)
verifier(
  "auPremierPlan suit vraiment le cycle de vie de l'activité",
  /onResume[\s\S]{0,80}auPremierPlan = true/.test(mainActivity) &&
    /onPause[\s\S]{0,80}auPremierPlan = false/.test(mainActivity),
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
