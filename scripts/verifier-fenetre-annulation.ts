/**
 * Vérifie la fenêtre d'annulation des actions qui sortent de Jarvis.
 *
 *   node --experimental-strip-types scripts/verifier-fenetre-annulation.ts
 *
 * CE QU'ELLE N'EST PAS, et c'est le premier risque : une confirmation.
 * Raphaël a explicitement écarté celle que je proposais le 5 sept. 2026
 * (« aucune limite […] il doit faire tout ce que je demande »). Rien ne doit
 * attendre son accord — le décompte fini, l'action part. Ce contrôle garde
 * donc les deux bords : que le garde-fou existe pour les commandes MAL
 * ENTENDUES (quatre applications ouvertes au hasard le 5 sept.), et qu'il ne
 * se transforme jamais en question posée.
 */
import {
  DELAIS_ANNULATION,
  DELAI_ANNULATION_DEFAUT,
  annonceAction,
  delaiAnnulation,
  libelleDelai,
  passeParLaFenetre,
} from "../src/lib/actionsTelephoneFenetre.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── Ce qui passe par la fenêtre, et surtout ce qui n'y passe pas ──
for (const sortante of ["open_app", "call_contact", "navigate_to", "send_message", "ask_ai"]) {
  verifier(`${sortante} laisse le temps de l'arrêter`, passeParLaFenetre(sortante))
}
for (const immediat of ["media_control", "set_alarm", "set_app_preference", "add_task"]) {
  verifier(
    `${immediat} part tout de suite`,
    !passeParLaFenetre(immediat),
    "attendre trois secondes pour mettre en pause rendrait Jarvis inutilisable",
  )
}

// ── « Immédiat » doit rester possible, en un appui ──
verifier(
  "« Immédiat » est proposé dans les réglages",
  DELAIS_ANNULATION.includes(0) && libelleDelai(0) === "Immédiat",
  "sa décision est qu'aucune limite ne lui soit imposée : elle doit pouvoir sauter",
)
verifier(
  "les autres délais restent courts",
  DELAIS_ANNULATION.filter((d) => d > 0).every((d) => d <= 8000),
  "au-delà, ce n'est plus une fenêtre d'annulation, c'est une attente",
)
verifier(
  "sans réglage enregistré, le garde-fou est actif",
  delaiAnnulation() === DELAI_ANNULATION_DEFAUT && DELAI_ANNULATION_DEFAUT > 0,
  `${delaiAnnulation()} ms — une valeur illisible ne doit pas couper le garde-fou par accident`,
)

// ── L'annonce nomme la cible : c'est tout ce qui permet de voir l'erreur ──
verifier(
  "l'annonce nomme l'application ouverte",
  annonceAction("open_app", "מכבי").includes("מכבי"),
  annonceAction("open_app", "מכבי"),
)
verifier(
  "et la personne appelée",
  annonceAction("call_contact", "Yoni").includes("Yoni"),
  annonceAction("call_contact", "Yoni"),
)
verifier(
  "sans cible connue, la phrase reste lisible",
  ["open_app", "call_contact", "navigate_to", "send_message", "ask_ai"].every((a) => {
    const p = annonceAction(a, null)
    return p.length > 0 && !p.includes("null") && !p.includes("undefined")
  }),
)
verifier(
  "aucune annonce ne pose de question",
  ["open_app", "call_contact", "navigate_to", "send_message", "ask_ai"].every(
    (a) => !annonceAction(a, "Yoni").includes("?"),
  ),
  "une question rouvrirait la confirmation qu'il a écartée",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
