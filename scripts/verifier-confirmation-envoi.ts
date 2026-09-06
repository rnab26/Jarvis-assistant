/**
 * Vérifie qu'une confirmation nue après un message préparé devient un clic,
 * et surtout qu'elle ne se déclenche PAS à tort.
 *
 *   node --experimental-strip-types scripts/verifier-confirmation-envoi.ts
 *
 * Chantier 21cf48d2, 6 sept. 2026. Les deux phrases de ce contrôle (« Envoyer
 * un message à Mel ma femme disant que... » puis « Envoyer le message à Mel
 * ma femme ») sont copiées mot pour mot de `journal_ecoute` — pas
 * inventées : c'est exactement ce qui a échoué en silence ce soir-là.
 */
import { estConfirmationEnvoi } from "../src/lib/confirmationEnvoi.ts"
import type { TourJarvis } from "../src/lib/retours.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = Date.now()

function tourEnvoiPrepare(ilYA_ms: number): TourJarvis {
  return {
    transcript: "Envoyer un message à Mel ma femme disant que Yarden arrive dans dix minutes.",
    actions: ["send_message"],
    cible: "Mel Ma Femme",
    reponse: "Message prêt pour Mel Ma Femme sur WhatsApp, tu n'as plus qu'à envoyer.",
    at: MAINTENANT - ilYA_ms,
  }
}

// ── Le cas réel du 6 sept., mot pour mot ──
verifier(
  "« Envoyer le message à Mel ma femme » après préparation devient une confirmation",
  estConfirmationEnvoi(tourEnvoiPrepare(24_000), "Envoyer le message à Mel ma femme", MAINTENANT),
)
verifier(
  "« Envoyer un message à Mel ma femme disant que... » (la PREMIÈRE phrase) n'est PAS une confirmation",
  !estConfirmationEnvoi(
    tourEnvoiPrepare(24_000),
    "Envoyer un message à Mel ma femme disant que Yarden arrive dans dix minutes.",
    MAINTENANT,
  ),
  "l'article indéfini + le contenu dicté disent une NOUVELLE demande",
)

// ── Les tournures courtes qu'il pourrait employer ──
for (const phrase of ["envoie-le", "Envoie-le.", "vas-y", "Vas-y !", "c'est bon", "confirme", "appuie sur envoyer"]) {
  verifier(`« ${phrase} » après préparation est une confirmation`, estConfirmationEnvoi(tourEnvoiPrepare(10_000), phrase, MAINTENANT))
}

// ── Ce qui doit RESTER une nouvelle demande, jamais un clic au hasard ──
verifier(
  "« envoie un message à Sarah » — nouvelle demande sans contenu — n'est pas une confirmation",
  !estConfirmationEnvoi(tourEnvoiPrepare(5_000), "envoie un message à Sarah", MAINTENANT),
  "l'article indéfini suffit à l'exclure, même sans contenu dicté",
)
verifier(
  "« envoie un sms à Yoni » n'est pas une confirmation",
  !estConfirmationEnvoi(tourEnvoiPrepare(5_000), "envoie un sms à Yoni", MAINTENANT),
)

// ── Le silence attendu : pas de tour précédent, pas le bon type, trop tard ──
verifier("sans tour précédent, pas de confirmation", !estConfirmationEnvoi(null, "vas-y", MAINTENANT))
verifier(
  "un tour précédent qui n'a rien préparé (ex: add_task) ne déclenche rien",
  !estConfirmationEnvoi(
    { transcript: "ajoute une tâche", actions: ["add_task"], cible: null, reponse: "Ajouté.", at: MAINTENANT - 5_000 },
    "vas-y",
    MAINTENANT,
  ),
)
verifier(
  "plus de 90 secondes après la préparation, on ne rattache plus",
  !estConfirmationEnvoi(tourEnvoiPrepare(91_000), "vas-y", MAINTENANT),
)
verifier(
  "une phrase sans rapport après préparation reste une phrase normale",
  !estConfirmationEnvoi(tourEnvoiPrepare(5_000), "quelle heure est-il ?", MAINTENANT),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
