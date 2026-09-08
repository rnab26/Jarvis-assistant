/**
 * Vérifie qu'une confirmation nue après un brouillon de réponse à un mail
 * devient send_email, et surtout qu'elle ne se déclenche PAS à tort sur une
 * nouvelle demande qui commence par les mêmes mots.
 *
 *   node --experimental-strip-types scripts/verifier-confirmation-envoi-mail.ts
 */
import { estConfirmationEnvoiMail } from "../src/lib/confirmationEnvoiMail.ts"
import type { TourJarvis } from "../src/lib/retours.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = Date.now()

function tourMailPrepare(ilYA_ms: number): TourJarvis {
  return {
    transcript: "Réponds au mail de Yoni que j'arrive dans dix minutes.",
    actions: ["prepare_email_reply"],
    cible: "Yoni",
    reponse: "Voilà ce que je m'apprête à répondre à Yoni. Dis-moi si je l'envoie.",
    at: MAINTENANT - ilYA_ms,
  }
}

// ── Les tournures qu'il pourrait employer pour confirmer ──
for (const phrase of ["oui", "Oui.", "envoie", "envoie-le", "vas-y", "Vas-y !", "c'est bon", "confirme"]) {
  verifier(`« ${phrase} » après préparation d'un mail est une confirmation`, estConfirmationEnvoiMail(tourMailPrepare(10_000), phrase, MAINTENANT))
}

// ── LE CAS QUI COMPTE : une nouvelle demande qui commence par « envoie » ──
verifier(
  "« envoie un message à Sarah » n'est pas une confirmation de mail",
  !estConfirmationEnvoiMail(tourMailPrepare(5_000), "envoie un message à Sarah", MAINTENANT),
)
verifier(
  "« envoie un mail à Dylan pour lui dire que je passe demain » n'est pas une confirmation",
  !estConfirmationEnvoiMail(
    tourMailPrepare(5_000),
    "envoie un mail à Dylan pour lui dire que je passe demain",
    MAINTENANT,
  ),
)
verifier(
  "« réponds-lui que je serai en retard » n'est pas une confirmation (nouveau contenu dicté)",
  !estConfirmationEnvoiMail(tourMailPrepare(5_000), "réponds-lui que je serai en retard", MAINTENANT),
)

// ── Le silence attendu ──
verifier("sans tour précédent, pas de confirmation", !estConfirmationEnvoiMail(null, "vas-y", MAINTENANT))
verifier(
  "un tour précédent qui n'a rien préparé (ex: send_message) ne déclenche rien",
  !estConfirmationEnvoiMail(
    { transcript: "envoie un message à Dylan", actions: ["send_message"], cible: "Dylan", reponse: "Message prêt.", at: MAINTENANT - 5_000 },
    "vas-y",
    MAINTENANT,
  ),
  "confirmationEnvoi.ts (WhatsApp) doit rester le seul à réagir à ce tour-là",
)
verifier(
  "plus de 90 secondes après la préparation, on ne rattache plus",
  !estConfirmationEnvoiMail(tourMailPrepare(91_000), "vas-y", MAINTENANT),
)
verifier(
  "une phrase sans rapport après préparation reste une phrase normale",
  !estConfirmationEnvoiMail(tourMailPrepare(5_000), "quelle heure est-il ?", MAINTENANT),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
