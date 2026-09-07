/**
 * Jarvis répond à la question posée, et sait ce qui attend une décision.
 *
 *   node --experimental-strip-types scripts/verifier-question-posee.ts
 *
 * Trois choses, et la troisième est celle qui casse en silence :
 *
 * 1. le bloc « ce qui l'attend » dit ce qu'il faut, et SE TAIT quand il n'y a
 *    rien — un titre suivi de rien coûte des jetons à chaque phrase et apprend
 *    au modèle à annoncer des listes vides ;
 * 2. la consigne arrive bien dans les DEUX consignes, celle du micro et celle
 *    du mode Live — une règle écrite dans une seule serait vraie d'un côté et
 *    fausse de l'autre, comme c'est déjà arrivé pour l'honnêteté ;
 * 3. la règle « à qui s'adresse ce message » rend le MÊME verdict côté app et
 *    côté serveur. Ce sont deux fichiers distincts (une Edge Function ne peut
 *    pas importer `src/`), donc deux occasions de diverger — et le jour où
 *    elles divergent, le cockpit compte ce qui ne sonne pas.
 */
import { readFileSync } from "node:fs"
import { formaterCeQuiLAttend, depuisQuand, MAX_POINTS } from "../supabase/functions/_shared/ceQuiLAttend.ts"
import { CONSIGNE_QUESTION_POSEE } from "../supabase/functions/_shared/questionPosee.ts"
import {
  enAttenteDeRaphael as enAttenteServeur,
  estPourRaphael as estPourServeur,
} from "../supabase/functions/_shared/destinataire.ts"
import {
  enAttenteDeRaphael as enAttenteApp,
  estPourRaphael as estPourApp,
} from "../src/lib/journalDestinataire.ts"
import type { DevLogEntry } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = new Date("2026-09-07T09:00:00Z")
let n = 0
function point(p: Partial<DevLogEntry> = {}): DevLogEntry {
  n++
  return {
    id: `m${n}`,
    user_id: "u",
    item_id: null,
    author: "claude/une-session",
    kind: "question",
    body: `Question ${n}`,
    answered_at: null,
    created_at: "2026-09-05T09:00:00Z",
    ...p,
  } as DevLogEntry
}

console.log("— Ce qui attend une décision de Raphaël —")

verifier(
  "rien en attente : aucun bloc, pas même un titre",
  formaterCeQuiLAttend([], MAINTENANT) === "",
  "un titre suivi de rien coûte des jetons à chaque phrase et apprend au modèle à réciter des sections vides",
)
verifier(
  "un journal SANS rien pour lui reste muet",
  formaterCeQuiLAttend(
    [point({ kind: "info" }), point({ kind: "reponse" }), point({ kind: "question", answered_at: "2026-09-06T10:00:00Z" })],
    MAINTENANT,
  ) === "",
)

{
  const bloc = formaterCeQuiLAttend([point({ body: "On garde le mot-à-mot combien de temps ?" })], MAINTENANT)
  verifier("une vraie question arrive au modèle", bloc.includes("On garde le mot-à-mot combien de temps ?"))
  verifier("   et elle est présentée comme à trancher", bloc.includes("à trancher"))
  verifier(
    "   avec la consigne de ne pas les réciter spontanément",
    /ne les énumère jamais de toi-même/i.test(bloc),
    "il les voit déjà dans son cockpit : les répéter à chaque phrase serait le bulletin qu'il refuse",
  )
}

verifier(
  "le compte rendu d'une session n'est PAS une décision qui l'attend",
  formaterCeQuiLAttend(
    [point({ kind: "action", body: "Fait et archivé. Commit df756ac, déployé." })],
    MAINTENANT,
  ) === "",
  "mesuré le 7 sept. 2026 : 4 des 5 points « en attente » étaient des comptes rendus de sessions",
)
verifier(
  "une vraie action à faire par lui, si",
  formaterCeQuiLAttend(
    [point({ kind: "action", body: "Dépose GOOGLE_GEOCODING_API_KEY.", pourquoi: "Sans elle, rien ne géocode." })],
    MAINTENANT,
  ).includes("à faire par toi"),
)
verifier(
  "un message adressé à une AUTRE session ne l'attend pas",
  formaterCeQuiLAttend([point({ body: "Pour la session cockpit : tu es toujours dessus ?" })], MAINTENANT) === "",
)

{
  const vieux = point({ body: "La plus ancienne", created_at: "2026-09-01T09:00:00Z" })
  const neuf = point({ body: "La plus récente", created_at: "2026-09-07T08:00:00Z" })
  const bloc = formaterCeQuiLAttend([neuf, vieux], MAINTENANT)
  verifier(
    "la plus ancienne passe devant",
    bloc.indexOf("La plus ancienne") < bloc.indexOf("La plus récente"),
    "celle qui attend depuis six jours compte plus que celle d'il y a une heure",
  )
  verifier("   et son âge est dit en clair", bloc.includes("depuis 6 jours"))
}

verifier("« aujourd'hui » pour un point du jour", depuisQuand("2026-09-07T07:00:00Z", MAINTENANT) === "aujourd'hui")
verifier("« depuis hier » pour la veille", depuisQuand("2026-09-06T07:00:00Z", MAINTENANT) === "depuis hier")
verifier(
  "une date illisible ne fabrique pas un âge",
  depuisQuand("n'importe quoi", MAINTENANT) === "" && depuisQuand(null, MAINTENANT) === "",
  "« depuis NaN jours » dans une phrase dite à voix haute",
)

{
  const beaucoup = Array.from({ length: MAX_POINTS + 7 }, (_, i) =>
    point({ body: `Point numéro ${i}`, created_at: `2026-09-0${(i % 5) + 1}T09:00:00Z` }),
  )
  const lignes = formaterCeQuiLAttend(beaucoup, MAINTENANT).split("\n").filter((l) => l.startsWith("- "))
  verifier(
    `le bloc est plafonné à ${MAX_POINTS} points`,
    lignes.length === MAX_POINTS,
    `${lignes.length} lignes : chaque phrase envoie déjà ~45 000 caractères`,
  )
}

console.log("\n— La consigne arrive dans les DEUX moteurs —")

for (const [nom, chemin] of [
  ["le micro", "supabase/functions/voice-command/index.ts"],
  ["le mode Live", "supabase/functions/live-jeton/index.ts"],
] as const) {
  const source = readFileSync(chemin, "utf8")
  verifier(
    `${nom} importe la consigne`,
    /import \{ CONSIGNE_QUESTION_POSEE \} from "\.\.\/_shared\/questionPosee\.ts"/.test(source),
  )
  verifier(
    `   et l'insère vraiment dans ce qu'il envoie`,
    source.includes("${CONSIGNE_QUESTION_POSEE}"),
    "importée sans être interpolée, elle ne partirait nulle part — et rien ne le dirait",
  )
}

verifier(
  "la consigne reprend ses quatre exemples",
  ["rendez-vous", "en retard", "décision", "point global"].every((mot) => CONSIGNE_QUESTION_POSEE.includes(mot)),
  "ce sont les phrases qu'il a lui-même données le 5 sept.",
)
verifier(
  "elle interdit d'ajouter une rubrique non demandée",
  /JAMAIS DE RUBRIQUE QU'IL N'A PAS DEMANDÉE/.test(CONSIGNE_QUESTION_POSEE),
  "c'est exactement ce qu'il rejette : « tout ce qu'on lui demande ça ne doit pas être figé »",
)

console.log("\n— L'app et le serveur disent la MÊME chose —")

{
  // Deux fichiers, deux occasions de diverger. On ne compare pas leur texte :
  // on les fait tourner sur les mêmes cas.
  const cas: DevLogEntry[] = [
    point(),
    point({ kind: "action", body: "Fait et archivé. Commit abc." }),
    point({ kind: "action", body: "Dépose la clé.", pourquoi: "Sinon rien ne marche." }),
    point({ kind: "blocage", body: "Je suis bloquée." }),
    point({ kind: "info", body: "Pour information." }),
    point({ kind: "info", body: "Pour information.", pourquoi: "un pourquoi qui traîne" }),
    point({ body: "Pour la session cockpit : coucou" }),
    point({ answered_at: "2026-09-06T10:00:00Z" }),
    point({ author: "Raphaël", body: "Ma consigne." }),
    point({ kind: "action", body: "Action de Raphaël", author: "Raphaël", pourquoi: "x" }),
  ]
  const divergentes = cas.filter(
    (c) => enAttenteApp(c) !== enAttenteServeur(c) || estPourApp(c) !== estPourServeur(c),
  )
  verifier(
    "les deux implémentations rendent le même verdict sur tous les cas",
    divergentes.length === 0,
    divergentes.map((c) => `${c.kind} « ${c.body} »`).join(" ; "),
  )
  verifier(
    "   y compris qu'un « info » ne fait sonner personne",
    !estPourApp(cas[5]) && !estPourServeur(cas[5]),
    "piège de rédaction déjà rencontré : une règle en disjonction laissait passer tous les autres kinds",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
