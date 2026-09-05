/**
 * Vérifie que ce que Raphaël reprend à Jarvis arrive jusqu'au modèle — et que
 * ce qui ne lui apprendrait rien n'y arrive pas.
 *
 *   node --experimental-strip-types scripts/verifier-corrections.ts
 *
 * Aucun réseau. Ce qui se joue ici : le registre des erreurs lui fait écrire
 * « ce qu'il aurait fallu faire » ; jusqu'au chantier 057fbe10 ça ne servait
 * qu'aux sessions Claude Code, pas à Jarvis. Il refaisait donc la même erreur
 * le lendemain alors que la réponse était en base.
 *
 * Le tri compte autant que l'envoi : chaque phrase envoie déjà ~45 000
 * caractères à Gemini, et une erreur « serveur » ou « systeme » n'apprend
 * rien à un modèle de langue. La lui envoyer, c'est payer du quota pour rien.
 */
import {
  CATEGORIES_UTILES,
  MAX_CORRECTIONS,
  correctionsUtiles,
  formaterCorrections,
  type ErreurCorrigee,
} from "../supabase/functions/_shared/corrections.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const erreur = (p: Partial<ErreurCorrigee>): ErreurCorrigee => ({
  categorie: "comprehension",
  titre: "Une erreur",
  contexte: null,
  correction: "Ce qu'il aurait fallu faire.",
  statut: "nouveau",
  ...p,
})

// ── Ce qui doit arriver au modèle ──────────────────────────────────────────
{
  // Le vrai cas signalé par Raphaël le 4 sept. (chantier 11af12a7).
  const mel = erreur({
    categorie: "comprehension",
    titre: "« envoie un message à Mel » compris comme une demande de mail",
    contexte: "Envoie un message à Mel pour lui dire que je rentre tard.",
    correction: "Mel est ma femme, un contact. Ce n'est jamais une demande de mail.",
  })
  const bloc = formaterCorrections([mel])
  verifier("une correction de compréhension part au modèle", bloc.includes("Mel est ma femme"))
  verifier(
    "avec ce qui se passait, sinon la consigne est incompréhensible hors contexte",
    bloc.includes("Envoie un message à Mel pour lui dire"),
  )
  verifier(
    "et une consigne de discrétion : il applique sans commenter",
    /sans jamais les commenter/i.test(bloc),
    "sinon Jarvis annonce « j'applique ta correction » à chaque phrase",
  )

  verifier(
    "une correction d'action part aussi",
    formaterCorrections([erreur({ categorie: "action", correction: "Lance vraiment le titre." })]).includes(
      "Lance vraiment le titre",
    ),
  )
}

// ── Ce qui ne doit PAS y arriver ───────────────────────────────────────────
{
  for (const categorie of ["serveur", "systeme", "ecoute", "utilisation", "autre"]) {
    verifier(
      `une erreur « ${categorie} » n'est pas envoyée au modèle`,
      formaterCorrections([erreur({ categorie, correction: "Redémarrer le serveur." })]) === "",
      "elle n'apprend rien à un modèle de langue et coûte du quota à chaque phrase",
    )
  }

  verifier(
    "une erreur sans correction écrite n'est pas envoyée",
    formaterCorrections([erreur({ correction: null })]) === "" &&
      formaterCorrections([erreur({ correction: "   " })]) === "",
    "sans le « ce qu'il aurait fallu faire », il n'y a rien à appliquer",
  )

  verifier(
    "une erreur que Raphaël a écartée n'est pas renvoyée comme consigne",
    formaterCorrections([erreur({ statut: "ignore" })]) === "",
    "« ignoré » veut dire qu'il a regardé et décidé que ce n'en était pas une : la renvoyer prendrait le contre-pied de sa décision",
  )

  verifier(
    "une erreur déjà corrigée reste une consigne valable",
    formaterCorrections([erreur({ statut: "corrige" })]) !== "",
    "le correctif est peut-être dans le code, la consigne reste vraie",
  )
}

// ── Le bloc vide, et le plafond ────────────────────────────────────────────
{
  verifier("aucune erreur : aucun bloc, pas un titre suivi de rien", formaterCorrections([]) === "")
  verifier("liste absente : rien non plus", formaterCorrections(undefined as never) === "")
  verifier(
    "que des erreurs inutiles : aucun bloc",
    formaterCorrections([erreur({ categorie: "serveur" }), erreur({ correction: null })]) === "",
  )

  const beaucoup = Array.from({ length: 30 }, (_, i) =>
    erreur({ titre: `Erreur numéro ${i}`, correction: `Correction numéro ${i}` }),
  )
  const retenues = correctionsUtiles(beaucoup)
  verifier(
    `le contexte est plafonné à ${MAX_CORRECTIONS} corrections`,
    retenues.length === MAX_CORRECTIONS,
    `${retenues.length} retenues — chaque phrase envoie déjà ~45 000 caractères`,
  )
  verifier(
    "ce sont les premières de la liste qui passent (la base les rend les plus récentes d'abord)",
    retenues[0].titre === "Erreur numéro 0",
  )
}

// ── Le texte reste borné, même si Raphaël écrit un roman ───────────────────
{
  const roman = formaterCorrections([
    erreur({ titre: "T".repeat(500), contexte: "C".repeat(500), correction: "R".repeat(900) }),
  ])
  // Ce qui compte n'est pas une longueur totale au doigt mouillé, c'est que
  // CHAQUE champ soit borné : sans ça, une seule correction dictée en roman
  // mangerait la place des neuf autres.
  const plusLongue = (texte: string, lettre: string) =>
    Math.max(0, ...texte.split(new RegExp(`[^${lettre}]`)).map((m) => m.length))
  verifier(
    "un titre trop long est tronqué",
    plusLongue(roman, "T") <= 200,
    `${plusLongue(roman, "T")} caractères de titre`,
  )
  verifier(
    "un contexte trop long est tronqué",
    plusLongue(roman, "C") <= 160,
    `${plusLongue(roman, "C")} caractères de contexte`,
  )
  verifier(
    "une correction trop longue est tronquée",
    plusLongue(roman, "R") <= 300,
    `${plusLongue(roman, "R")} caractères de correction`,
  )
  verifier(
    "et l'entrée entière reste sous le millier de caractères",
    roman.length < 1000,
    `${roman.length} caractères — dix comme celle-là feraient 10 000 à chaque phrase`,
  )
  verifier(
    "les retours à la ligne d'une correction dictée ne cassent pas la liste",
    !formaterCorrections([erreur({ correction: "Première ligne.\nDeuxième ligne." })]).includes(
      "Première ligne.\nDeuxième",
    ),
    "une correction sur deux lignes ferait passer la seconde pour une nouvelle entrée",
  )
}

// ── Les familles utiles sont bien celles du registre ───────────────────────
verifier(
  "les deux familles retenues sont « comprehension » et « action »",
  CATEGORIES_UTILES.length === 2 &&
    CATEGORIES_UTILES.includes("comprehension") &&
    CATEGORIES_UTILES.includes("action"),
  `retenues : ${CATEGORIES_UTILES.join(", ")}`,
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
