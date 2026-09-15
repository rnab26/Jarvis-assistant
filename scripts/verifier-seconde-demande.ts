/**
 * Une phrase qui porte DEUX demandes ne se traite pas sur l'appareil.
 *
 * Hors réseau. Les cas sont COPIÉS de son journal (`echanges`) et de ses
 * vraies tâches (`tasks`), relus le 15 sept. 2026 — pas des paraphrases des
 * expressions régulières. Le piège est déjà payé quatre fois dans ce dépôt
 * (sélecteur Playwright, `Filesystem.mkdir`, `com.google.android.as`,
 * le filtre des sessions autonomes) : un contrôle écrit d'après le motif se
 * reconnaît lui-même et reste vert le jour où le motif cesse de servir.
 *
 *   node --experimental-strip-types scripts/verifier-seconde-demande.ts
 */
import { porteUneSecondeDemande } from "../src/lib/secondeDemande.ts"
import { interpreterLocalement } from "../src/lib/commandeLocale.ts"

let echecs = 0
function verifier(nom: string, ok: boolean) {
  console.log(`${ok ? "  ok  " : "ECHEC "} ${nom}`)
  if (!ok) echecs++
}

/* ---------- Ce qui DOIT être reconnu comme deux demandes ---------- */

// SA DICTÉE, mot pour mot, 15 sept. 2026 06:32:17. Jarvis n'a fait que la
// supprimer, et la réponse portait source: "appareil".
verifier(
  "sa dictée du 15 sept. : supprimer PUIS créer",
  porteUneSecondeDemande(
    "supprime la tache rappel jonathan ducamp et cree la tache rappel jonathan dukan dans la partie perso",
  ),
)

// Le pronom collé par un tiret : exiger une espace derrière le verbe laissait
// passer celle-ci.
verifier(
  "le verbe suivi d'un pronom collé (« et envoie-la »)",
  porteUneSecondeDemande("telecharge la facture recue par mail de github et envoie-la a finbot sur whatsapp"),
)

verifier(
  "deux demandes séparées par une virgule",
  porteUneSecondeDemande("ajoute une tache pour rappeler le carreleur, et marque la facture d electricite comme payee"),
)

verifier(
  "« puis » vaut « et »",
  porteUneSecondeDemande("supprime la tache courses puis ajoute une tache acheter du pain"),
)

/* ---------- Ce qui NE DOIT PAS l'être : SES VRAIS TITRES ----------
   C'est la moitié qui compte. Ses titres portent des « et » parfaitement
   innocents, et les prendre pour une seconde demande enverrait au serveur
   une phrase que l'appareil savait traiter — gratuitement et hors ligne. */

const SES_TITRES_AVEC_ET = [
  "acheter coque airpods et clefs de voiture",
  "gocardless a relancer et molly",
  "appeler yoni pour demarrer + data et robot",
]
for (const titre of SES_TITRES_AVEC_ET) {
  verifier(
    `son vrai titre reste une seule demande : « ${titre} »`,
    !porteUneSecondeDemande(`supprime la tache ${titre}`),
  )
}

verifier(
  "un « et » qui relie deux compléments, pas deux verbes",
  !porteUneSecondeDemande("ajoute une tache acheter du pain et du lait"),
)

verifier(
  "un nom qui commence comme un verbe ne compte pas (« et metro »)",
  !porteUneSecondeDemande("ajoute une tache prendre le billet et metro ligne 3"),
)

/* ---------- Et l'effet réel sur la reconnaissance locale ----------
   Le module pur ne prouve rien tout seul : ce qui compte est que
   `interpreterLocalement` RENDE LA MAIN sur sa phrase, pour que le serveur
   puisse produire les deux actions dans l'ordre. */

const ctx = {
  taches: [{ id: "t1", title: "Rappel Jonathan Ducamp", notes: null, status: "todo" }],
  chantiers: [],
  contacts: [],
  categories: [],
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier(
  "sa phrase ne part plus en une seule moitié : l'appareil rend la main",
  interpreterLocalement(
    "supprime la tâche Rappel Jonathan Ducamp et crée la tâche Rappel Jonathan Dukan dans la partie perso",
    ctx,
  ) === null,
)

// Le pendant : sans seconde demande, l'appareil traite toujours, sinon on
// aurait « corrigé » le défaut en renvoyant tout au serveur.
const seule = interpreterLocalement("supprime la tâche Rappel Jonathan Ducamp", ctx)
verifier(
  "une suppression seule reste traitée sur l'appareil",
  seule !== null && seule.length === 1 && seule[0].action === "delete_task",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
