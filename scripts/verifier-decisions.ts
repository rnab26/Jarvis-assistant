/**
 * Vérifie « Ce qui attend ta décision » — la fin des fiches hors du dépôt.
 *
 *   node --experimental-strip-types scripts/verifier-decisions.ts
 *
 * Ce qui se joue ici : une question posée par une session doit REVENIR à
 * Raphaël, et sa réponse doit repartir vers les sessions sous une forme
 * lisible des années après. Le 5 sept. 2026, la fiche publiée pour ça
 * n'enregistrait que les champs de texte — aucun choix d'option, aucun état —
 * et le compteur affichait « 0 / 14 » pendant qu'il répondait. Personne ne
 * l'a vu. Tout ce qui suit est de cette famille : faux en silence.
 *
 * Le parcours à l'écran est dans `scripts/verifier-cockpit-web.mjs`.
 */
import {
  corpsReponse,
  enAttenteDeRaphael,
  estEtatAction,
  optionsDe,
  questionsEnAttente,
  reponsePrete,
  tailleReduite,
  COTE_MAX_PHOTO,
  ETATS_ACTION,
  POIDS_MAX_PHOTO,
  QUALITES_PHOTO,
  cheminPhoto,
} from "../src/lib/decisions.ts"
import type { DevLogEntry } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
function entree(p: Partial<DevLogEntry> = {}): DevLogEntry {
  n++
  return {
    id: `m${n}`,
    user_id: "u",
    item_id: null,
    author: "claude/une-session",
    kind: "question",
    body: `Question ${n}`,
    answered_at: null,
    created_at: `2026-09-05T1${n % 10}:00:00Z`,
    ...p,
  }
}

// ───────────────── Ce qui l'attend, et ce qui ne l'attend plus ─────────────────
{
  verifier("une question sans réponse l'attend", enAttenteDeRaphael(entree()))
  verifier("une action sans réponse aussi", enAttenteDeRaphael(entree({ kind: "action" })))
  verifier(
    "une question déjà répondue ne l'attend plus",
    !enAttenteDeRaphael(entree({ answered_at: "2026-09-05T12:00:00Z" })),
    "la liste ne se viderait jamais, et il cesserait de la lire",
  )
  for (const kind of ["reponse", "info", "blocage"] as const) {
    verifier(
      `un message « ${kind} » ne réclame rien de lui`,
      !enAttenteDeRaphael(entree({ kind })),
      "le journal entier finirait dans l'écran des décisions",
    )
  }
}

{
  // Les actions passent devant : une clé non déposée bloque douze chantiers,
  // une décision n'en bloque qu'un.
  const vieilleQuestion = entree({ kind: "question", created_at: "2026-09-01T08:00:00Z" })
  const action = entree({ kind: "action", created_at: "2026-09-05T08:00:00Z" })
  const jeuneQuestion = entree({ kind: "question", created_at: "2026-09-05T09:00:00Z" })
  const ordre = questionsEnAttente([jeuneQuestion, vieilleQuestion, action])
  verifier(
    "ce qu'il doit FAIRE passe avant ce qu'il doit décider",
    ordre[0].id === action.id,
    ordre.map((e) => `${e.kind} ${e.created_at}`).join(", "),
  )
  verifier(
    "et à famille égale, la plus ancienne d'abord",
    ordre[1].id === vieilleQuestion.id && ordre[2].id === jeuneQuestion.id,
    "celle qui attend depuis trois jours resterait sous les nouvelles",
  )
}

// ─────────────────── Les options, écrites en SQL à la main ───────────────────
{
  const q = entree({
    options: [
      { cle: "oui", libelle: "Oui, tout de suite" },
      { cle: "non", libelle: "Non", aide: "On garde ce qu'on a.", recommande: true },
    ],
  })
  const options = optionsDe(q)
  verifier("les options proposées sont lues", options.length === 2)
  verifier("la recommandation de la session est portée", options[1].recommande === true)
  verifier("et l'explication d'une option aussi", options[1].aide === "On garde ce qu'on a.")
  verifier("une option sans explication ne casse rien", options[0].aide === null)
}

{
  // Le jsonb est écrit à la main par une session, souvent depuis un
  // `scripts/sql.sh` : tout peut arriver. Une question mal formée doit rester
  // une question à laquelle il peut répondre en écrivant, pas un écran blanc.
  const cassees: unknown[] = [
    null,
    "pas un tableau",
    42,
    [null, 3, "texte"],
    [{ cle: "a" }],
    [{ libelle: "   " }],
    {},
  ]
  for (const options of cassees) {
    let leve = false
    let resultat: ReturnType<typeof optionsDe> = []
    try {
      resultat = optionsDe(entree({ options }))
    } catch {
      leve = true
    }
    verifier(
      `des options abîmées (${JSON.stringify(options)?.slice(0, 24)}) ne font pas tomber l'écran`,
      !leve && Array.isArray(resultat),
      "une question serait illisible et il ne pourrait plus y répondre du tout",
    )
  }
  verifier(
    "une option sans clé retombe sur son libellé",
    optionsDe(entree({ options: [{ libelle: "Sans limite" }] }))[0].cle === "Sans limite",
  )
  verifier(
    "deux options de même clé ne sont gardées qu'une fois",
    optionsDe(entree({ options: [{ cle: "a", libelle: "Un" }, { cle: "a", libelle: "Deux" }] }))
      .length === 1,
    "la réponse enregistrée ne dirait pas laquelle des deux il a choisie",
  )
}

// ───────────── Ce qui part dans le journal, et que relira une session ─────────────
{
  const option = { cle: "sans_limite", libelle: "Sans limite", aide: null, recommande: true }
  verifier(
    "la réponse écrit le LIBELLÉ de l'option, pas sa clé",
    corpsReponse(option, "") === "Sans limite",
    corpsReponse(option, ""),
  )
  verifier(
    "et joint son commentaire",
    corpsReponse(option, "Illimité mais ultra compacter") ===
      "Sans limite — Illimité mais ultra compacter",
    corpsReponse(option, "Illimité mais ultra compacter"),
  )
  verifier(
    "un commentaire seul suffit : il répond souvent à côté des options, et c'est là que se trouve l'essentiel",
    corpsReponse(null, "On fait autrement") === "On fait autrement",
  )
  verifier(
    "les espaces autour de son commentaire ne partent pas en base",
    corpsReponse(null, "  Oui  ") === "Oui",
  )
  verifier(
    "une clé technique n'apparaît jamais dans le journal",
    !corpsReponse(option, "").includes("sans_limite"),
    "« oui » ou « opt_2 » n'apprennent rien à la session qui lira ça dans six mois",
  )
}

{
  verifier("sans choix ni mot, on n'envoie rien", !reponsePrete(null, "   "))
  verifier("une option choisie suffit", reponsePrete({ cle: "a", libelle: "A", aide: null, recommande: false }, ""))
  verifier("des mots écrits suffisent aussi", reponsePrete(null, "Je préfère l'autre"))
}

// ───────────────────────── Les états d'une action ─────────────────────────
{
  verifier("les trois états sont reconnus", ETATS_ACTION.every((e) => estEtatAction(e.valeur)))
  verifier(
    "« ça bloque » existe, et c'est celui qui manquait aux fiches",
    ETATS_ACTION.some((e) => e.valeur === "bloque"),
    "« il me demande de créer des clés, mais je ne peux pas écrire si ça bloque »",
  )
  verifier("une valeur inconnue est refusée", !estEtatAction("peut-etre") && !estEtatAction(null))
}

// ─────────────────────────── La photo, avant l'envoi ───────────────────────────
{
  const grande = tailleReduite(3000, 2000)
  verifier(
    "une capture de téléphone est réduite sous le côté maximal",
    Math.max(grande.largeur, grande.hauteur) === COTE_MAX_PHOTO,
    `${grande.largeur} × ${grande.hauteur}`,
  )
  verifier(
    "et garde ses proportions",
    Math.abs(grande.largeur / grande.hauteur - 3000 / 2000) < 0.01,
    `${grande.largeur} × ${grande.hauteur}`,
  )
  const petite = tailleReduite(400, 300)
  verifier(
    "une petite image n'est jamais AGRANDIE",
    petite.largeur === 400 && petite.hauteur === 300,
    "on gagnerait du poids sans gagner un pixel d'information",
  )
  const haute = tailleReduite(600, 4000)
  verifier(
    "une capture en hauteur est réduite sur son grand côté",
    haute.hauteur === COTE_MAX_PHOTO && haute.largeur === 210,
    `${haute.largeur} × ${haute.hauteur}`,
  )
  verifier(
    "une image sans dimension ne provoque pas de division par zéro",
    tailleReduite(0, 0).largeur === 0,
  )
  verifier(
    "les qualités JPEG vont de la meilleure à la pire, sans trou",
    QUALITES_PHOTO.length > 1 &&
      QUALITES_PHOTO.every((q, i) => q > 0 && q <= 1 && (i === 0 || q < QUALITES_PHOTO[i - 1])),
    QUALITES_PHOTO.join(", "),
  )
  verifier(
    "et le poids visé reste envoyable depuis la 4G",
    POIDS_MAX_PHOTO > 0 && POIDS_MAX_PHOTO <= 512 * 1024,
    `${Math.round(POIDS_MAX_PHOTO / 1024)} Ko`,
  )
}

{
  // RLS du bucket : chaque fichier sous <user_id>/…, sinon l'envoi est refusé.
  const chemin = cheminPhoto("11111111-2222-3333-4444-555555555555", "abcd")
  verifier(
    "la photo est rangée sous le dossier de son propriétaire",
    chemin.startsWith("11111111-2222-3333-4444-555555555555/"),
    `${chemin} — hors de ce dossier, la politique RLS refuse l'envoi`,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
