/**
 * Mode entraînement : reconnaître démarrer / terminer / rejouer, sans réseau.
 *
 *   node --experimental-strip-types scripts/verifier-entrainement.ts
 *
 * Chantier 86df4f4a. La moitié qui compte le plus est le REFUS : rejouer la
 * mauvaise séquence clique dans une application à la place de Raphaël, ce qui
 * ne se rattrape pas forcément — mieux vaut ne rien reproduire que de
 * reproduire au hasard.
 */
import {
  ajouterEtapeEnregistree,
  arreterEnregistrement,
  demarrerEnregistrement,
  enregistrementEnCours,
  estDebutEntrainement,
  nomDeFinEntrainement,
  nomParDefaut,
  phraseFinEntrainement,
  sequenceDemandee,
  type SequenceEntrainement,
} from "../src/lib/entrainement.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── Démarrer ────────────────────────────────────────────────────────────────
verifier("« Jarvis, commence l'entraînement » démarre", estDebutEntrainement("Commence l'entraînement"))
verifier("« active le mode entraînement » aussi", estDebutEntrainement("Active le mode entraînement"))
verifier("« démarre l'entraînement » aussi", estDebutEntrainement("Démarre l'entraînement"))
verifier("« ajoute une tâche » ne démarre RIEN", !estDebutEntrainement("Ajoute une tâche pour demain"))
verifier(
  "une phrase qui parle d'entraînement sans le démarrer ne le déclenche pas",
  !estDebutEntrainement("Qu'est-ce que le mode entraînement ?"),
)

// ── Terminer, avec ou sans nom ──────────────────────────────────────────────
verifier(
  "« termine l'entraînement, appelle ça vérification midrag » extrait le nom",
  nomDeFinEntrainement("Termine l'entraînement, appelle ça vérification midrag") === "verification midrag",
)
verifier(
  "« … et nomme-la vérification midrag » aussi",
  nomDeFinEntrainement("Termine l'entraînement et nomme-la vérification midrag") === "verification midrag",
)
verifier(
  "« … ça s'appelle vérification midrag » aussi",
  nomDeFinEntrainement("Arrête l'entraînement, ça s'appelle vérification midrag") === "verification midrag",
)
verifier(
  "sans nom dicté, on obtient une chaîne vide, pas null",
  nomDeFinEntrainement("Termine l'entraînement") === "",
)
verifier(
  "une phrase qui n'a rien à voir ne termine rien",
  nomDeFinEntrainement("Ajoute une tâche pour demain") === null,
)
verifier(
  "le nom par défaut n'est jamais vide",
  nomParDefaut(new Date("2026-09-07T10:00:00")).trim().length > 0,
)

// ── Ce qu'on dit ─────────────────────────────────────────────────────────────
verifier(
  "zéro étape enregistrée : rien n'est gardé, et c'est dit",
  /rien n'est gard/i.test(phraseFinEntrainement("Test", 0)),
)
verifier(
  "au moins une étape : le nom et le compte sont dans la phrase",
  phraseFinEntrainement("Vérification midrag", 3).includes("Vérification midrag") &&
    phraseFinEntrainement("Vérification midrag", 3).includes("3"),
)

// ── Rejouer : la moitié qui compte le plus est le SILENCE ───────────────────
const SEQUENCES: SequenceEntrainement[] = [
  { id: "s1", nom: "Vérification midrag", etapes: [{ commande: "clic", cible: "Notes" }] },
  { id: "s2", nom: "Rapport hebdomadaire clients", etapes: [{ commande: "lire", cible: null }] },
]

verifier(
  "« refais vérification midrag » retrouve la bonne séquence",
  sequenceDemandee("Refais vérification midrag", SEQUENCES)?.id === "s1",
)
verifier(
  "« relance l'entraînement rapport hebdomadaire » retrouve l'autre",
  sequenceDemandee("Relance l'entraînement rapport hebdomadaire", SEQUENCES)?.id === "s2",
)
verifier(
  "« reproduis midrag » suffit avec un seul mot distinctif",
  sequenceDemandee("Reproduis midrag", SEQUENCES)?.id === "s1",
)
verifier(
  "une phrase qui ne demande pas de rejeu ne rend rien, même si elle cite un mot d'une séquence",
  sequenceDemandee("Je vais sur midrag voir mes clients", SEQUENCES) === null,
)
verifier(
  "aucune séquence ne correspond : on ne devine pas",
  sequenceDemandee("Refais le grand ménage de printemps", SEQUENCES) === null,
)
verifier(
  "deux séquences plausibles à égalité : on ne choisit pas au hasard",
  sequenceDemandee("Refais rapport clients", [
    { id: "a", nom: "Rapport clients Melissa", etapes: [] },
    { id: "b", nom: "Rapport clients Dan", etapes: [] },
  ]) === null,
)
verifier(
  "aucune séquence déclarée : rien ne peut être rejoué",
  sequenceDemandee("Refais vérification midrag", []) === null,
)

// ── L'enregistrement en cours ────────────────────────────────────────────────
verifier("rien n'est en cours au départ", !enregistrementEnCours())
ajouterEtapeEnregistree({ commande: "clic", cible: "Notes" })
verifier(
  "une étape ajoutée AVANT « commence » ne compte pas",
  arreterEnregistrement().length === 0,
)
demarrerEnregistrement()
verifier("« commence » met bien l'enregistrement en cours", enregistrementEnCours())
ajouterEtapeEnregistree({ commande: "clic", cible: "Notes" })
ajouterEtapeEnregistree({ commande: "lire", cible: null })
const etapes = arreterEnregistrement()
verifier("les deux étapes dictées dans l'ordre sont gardées", etapes.length === 2 && etapes[0].cible === "Notes")
verifier("« termine » referme bien l'enregistrement", !enregistrementEnCours())
verifier(
  "une étape après « termine » ne compte plus pour rien",
  (ajouterEtapeEnregistree({ commande: "retour", cible: null }), arreterEnregistrement().length === 0),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
