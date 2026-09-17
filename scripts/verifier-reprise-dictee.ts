/**
 * Redire une dictée coupée COMPLÈTE la ligne, elle n'en crée pas une seconde.
 *
 * Hors réseau. Les cas sont COPIÉS de ses 298 dictées réelles (`echanges`,
 * relues le 15 sept. 2026), jamais des paraphrases de l'expression qu'ils
 * vérifient — le piège déjà payé cinq fois dans ce dépôt.
 *
 *   node --experimental-strip-types scripts/verifier-reprise-dictee.ts
 */
import {
  completerPlutotQueCreer,
  estUneReprise,
  FENETRE_REPRISE_MS,
  phraseRepriseAction,
} from "../src/lib/repriseDictee.ts"

let echecs = 0
function verifier(nom: string, ok: boolean) {
  console.log(`${ok ? "  ok  " : "ECHEC "} ${nom}`)
  if (!ok) echecs++
}

const T0 = 1_700_000_000_000
const tour = (transcript: string) => ({ transcript, at: T0 })
const reprise = (avant: string, apres: string, dt: number) =>
  estUneReprise(tour(avant), apres, T0 + dt)

/* ---------- SES SIX REPRISES RÉELLES ---------- */

verifier(
  "sa dictée du 15 sept. : le rappel Ducamp, complété par l'échéance",
  reprise(
    "Mets-moi un rappel par rapport à Jonathan Ducamp dans la partie perso. rapport au store du résidence",
    "mets-moi un rappel par rapport à Jonathan Ducamp dans la partie perso. rapport au store du résidence. Aujourd'hui échéance à 15h",
    3_500,
  ),
)
verifier("« appeler Mel ma femme » → « … à 23h19 »", reprise("appeler Mel ma femme", "appeler Mel ma femme à 23h19", 2_100))
verifier("« vidéo sur YouTube » → « … qui parle de motivation »", reprise("vidéo sur YouTube", "vidéo sur YouTube qui parle de motivation", 6_900))
verifier(
  "la plus tardive de ses reprises, 23 s, tient dans la fenêtre",
  reprise("Itinéraire de Pierre Amikay Jerusalem", "Itinéraire de Pierre Amikay Jerusalem avec Waze", 23_000),
)

/* ---------- LA MOITIÉ QUI COMPTE : CE QUI N'EN EST PAS ----------
   La relation de préfixe est tout le garde-fou. Si elle cède, on complète une
   ligne avec une demande qui n'a rien à voir — et on perd les deux. */

// ESSAYÉ À L'ENVERS, ET LA PREMIÈRE VERSION ÉTAIT FAUSSE. Elle visait
// « appeler Dan » → « appeler Daniel Nakache » : aplatie, la phrase fait ONZE
// caractères, donc elle tombait sur LONGUEUR_MINIMUM (12) et jamais sur la
// frontière de mot. Retirer la frontière laissait le contrôle vert. C'est le
// piège du contrôle qui vérifie autre chose que ce qu'il annonce, déjà payé
// par le sélecteur Playwright, `Filesystem.mkdir`, `com.google.android.as` et
// le drapeau Live. « appeler Daniel » en fait quatorze : il passe la longueur
// et ne peut être arrêté QUE par la frontière.
verifier(
  "« appeler Daniel » ne reprend PAS « appeler Danielle Cohen » (frontière de mot)",
  !reprise("appeler Daniel", "appeler Danielle Cohen tout de suite", 3_000),
)
verifier(
  "une phrase redite À L'IDENTIQUE n'est pas une reprise (c'est un doublon)",
  !reprise("lance la musique de Booba", "lance la musique de Booba", 2_000),
)
verifier(
  "une phrase qui ne commence pas par la précédente n'en est pas une reprise",
  !reprise("ajoute une tâche acheter du pain", "ajoute une tâche appeler le plombier", 3_000),
)
verifier(
  "passé la fenêtre, c'est une nouvelle demande",
  !reprise("appeler Mel ma femme", "appeler Mel ma femme à 23h19", FENETRE_REPRISE_MS + 1),
)
verifier(
  "une phrase trop courte ne sert jamais de préfixe",
  !reprise("mets", "mets la musique de Booba", 2_000),
)
verifier("sans tour précédent, rien", !estUneReprise(null, "appeler Mel ma femme à 23h19", T0))

/* ---------- LA TRANSFORMATION ---------- */

const creation = { vers: "tache", id: "t-ducamp", quand: T0 }
const ajout = {
  action: "add_task",
  title: "Rappeler Jonathan Ducamp",
  notes: "Rapport au store de la résidence",
  due_date: "2026-09-15",
  due_time: "15:00",
  category_id: null,
}

const complete = completerPlutotQueCreer([ajout], creation, T0 + 3_500)
verifier(
  "la création devient une complétion de la MÊME tâche",
  complete?.length === 1 &&
    (complete[0] as { action: string }).action === "update_task" &&
    (complete[0] as { task_id: string }).task_id === "t-ducamp",
)
verifier(
  "et elle emporte l'échéance, qui est justement ce que la seconde dictée ajoute",
  (() => {
    const c = (complete?.[0] as { changes: Record<string, unknown> })?.changes
    return c?.due_date === "2026-09-15" && c?.due_time === "15:00" && c?.title === "Rappeler Jonathan Ducamp"
  })(),
)
// ON N'ÉCRASE JAMAIS AVEC DU VIDE : le modèle peut ne pas reposer un champ
// qu'il avait déduit au tour d'avant. Écrire null par-dessus effacerait ce
// qui était juste.
verifier(
  "un champ absent n'écrase pas ce qui avait été déduit au tour d'avant",
  (() => {
    const c = (complete?.[0] as { changes: Record<string, unknown> })?.changes
    return !("category_id" in c)
  })(),
)

verifier(
  "sans identifiant (dictée partie hors ligne), on ne transforme rien",
  completerPlutotQueCreer([ajout], { vers: "tache", quand: T0 }, T0 + 3_500) === null,
)
verifier(
  "après un CHANTIER, on ne touche pas à une tâche",
  completerPlutotQueCreer([ajout], { vers: "chantier", id: "c1", quand: T0 }, T0 + 3_500) === null,
)
verifier(
  "sans création dans le lot, rien à transformer",
  completerPlutotQueCreer([{ action: "list_tasks" }], creation, T0 + 3_500) === null,
)
verifier(
  "les autres actions du lot traversent inchangées",
  (() => {
    const r = completerPlutotQueCreer([{ action: "list_tasks" }, ajout], creation, T0 + 3_500)
    return r?.length === 2 && (r[0] as { action: string }).action === "list_tasks"
  })(),
)

/* ---------- « PRÉVENIR PUIS REFAIRE » (chantier e4886791, réponse du
   17 sept. 2026) : musique/vidéo, itinéraire et message (chantier b02d70f5,
   étendu le 17 sept. dans une session avec Raphaël en ligne). ---------- */

verifier(
  "vidéo déjà lancée + reprise → annonce avant de relancer",
  phraseRepriseAction(
    true,
    [{ action: "open_app", music_query: "vidéo qui parle de motivation" }],
    { famille: "media", quand: T0 },
    T0 + 6_900,
  ) === "D'accord, je relance avec ta phrase complète.",
)
verifier(
  "itinéraire déjà ouvert + reprise → annonce avant de relancer",
  phraseRepriseAction(
    true,
    [{ action: "navigate_to" }],
    { famille: "navigation", quand: T0 },
    T0 + 23_000,
  ) === "D'accord, je relance avec ta phrase complète.",
)
verifier(
  "sans reprise détectée (nouvelle demande), on ne dit rien même si la famille correspond",
  phraseRepriseAction(
    false,
    [{ action: "open_app", music_query: "du Brassens" }],
    { famille: "media", quand: T0 },
    T0 + 2_000,
  ) === null,
)
verifier(
  "aucune action téléphone récente : rien à prévenir",
  phraseRepriseAction(true, [{ action: "open_app", music_query: "du Brassens" }], null, T0) === null,
)
verifier(
  "fenêtre dépassée : plus une reprise de CETTE action-là",
  phraseRepriseAction(
    true,
    [{ action: "navigate_to" }],
    { famille: "navigation", quand: T0 },
    T0 + FENETRE_REPRISE_MS + 1,
  ) === null,
)
verifier(
  "familles différentes (musique lancée, puis itinéraire redemandé) : pas la même action, rien à prévenir",
  phraseRepriseAction(
    true,
    [{ action: "navigate_to" }],
    { famille: "media", quand: T0 },
    T0 + 2_000,
  ) === null,
)
verifier(
  "message déjà préparé + reprise → annonce avant de reprendre le MÊME brouillon",
  phraseRepriseAction(
    true,
    [{ action: "send_message" }],
    { famille: "message", quand: T0 },
    T0 + 4_600,
  ) === "D'accord, je reprends le message avec ta phrase complète.",
)
verifier(
  "musique lancée, puis un message redemandé : pas la même famille, rien à prévenir",
  phraseRepriseAction(
    true,
    [{ action: "send_message" }],
    { famille: "media", quand: T0 },
    T0 + 2_000,
  ) === null,
)
verifier(
  "message préparé, fenêtre dépassée : plus une reprise de CE message-là",
  phraseRepriseAction(
    true,
    [{ action: "send_message" }],
    { famille: "message", quand: T0 },
    T0 + FENETRE_REPRISE_MS + 1,
  ) === null,
)
verifier(
  "plusieurs actions dans le lot (phrase à deux demandes) : on ne prévient rien, l'ambiguïté l'emporte",
  phraseRepriseAction(
    true,
    [{ action: "open_app", music_query: "du Brassens" }, { action: "navigate_to" }],
    { famille: "media", quand: T0 },
    T0 + 2_000,
  ) === null,
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
