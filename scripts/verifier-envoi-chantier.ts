/**
 * Vérifie le découpage d'une demande TAPÉE en titre + note.
 *
 *   node --experimental-strip-types scripts/verifier-envoi-chantier.ts
 *
 * Aucun réseau. Ce qui est en jeu : la fenêtre « Envoyer à Claude Code »
 * calcule le titre du chantier au lieu de le demander. Un titre illisible se
 * verrait tout de suite dans la liste, mais une NOTE perdue ne se verrait
 * jamais — Raphaël croirait avoir envoyé un détail qu'aucune session ne lira.
 * D'où la règle vérifiée ici sur chaque cas : dès que le titre ne reprend pas
 * le texte entier, le texte entier est dans la note.
 */
import { decouperDemande } from "../src/lib/demandeChantier.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/** [ce qu'il tape, titre attendu, note attendue] */
const CAS: [string, string, string | null][] = [
  // Une ligne courte : elle se suffit, rien à mettre en note.
  ["Refaire le visuel du cockpit", "Refaire le visuel du cockpit", null],

  // Point final : le titre s'arrête à la phrase, mais rien ne se perd.
  [
    "Refaire le visuel du cockpit. C'est trop brut et pas assez compact.",
    "Refaire le visuel du cockpit",
    "Refaire le visuel du cockpit. C'est trop brut et pas assez compact.",
  ],

  // Retour à la ligne : c'est le découpage qu'il a écrit lui-même.
  [
    "Micro coupé en pleine phrase\nÇa arrive surtout quand je dicte longtemps",
    "Micro coupé en pleine phrase",
    "Micro coupé en pleine phrase\nÇa arrive surtout quand je dicte longtemps",
  ],

  // Une seule longue phrase sans ponctuation : troncature, note complète.
  [
    "il faudrait que les chantiers du cockpit soient déjà triés et classés selon leur section pour avoir une vue plus claire",
    "il faudrait que les chantiers du cockpit soient déjà triés et classés selon…",
    "il faudrait que les chantiers du cockpit soient déjà triés et classés selon leur section pour avoir une vue plus claire",
  ],

  // Un point d'interrogation ferme aussi la première phrase.
  [
    "Pourquoi le micro se coupe ? Ça le fait depuis la dernière mise à jour.",
    "Pourquoi le micro se coupe",
    "Pourquoi le micro se coupe ? Ça le fait depuis la dernière mise à jour.",
  ],

  // Un nombre décimal ne doit pas être pris pour une fin de phrase.
  ["Passer la marge à 1.5 rem partout", "Passer la marge à 1.5 rem partout", null],

  // Espaces et lignes vides autour : nettoyés, sans rien perdre au milieu.
  ["   Ajouter un bouton   ", "Ajouter un bouton", null],

  // Rien à envoyer : la fenêtre doit pouvoir désactiver son bouton.
  ["", "", null],
  ["   \n  ", "", null],
]

for (const [texte, titreAttendu, notesAttendues] of CAS) {
  const r = decouperDemande(texte)
  const etiquette = texte.trim() ? `« ${texte.trim().slice(0, 45)}… »` : "(vide)"

  verifier(
    `titre de ${etiquette}`,
    r.titre === titreAttendu,
    `obtenu « ${r.titre} », attendu « ${titreAttendu} »`,
  )
  verifier(
    `note de ${etiquette}`,
    r.notes === notesAttendues,
    `obtenu ${JSON.stringify(r.notes)}, attendu ${JSON.stringify(notesAttendues)}`,
  )
}

// La règle qui compte plus que la forme des titres : rien ne se perd. Elle est
// revérifiée à part, sur des cas qu'on n'a pas écrits à la main, pour qu'une
// retouche du découpage ne puisse pas faire disparaître du texte en silence.
const AU_HASARD = [
  "Un mot",
  "Deux phrases courtes. La seconde compte aussi.",
  "Une ligne\nune autre\nune troisième",
  "a".repeat(200),
  "Trop long sans aucune ponctuation " + "et encore des mots ".repeat(12),
  "Fin sans point mais avec ; un point-virgule au milieu",
]

for (const texte of AU_HASARD) {
  const r = decouperDemande(texte)
  const complet = texte.trim().replace(/\s+\n/g, "\n")
  const conserve = r.notes === complet || r.titre === complet
  verifier(
    `rien ne se perd sur « ${texte.slice(0, 35)}… »`,
    conserve,
    `titre « ${r.titre} », note ${JSON.stringify(r.notes)} — ni l'un ni l'autre ne reprend le texte entier`,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
