/**
 * Vérifie la relecture vocale avant l'envoi WhatsApp (chantier ed32cbcc) :
 * décochée par défaut, la phrase de relecture nomme bien le destinataire et
 * le texte, « oui »/« non » sont reconnus sans ambiguïté, et un « non » qui
 * porte une vraie correction derrière lui n'est PAS avalé par la négation.
 *
 *   node --experimental-strip-types scripts/verifier-envoi-auto.ts
 */
import {
  envoiAutoVoulu,
  estReponseNon,
  estReponseOui,
  phraseRelecture,
} from "../src/lib/confirmationEnvoiVocale.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── Décoché par défaut ──
verifier("valeur absente => réglage inactif", !envoiAutoVoulu(null))
verifier("« 0 » => inactif", !envoiAutoVoulu("0"))
verifier("valeur inattendue => inactif (ne pas activer un garde-fou par accident)", !envoiAutoVoulu("oui"))
verifier("« 1 » => actif", envoiAutoVoulu("1"))

// ── La relecture nomme le destinataire ET le texte ──
const relecture = phraseRelecture("Dylan", "Je serai en retard.")
verifier("la relecture cite le destinataire", relecture.includes("Dylan"), relecture)
verifier("la relecture cite le texte mot pour mot", relecture.includes("Je serai en retard."), relecture)
verifier(
  "sans destinataire connu, la relecture ne prétend pas en avoir un",
  !phraseRelecture(null, "Coucou").includes("à null"),
)

// ── « oui » ──
for (const phrase of ["oui", "Oui.", "vas-y", "envoie", "envoie-le", "c'est bon", "confirme"]) {
  verifier(`« ${phrase} » est un oui`, estReponseOui(phrase))
}
verifier("chaîne vide n'est pas un oui", !estReponseOui(""))
verifier("« non » n'est pas un oui", !estReponseOui("non"))

// ── « non » — SEUL, sans rien derrière ──
for (const phrase of ["non", "Non.", "annule", "stop", "laisse tomber", "  Non  "]) {
  verifier(`« ${phrase} » seul est un non`, estReponseNon(phrase))
}
verifier("silence (chaîne vide) est traité comme un non — jamais un envoi par défaut", estReponseNon(""))

// ── LE CAS QUI COMPTE : un « non » suivi d'une vraie correction ne doit PAS
// être avalé par la négation, sinon la correction serait perdue en silence. ──
verifier(
  "« non, écris plutôt que je serai là dans 20 minutes » N'EST PAS un non sec",
  !estReponseNon("non, écris plutôt que je serai là dans 20 minutes"),
  "sinon la correction derrière le « non » serait perdue en silence",
)
verifier(
  "et ce n'est pas non plus un oui",
  !estReponseOui("non, écris plutôt que je serai là dans 20 minutes"),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
