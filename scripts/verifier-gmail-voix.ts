/**
 * Vérifie les décisions pures de Gmail à la voix : reconnaître « le dernier »
 * et lire proprement un expéditeur — sans réseau.
 *
 *   node --experimental-strip-types scripts/verifier-gmail-voix.ts
 */
import { estDernierMessage, nomExpediteur } from "../src/lib/gmailVoix.ts"
import { sansListeAvantTransmission } from "../supabase/functions/voice-command/recuTransmis.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── nomExpediteur ──
verifier(
  "extrait le nom affiché",
  nomExpediteur('Yoni Cohen <yoni@exemple.com>') === "Yoni Cohen",
)
verifier(
  "gère les guillemets autour du nom",
  nomExpediteur('"Bezeq International" <no-reply@bezeq.co.il>') === "Bezeq International",
)
verifier(
  "sans nom affiché, rend l'adresse telle quelle",
  nomExpediteur("contact@station-paz.co.il") === "contact@station-paz.co.il",
)
verifier("null rend un texte, jamais une chaîne vide ni une erreur", nomExpediteur(null) === "un expéditeur inconnu")

// ── estDernierMessage ──
for (const cible of ["le dernier", "Le dernier.", "la dernière", "le dernier mail", "le dernier message", "dernier"]) {
  verifier(`« ${cible} » désigne le dernier message`, estDernierMessage(cible))
}
for (const cible of ["le mail de Yoni", "la facture d'électricité", "le dernier message de Yoni", "Yoni"]) {
  verifier(`« ${cible} » N'EST PAS « le dernier » — c'est un vrai terme de recherche`, !estDernierMessage(cible))
}

// ── sansListeAvantTransmission (serveur) ──
// La réponse exacte du modèle, le 24 sept. 2026, à « Transmets la dernière
// facture d'électricité à Dan par WhatsApp. »
const mesuree = [
  { action: "find_receipts", mail_recherche: "facture électricité", mail_limite: 1 },
  { action: "transmettre_recu", mail_cible: "la dernière facture d'électricité", contact_name: "Dan", message_channel: "whatsapp" },
]
const types = (a: { action?: unknown }[]) => a.map((x) => x.action).join(",")
verifier(
  "un find_receipts qui accompagne transmettre_recu est retiré",
  types(sansListeAvantTransmission(mesuree)) === "transmettre_recu",
  types(sansListeAvantTransmission(mesuree)),
)
verifier(
  "« retrouve mes reçus » seul reste une liste",
  types(sansListeAvantTransmission([{ action: "find_receipts" }])) === "find_receipts",
)
verifier(
  "les autres actions de la phrase ne bougent pas",
  types(sansListeAvantTransmission([{ action: "add_task" }, ...mesuree])) === "add_task,transmettre_recu",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
