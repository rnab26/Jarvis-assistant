/**
 * La mesure du décalage de la transcription Live (chantier f82f7a60).
 *
 *   node --experimental-strip-types scripts/verifier-decalage-transcription.ts
 *
 * Sans réseau : `src/lib/live/decalageTranscription.ts` est pur.
 *
 * CE QUE CES CONTRÔLES GARDENT VRAIMENT, c'est qu'une mesure absente ne se
 * lise jamais comme une mesure nulle. Tout ce chantier consiste à savoir OÙ
 * passe le temps ; un `0` posé à la place d'un `null` ferait conclure
 * « instantané » exactement là où on n'a rien su.
 */
import {
  ARRIVEES_GARDEES,
  dureeProtoEnMs,
  finDernierMot,
  mediane,
  resumerTour,
  retardDuMorceau,
  type MorceauTranscription,
} from "../src/lib/live/decalageTranscription.ts"

let echecs = 0
function verifier(nom: string, ok: boolean, detail = "") {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

function morceau(p: Partial<MorceauTranscription> = {}): MorceauTranscription {
  return { arriveeMs: 0, audioEnvoyeMs: 0, finDernierMotMs: null, caracteres: 5, interim: false, ...p }
}

// --- Les durées de Google, telles qu'il les écrit -------------------------

verifier(
  "« 1.500s » vaut 1500 ms",
  dureeProtoEnMs("1.500s") === 1500 && dureeProtoEnMs("12s") === 12000 && dureeProtoEnMs("0s") === 0,
  "c'est le format protobuf Duration, celui de `words[].endOffset`",
)

verifier(
  "un format inattendu rend null, JAMAIS zéro",
  dureeProtoEnMs("1500") === null &&
    dureeProtoEnMs("") === null &&
    dureeProtoEnMs(undefined) === null &&
    dureeProtoEnMs("abcs") === null &&
    dureeProtoEnMs({}) === null,
  "zéro se lirait « au tout début de l'audio » et fabriquerait un retard énorme",
)

// --- Le dernier mot daté d'un morceau -------------------------------------

verifier(
  "on prend la fin du dernier mot, pas celle du premier",
  finDernierMot([{ endOffset: "1.2s" }, { endOffset: "1.9s" }]) === 1900,
  "un morceau porte plusieurs mots ; c'est le plus récent qui date le morceau",
)

verifier(
  "des mots partiellement datés ne perdent pas ce qui est daté",
  finDernierMot([{ endOffset: "1.2s" }, { word: "euh" }]) === 1200,
  "",
)

verifier(
  "pas de mots datés du tout : null",
  finDernierMot(undefined) === null && finDernierMot([]) === null && finDernierMot([{ word: "a" }]) === null,
  "Google n'est pas obligé de remplir `words` — et ce cas-là doit rester visible",
)

// --- Le retard, quand il est mesurable ------------------------------------

verifier(
  "le retard est l'audio envoyé moins la fin du dernier mot",
  retardDuMorceau(morceau({ audioEnvoyeMs: 3000, finDernierMotMs: 1800 })) === 1200,
  "c'est la seule mesure de latence qui ne suppose rien sur le moment où il a parlé",
)

verifier(
  "sans mots datés, pas de retard inventé",
  retardDuMorceau(morceau({ audioEnvoyeMs: 3000 })) === null,
  "",
)

verifier(
  "un retard négatif est ramené à zéro, pas publié tel quel",
  retardDuMorceau(morceau({ audioEnvoyeMs: 1000, finDernierMotMs: 1200 })) === 0,
  "négatif voudrait dire que Google a transcrit de l'audio qu'on ne lui a pas envoyé : c'est un décalage de compteur",
)

verifier("la médiane d'un ensemble vide est null", mediane([]) === null, "")
verifier("la médiane est bien la médiane", mediane([100, 900, 300]) === 300 && mediane([100, 300]) === 200, "")

// --- Le résumé d'un tour, sur les deux formes qu'il décrit ----------------

// SA PLAINTE : « tout est en décalage ». Ce tour-là est la forme qu'elle
// prend — rien pendant qu'il parle, tout d'un coup à la fin.
const enRafale = resumerTour({
  morceaux: [morceau({ arriveeMs: 2400, audioEnvoyeMs: 2500, finDernierMotMs: 300, caracteres: 40 })],
  finiMs: 2450,
  tourMs: 2600,
  raisonFin: null,
})

verifier(
  "une transcription qui tombe d'un bloc en fin de phrase se voit",
  enRafale.morceaux === 1 && enRafale.retard_median_ms === 2200,
  `attendu 1 morceau et 2200 ms de retard, obtenu ${String(enRafale.morceaux)} / ${String(enRafale.retard_median_ms)}`,
)

const enFlux = resumerTour({
  morceaux: [
    morceau({ arriveeMs: 900, audioEnvoyeMs: 900, finDernierMotMs: 760, caracteres: 6, interim: true }),
    morceau({ arriveeMs: 1500, audioEnvoyeMs: 1500, finDernierMotMs: 1400, caracteres: 12, interim: true }),
    morceau({ arriveeMs: 2100, audioEnvoyeMs: 2100, finDernierMotMs: 1400, caracteres: 12 }),
  ],
  finiMs: 2200,
  tourMs: 2400,
  raisonFin: "TURN_COMPLETE_REASON_ACTIVITY_END",
})

verifier(
  "l'avance du flux basse latence est le nombre qui décide du correctif",
  enFlux.avance_interim_ms === 1200,
  `2100 − 900 = 1200 ms d'avance ; obtenu ${String(enFlux.avance_interim_ms)}`,
)

verifier(
  "pas d'interim reçu : pas d'avance annoncée",
  enRafale.avance_interim_ms === null && enRafale.interims === 0,
  "si Google n'envoie jamais le flux basse latence, c'est CETTE absence qui est la réponse",
)

verifier(
  "les caractères comptés sont ceux qu'on AFFICHE, pas les interim",
  enFlux.caracteres === 12 && enFlux.caracteres_interim === 18,
  `obtenu ${String(enFlux.caracteres)} / ${String(enFlux.caracteres_interim)}`,
)

verifier(
  "la forme des arrivées se relit d'un coup d'œil, interim marqués",
  enFlux.arrivees === "i900,i1500,2100",
  `obtenu ${String(enFlux.arrivees)}`,
)

verifier(
  "un tour sans `finished` ne prétend pas en avoir eu un",
  resumerTour({ morceaux: [morceau()], finiMs: null, tourMs: 1000, raisonFin: null }).ms_fini_a_tour === null,
  "`finished` n'arrive pas toujours — et ça, il faut pouvoir le compter",
)

verifier(
  "aucun mot daté : le retard reste null et le nombre de mots datés est zéro",
  enFlux.retard_median_ms !== null &&
    resumerTour({ morceaux: [morceau()], finiMs: null, tourMs: 500, raisonFin: null }).retard_median_ms === null,
  "",
)

verifier(
  "un tour très bavard ne noie pas le journal",
  String(
    resumerTour({
      morceaux: Array.from({ length: 40 }, (_, i) => morceau({ arriveeMs: i * 100 })),
      finiMs: null,
      tourMs: 4000,
      raisonFin: null,
    }).arrivees,
  ).split(",").length === ARRIVEES_GARDEES,
  "40 morceaux écrits en entier rendraient `journal_ecoute` illisible",
)

// --- Ce que le journal peut porter ----------------------------------------

verifier(
  "le résumé ne porte que des valeurs simples",
  Object.values(enFlux).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)),
  "`journal_ecoute.detail` est un Record<string, string|number|boolean|null> : un tableau y serait perdu",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
