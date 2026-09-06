/**
 * Vérifie ce que l'historique d'un chantier raconte.
 *
 *   node --experimental-strip-types scripts/verifier-historique-chantier.ts
 *
 * Ce qui est en jeu : distinguer une note COMPLÉTÉE d'une note ÉCRASÉE. C'est
 * la seule distinction qui compte à l'usage — il n'y a rien à récupérer d'une
 * note qui a grandi, et tout à récupérer d'une note qui a effacé le travail de
 * quelqu'un. Le CLAUDE.md du projet cite deux cas réels, les 5 et 6 sept. 2026,
 * dont un qui a fait perdre un retour de Raphaël écrit nulle part ailleurs.
 *
 * Et l'autre moitié, aussi importante : SE TAIRE. Un historique où chaque
 * ligne crie « note réécrite » n'est plus lu, et ne sert donc à rien le jour
 * où il faudrait.
 */
import {
  caracteresPerdus,
  noteEcrasee,
  PERTE_NOTABLE,
  phraseDuChangement,
  quandCourt,
  reecrituresNotables,
  type LigneHistorique,
} from "../src/lib/historiqueChantier.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
function ligne(p: Partial<LigneHistorique> = {}): LigneHistorique {
  n++
  return {
    id: `h${n}`,
    item_id: "i1",
    champ: "notes",
    avant: null,
    apres: null,
    par: "claude/cockpit-0609",
    change_at: "2026-09-06T09:00:00Z",
    ...p,
  }
}

console.log("— Une note complétée n'est pas une note écrasée —")

// LE CAS RÉEL du 5 sept. : une note portant les mots de Raphaël, remplacée
// par un résumé de session. C'est celui-là qu'il faut pouvoir rendre.
// Longueur RÉALISTE : les notes de ses chantiers font entre mille et trois
// mille caractères, parce qu'elles portent ses mots, ce qui a été écarté et
// ce qui a été vérifié. Un cas d'essai plus court passerait sous le seuil et
// laisserait croire que le signalement ne marche pas.
const ECRASEE = ligne({
  avant:
    "[LIBRE] Ses mots, dictés le 3 sept. : « il faut que Jarvis sache lancer une " +
    "musique précise ». Vérifié le 5 sept. : l'intent part bien, Apple Music " +
    "s'ouvre, mais rien ne joue. Écarté : passer par l'API Spotify, il ne l'a " +
    "pas. Écarté aussi : lui faire choisir le lecteur à chaque fois, il l'a " +
    "refusé le 4 sept. — « je ne veux pas qu'on me demande à chaque fois ». " +
    "Reste à essayer l'intent MediaStore avec le titre exact, et à vérifier ce " +
    "que renvoie le téléphone quand le morceau n'existe pas dans la bibliothèque.",
  apres: "Fait : correction poussée. Commit abc1234.",
})
verifier("une note remplacée par un résumé est signalée comme réécrite", noteEcrasee(ECRASEE))
verifier(
  "et la phrase le dit en clair",
  phraseDuChangement(ECRASEE).includes("réécrit"),
  phraseDuChangement(ECRASEE),
)
verifier(
  "on sait combien de texte a disparu",
  caracteresPerdus(ECRASEE) > 100,
  `${caracteresPerdus(ECRASEE)}`,
)

const COMPLETEE = ligne({
  avant: "[LIBRE] Ses mots du 3 sept.",
  apres: "[LIBRE] Ses mots du 3 sept.\n\nMISE À JOUR du 6 sept. : la moitié serveur est faite.",
})
verifier("une note À LAQUELLE ON AJOUTE n'est pas signalée", !noteEcrasee(COMPLETEE))
verifier(
  "et la phrase dit « complété », pas « réécrit »",
  phraseDuChangement(COMPLETEE).includes("complété"),
  phraseDuChangement(COMPLETEE),
)
verifier("rien n'a été perdu", caracteresPerdus(COMPLETEE) === 0)

verifier(
  "une PREMIÈRE note ne se lit pas comme un écrasement",
  !noteEcrasee(ligne({ avant: null, apres: "Une note toute neuve." })),
  "chaque chantier créé crierait à la perte",
)
verifier(
  "et elle se dit « écrit »",
  phraseDuChangement(ligne({ avant: "", apres: "Une note." })).includes("écrit"),
)

verifier(
  "un ajout AU DÉBUT compte aussi comme un ajout",
  !noteEcrasee(ligne({ avant: "La suite.", apres: "Un préambule.\n\nLa suite." })),
  "les sessions écrivent souvent la mise à jour en tête",
)

console.log("\n— Le reste des changements, dit en français —")

const PHRASES: [Partial<LigneHistorique>, string][] = [
  [{ champ: "status", apres: "in_progress" }, "en cours"],
  [{ champ: "status", apres: "done" }, "fait"],
  [{ champ: "priority", apres: "high" }, "haute"],
  [{ champ: "theme", avant: null, apres: "Le cockpit" }, "Le cockpit"],
  [{ champ: "theme", avant: "Le cockpit", apres: null }, "sorti"],
  [{ champ: "archived_at", avant: null, apres: "2026-09-06T09:00:00Z" }, "archivé"],
  [{ champ: "archived_at", avant: "2026-09-06T09:00:00Z", apres: null }, "rouvert"],
  [{ champ: "title", avant: "Avant", apres: "Après" }, "renommé"],
]
for (const [p, attendu] of PHRASES) {
  const phrase = phraseDuChangement(ligne(p))
  verifier(`« ${p.champ} » se dit « ${attendu} »`, phrase.includes(attendu), phrase)
}

verifier(
  "la session qui a écrit est nommée, sans son « claude/ »",
  phraseDuChangement(ligne({ champ: "status", apres: "done" })).startsWith("cockpit-0609"),
  phraseDuChangement(ligne({ champ: "status", apres: "done" })),
)
verifier(
  "et une écriture anonyme ne fabrique pas un auteur",
  phraseDuChangement(ligne({ champ: "status", apres: "done", par: null })).startsWith("passé"),
  "une session qui travaille sans réserver reste inconnue : on ne l'invente pas",
)

console.log("\n— Ce qu'on signale, et surtout ce qu'on ne signale pas —")

const petite = ligne({ avant: "Fait : correction poussée.", apres: "Fait : corrigé." })
verifier(
  "une reformulation courte n'est pas une alerte",
  reecrituresNotables([petite]).length === 0,
  `${caracteresPerdus(petite)} caractères perdus, seuil ${PERTE_NOTABLE}`,
)
verifier(
  "une note qui perd des centaines de caractères, si",
  reecrituresNotables([ECRASEE, petite, COMPLETEE]).length === 1,
  JSON.stringify(reecrituresNotables([ECRASEE, petite, COMPLETEE]).map((l) => l.id)),
)
verifier(
  "la plus lourde perte vient en premier",
  (() => {
    const grosse = ligne({ avant: "x".repeat(3000), apres: "" })
    const moyenne = ligne({ avant: "y".repeat(400), apres: "" })
    return reecrituresNotables([moyenne, grosse])[0]?.id === grosse.id
  })(),
)
verifier(
  "un changement de statut n'entre jamais dans les réécritures",
  reecrituresNotables([ligne({ champ: "status", avant: "todo", apres: "done" })]).length === 0,
)

console.log("\n— Les bords —")

verifier("une date illisible ne casse rien", quandCourt("pas une date") === "?")
verifier("un champ inconnu se dit quand même", phraseDuChangement(ligne({ champ: "bidule" })).includes("bidule"))
verifier("aucune ligne, aucune alerte", reecrituresNotables([]).length === 0)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
