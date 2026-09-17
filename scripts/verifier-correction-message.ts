/**
 * Vérifie la correction et la relecture d'un message WhatsApp/SMS préparé,
 * et surtout qu'elles ne se déclenchent PAS à tort sur une autre demande.
 *
 *   node --experimental-strip-types scripts/verifier-correction-message.ts
 *
 * Chantier ed32cbcc, 17 sept. 2026.
 */
import {
  estCorrectionMessage,
  estDemandeRelectureMessage,
  phraseCorrectionMessage,
  phraseRelectureMessage,
} from "../src/lib/correctionMessage.ts"
import type { TourJarvis } from "../src/lib/retours.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = Date.now()

function tourMessagePrepare(ilYA_ms: number): TourJarvis {
  return {
    transcript: "Envoie un message à Dan disant que je passe demain.",
    actions: ["send_message"],
    cible: "Dan",
    reponse: "Message prêt pour Dan sur WhatsApp, tu n'as plus qu'à envoyer.",
    at: MAINTENANT - ilYA_ms,
  }
}

// ── Relecture : les tournures qu'il pourrait employer ──
for (const phrase of [
  "relis-le moi",
  "relis le message",
  "relis",
  "répète le message",
  "repete",
  "qu'est-ce que t'as écrit ?",
  "qu'est ce que tu as écrit",
  "c'est quoi le message",
  "rappelle-moi le message",
]) {
  verifier(
    `« ${phrase} » après préparation est une demande de relecture`,
    estDemandeRelectureMessage(tourMessagePrepare(10_000), phrase, MAINTENANT),
  )
}

verifier(
  "la relecture ne se déclenche pas sans message préparé",
  !estDemandeRelectureMessage(null, "relis-le moi", MAINTENANT),
)
verifier(
  "la relecture ne se déclenche pas après une autre action (add_task)",
  !estDemandeRelectureMessage(
    { transcript: "ajoute une tâche", actions: ["add_task"], cible: null, reponse: "Ajouté.", at: MAINTENANT - 5_000 },
    "relis-le moi",
    MAINTENANT,
  ),
)
verifier(
  "la relecture ne se déclenche plus après 90 s",
  !estDemandeRelectureMessage(tourMessagePrepare(91_000), "relis-le moi", MAINTENANT),
)

console.log()

// ── Correction : les tournures qu'il pourrait employer ──
for (const phrase of [
  "remplace bonjour par salut",
  "change demain par vendredi",
  "enlève la dernière phrase",
  "retire le smiley",
  "supprime la fin",
  "ajoute qu'on se voit à 10h",
  "raccourcis-le",
  "rallonge un peu",
  "reformule ça",
  "corrige la faute",
  "récris-le plus poliment",
  "mets plutôt bonsoir",
  "écris plutôt à 10h",
  "au lieu de demain mets vendredi",
]) {
  verifier(
    `« ${phrase} » après préparation est une correction`,
    estCorrectionMessage(tourMessagePrepare(10_000), phrase, MAINTENANT),
  )
}

// ── Le garde-fou : ne jamais avaler une demande d'un AUTRE domaine ──
for (const phrase of [
  "ajoute une tâche pour le plombier",
  "supprime la tâche du plombier",
  "enlève le rappel de la villa Dan",
  "supprime le chantier du site de Mélissa",
  "ajoute un chantier pour refaire la salle de bain",
  "retire l'alarme de 7h",
  "change le rendez-vous de demain",
  "supprime ce contact",
]) {
  verifier(
    `« ${phrase} » n'est PAS une correction du message (autre domaine)`,
    !estCorrectionMessage(tourMessagePrepare(10_000), phrase, MAINTENANT),
    "AUTRE_DOMAINE aurait dû l'exclure",
  )
}

verifier(
  "la correction ne se déclenche pas sans message préparé",
  !estCorrectionMessage(null, "remplace bonjour par salut", MAINTENANT),
)
verifier(
  "la correction ne se déclenche pas après une autre action (add_task)",
  !estCorrectionMessage(
    { transcript: "ajoute une tâche", actions: ["add_task"], cible: null, reponse: "Ajouté.", at: MAINTENANT - 5_000 },
    "remplace bonjour par salut",
    MAINTENANT,
  ),
)
verifier(
  "la correction ne se déclenche plus après 90 s",
  !estCorrectionMessage(tourMessagePrepare(91_000), "remplace bonjour par salut", MAINTENANT),
)
verifier(
  "une phrase sans rapport après préparation reste une phrase normale",
  !estCorrectionMessage(tourMessagePrepare(5_000), "quelle heure est-il ?", MAINTENANT),
)
verifier(
  "« envoie-le » n'est pas pris pour une correction (déjà géré par confirmationEnvoi.ts)",
  !estCorrectionMessage(tourMessagePrepare(5_000), "envoie-le", MAINTENANT),
)

console.log()

// ── Les phrases dites, mot pour mot ──
verifier(
  "phraseRelectureMessage nomme le destinataire et cite le texte",
  phraseRelectureMessage("Dan", "je passe demain") === "Voici ce que j'ai écrit pour Dan : « je passe demain ».",
)
verifier(
  "phraseRelectureMessage sans destinataire connu",
  phraseRelectureMessage(null, "je passe demain") === "Voici ce que j'ai écrit : « je passe demain ».",
)
verifier(
  "phraseCorrectionMessage nomme WhatsApp par défaut",
  phraseCorrectionMessage("Dan", "je passe demain", "remplace demain par vendredi") ===
    'Message WhatsApp déjà préparé pour Dan : "je passe demain". Correction demandée par Raphaël : "remplace demain par vendredi". Récris ce message WhatsApp en tenant compte de cette correction, pour le même destinataire.',
)
verifier(
  "phraseCorrectionMessage nomme SMS quand le canal est sms",
  phraseCorrectionMessage("Dan", "je passe demain", "remplace demain par vendredi", "sms") ===
    'Message SMS déjà préparé pour Dan : "je passe demain". Correction demandée par Raphaël : "remplace demain par vendredi". Récris ce message SMS en tenant compte de cette correction, pour le même destinataire.',
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
