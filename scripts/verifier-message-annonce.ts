/**
 * Vérifie quand et quoi Jarvis annonce d'un message programmé.
 *
 *   node --experimental-strip-types scripts/verifier-message-annonce.ts
 *
 * Chantier ed32cbcc, 17 sept. 2026. Sa décision du 4 sept. (fiche « Quand
 * Jarvis doit te déranger ») écarte une notification passive pour ce cas :
 * l'annonce ne doit avoir lieu que dans une conversation active, jamais par
 * une alerte système — la moitié de ce contrôle vérifie donc le SILENCE
 * (conversation en cours, voix coupée, annonce trop récente), pas seulement
 * la détection.
 */
import {
  estAnnulationMessageAnnonce,
  peutAnnoncerMaintenant,
  phraseAnnonceMessage,
  phraseMessageAnnule,
  prochainMessageAAnnoncer,
  type MessageAAnnoncer,
} from "../src/lib/messageAnnonce.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = new Date("2026-09-17T10:00:00")

function message(partiel: Partial<MessageAAnnoncer> & { id: string }): MessageAAnnoncer {
  return {
    destinataire: "Dan",
    texte: "je passe demain",
    envoyer_a: "2026-09-17T09:00:00",
    statut: "prevu",
    ...partiel,
  }
}

// ── prochainMessageAAnnoncer ──
verifier(
  "un message dû (dans la marge) est retenu",
  prochainMessageAAnnoncer([message({ id: "a" })], MAINTENANT)?.id === "a",
)
verifier(
  "un message pas encore dû n'est PAS retenu",
  prochainMessageAAnnoncer([message({ id: "a", envoyer_a: "2026-09-17T11:00:00" })], MAINTENANT) === null,
)
verifier(
  "un message dû mais hors marge (plus de 6h de retard) n'est PAS retenu",
  prochainMessageAAnnoncer([message({ id: "a", envoyer_a: "2026-09-17T02:00:00" })], MAINTENANT) === null,
)
verifier(
  "un message déjà 'annonce' n'est PAS retenu (on ne le redit pas en boucle)",
  prochainMessageAAnnoncer([message({ id: "a", statut: "annonce" })], MAINTENANT) === null,
)
verifier(
  "un message 'envoye' n'est PAS retenu",
  prochainMessageAAnnoncer([message({ id: "a", statut: "envoye" })], MAINTENANT) === null,
)
verifier(
  "un message 'annule' n'est PAS retenu",
  prochainMessageAAnnoncer([message({ id: "a", statut: "annule" })], MAINTENANT) === null,
)
verifier(
  "une date illisible n'est PAS retenue (pas de plantage)",
  prochainMessageAAnnoncer([message({ id: "a", envoyer_a: "n'importe quoi" })], MAINTENANT) === null,
)
verifier(
  "plusieurs messages dus : le PLUS ANCIEN d'abord",
  prochainMessageAAnnoncer(
    [
      message({ id: "recent", envoyer_a: "2026-09-17T09:50:00" }),
      message({ id: "ancien", envoyer_a: "2026-09-17T08:00:00" }),
    ],
    MAINTENANT,
  )?.id === "ancien",
)
verifier("aucun message : rien à annoncer", prochainMessageAAnnoncer([], MAINTENANT) === null)

console.log()

// ── peutAnnoncerMaintenant : la moitié SILENCE ──
verifier(
  "en pleine conversation (listening), on ne coupe pas la parole",
  !peutAnnoncerMaintenant({ statut: "listening", voixCoupee: false, derniereAnnonceIlYA_ms: null }),
)
verifier(
  "en train de parler (speaking), on n'enchaîne pas par-dessus",
  !peutAnnoncerMaintenant({ statut: "speaking", voixCoupee: false, derniereAnnonceIlYA_ms: null }),
)
verifier(
  "voix coupée : on ne parle pas",
  !peutAnnoncerMaintenant({ statut: "idle", voixCoupee: true, derniereAnnonceIlYA_ms: null }),
)
verifier(
  "une annonce vient d'avoir lieu il y a 5 s : on laisse le temps de répondre",
  !peutAnnoncerMaintenant({ statut: "idle", voixCoupee: false, derniereAnnonceIlYA_ms: 5_000 }),
)
verifier(
  "idle, voix active, aucune annonce récente : on peut parler",
  peutAnnoncerMaintenant({ statut: "idle", voixCoupee: false, derniereAnnonceIlYA_ms: null }),
)
verifier(
  "idle, une annonce a eu lieu il y a plus de 20 s : on peut reparler",
  peutAnnoncerMaintenant({ statut: "idle", voixCoupee: false, derniereAnnonceIlYA_ms: 25_000 }),
)

console.log()

// ── Les phrases dites, mot pour mot ──
verifier(
  "phraseAnnonceMessage nomme le destinataire, cite le texte, et ne dit jamais que c'est déjà envoyé",
  phraseAnnonceMessage(message({ id: "a" })) ===
    "Message à envoyer à Dan : « je passe demain ». Je te le prépare — dis-moi si je l'envoie, si tu veux corriger le texte, ou si tu préfères annuler.",
)
verifier(
  "phraseMessageAnnule nomme le destinataire",
  phraseMessageAnnule(message({ id: "a" })) === "D'accord, je n'envoie rien à Dan.",
)

console.log()

// ── estAnnulationMessageAnnonce : détection ET silence ──
for (const phrase of ["annule", "Annule.", "laisse tomber", "non, annule", "ne l'envoie pas", "n'envoie rien"]) {
  verifier(
    `« ${phrase} » après une annonce annule`,
    estAnnulationMessageAnnonce({ id: "a" }, phrase),
  )
}
verifier(
  "sans message annoncé, « annule » ne fait rien ICI (pas de contexte à annuler)",
  !estAnnulationMessageAnnonce(null, "annule"),
)
verifier(
  "une phrase sans rapport après une annonce n'annule rien",
  !estAnnulationMessageAnnonce({ id: "a" }, "quelle heure est-il ?"),
)
verifier(
  "une correction du texte n'est pas une annulation",
  !estAnnulationMessageAnnonce({ id: "a" }, "remplace demain par vendredi"),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
