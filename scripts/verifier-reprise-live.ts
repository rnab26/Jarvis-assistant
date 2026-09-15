/**
 * UNE FERMETURE SUBIE NE FINIT PAS LA CONVERSATION — ET UNE PANNE INSTALLÉE NE
 * BOUCLE PAS. Chantier `dde25deb`.
 *
 *   node --experimental-strip-types scripts/verifier-reprise-live.ts
 *
 * Aucun réseau. La moitié de ces contrôles vérifie ce qu'on NE rouvre PAS :
 * une conversation qui se rouvrirait toute seule sur un échec d'ouverture
 * répéterait la même panne en cachant le message qui l'explique, et c'est pire
 * que la coupure qu'on corrige.
 *
 * LES CAS SONT SES DEUX OCCURRENCES RÉELLES, copiées de `journal_ecoute`, pas
 * des paraphrases de la règle — c'est le piège payé par le filtre des sessions
 * autonomes le 6 sept. 2026, dont les cinq cas d'essai étaient des
 * reformulations de ses propres expressions régulières et ne pouvaient qu'être
 * verts.
 *
 * ESSAYÉ À L'ENVERS avant d'être cru : rendre `{ reprendre: true }` sur une
 * session qui ne s'était pas ouverte fait rougir deux contrôles ; retirer le
 * plafond `REPRISES_APRES_PANNE_MAX` en fait rougir un troisième ; taire les
 * tentatives dans le message final en fait rougir un quatrième.
 */
import {
  deciderReprise,
  messageApresReprises,
  REPRISES_APRES_PANNE_MAX,
  RECONNEXIONS_MAX,
  DUREE_MIN_POUR_RECONNECTER_MS,
  type Fermeture,
} from "../src/lib/live/repriseLive.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/** Une fermeture ordinaire, qu'on précise cas par cas. */
const fermeture = (p: Partial<Fermeture> = {}): Fermeture => ({
  parRaphael: false,
  ouverte: true,
  dureeMs: 60000,
  reprises: 0,
  reprisesApresPanne: 0,
  arretDemande: false,
  ...p,
})

// ── Ses deux occurrences, telles qu'elles sont en base ────────────────────────

/** 15 sept. 2026, 06:33:25 UTC, 48 513 ms, capture à l'appui : il était en
 * train de corriger une tâche quand la conversation s'est arrêtée. */
const le15Sept = fermeture({ raison: "Session fermée : Internal error occurred.", dureeMs: 48513 })
const d15 = deciderReprise(le15Sept)
verifier(
  "la fermeture du 15 sept. (48,5 s, en pleine correction de tâche) rouvre la conversation",
  d15.reprendre === true && d15.apresPanne === true,
  "c'est le cas qui a fait écrire ce chantier : il perdait la conversation au milieu d'une phrase",
)

/** 10 sept. 2026, 20:20:24 UTC, 12 864 ms. Même message, durée trois fois
 * moindre : la conversation avait bel et bien eu lieu, elle se rouvre aussi.
 * La durée ne discrimine QUE les fermetures sans raison (la limite des quinze
 * minutes) — s'en servir ici ferait dépendre la survie d'un seuil qui n'a
 * jamais été mesuré sur ce cas-là. */
const le10Sept = fermeture({ raison: "Session fermée : Internal error occurred.", dureeMs: 12864 })
verifier(
  "la fermeture du 10 sept. (12,9 s) rouvre aussi : la durée ne décide pas d'une panne annoncée",
  deciderReprise(le10Sept).reprendre === true,
  "un seuil de durée appliqué à une fermeture qui porte une raison n'a jamais été mesuré",
)

// ── Ce qu'on ne rouvre JAMAIS ────────────────────────────────────────────────

verifier(
  "une ouverture qui n'a jamais abouti ne se rejoue pas",
  deciderReprise(fermeture({ raison: "Le micro n'a pas répondu. Une autre application le tient peut-être.", ouverte: false })).reprendre === false,
  "on répéterait le même échec en boucle, en cachant le message qui l'explique",
)

const microMuet = deciderReprise(fermeture({ raison: "Le micro n'a pas répondu. Une autre application le tient peut-être.", ouverte: false }))
verifier(
  "et le message de cet échec-là arrive tel quel à Raphaël",
  microMuet.reprendre === false && microMuet.message === "Le micro n'a pas répondu. Une autre application le tient peut-être.",
  "un échec d'ouverture avalé, c'est un cœur qui s'éteint sans un mot",
)

verifier(
  "un jeton refusé ne se rejoue pas non plus",
  deciderReprise(fermeture({ raison: "Impossible d'ouvrir la conversation : pas de jeton", ouverte: false })).reprendre === false,
  "rejouer un refus de jeton consomme le quota pour répéter le même refus",
)

verifier(
  "sa clôture à lui est définitive, même sur une session parfaitement saine",
  deciderReprise(fermeture({ parRaphael: true })).reprendre === false,
  "rouvrir après un appui sur le cœur ou un « terminé » lui reprendrait le micro qu'il vient de rendre",
)

verifier(
  "et elle ne dit rien : une clôture voulue n'est pas une panne",
  deciderReprise(fermeture({ parRaphael: true })).reprendre === false &&
    (deciderReprise(fermeture({ parRaphael: true })) as { message?: string }).message === undefined,
  "afficher un message après un « terminé » ferait passer sa décision pour un incident",
)

verifier(
  "un arrêt demandé pendant qu'on décidait l'emporte sur tout le reste",
  deciderReprise(fermeture({ raison: "Session fermée : Internal error occurred.", arretDemande: true })).reprendre === false,
  "il a appuyé pour arrêter : rouvrir malgré ça est la pire des réponses",
)

// ── Le plafond, et ce qu'on dit en renonçant ─────────────────────────────────

verifier(
  `on renonce après ${REPRISES_APRES_PANNE_MAX} reprises après panne`,
  deciderReprise(fermeture({ raison: "Session fermée : Internal error occurred.", reprisesApresPanne: REPRISES_APRES_PANNE_MAX })).reprendre === false,
  "sans plafond, une panne installée ferait boucler l'ouverture de session sans fin ni message",
)

const renonce = deciderReprise(
  fermeture({ raison: "Session fermée : Internal error occurred.", reprises: 2, reprisesApresPanne: REPRISES_APRES_PANNE_MAX }),
)
verifier(
  "et en renonçant, on DIT qu'on a essayé",
  renonce.reprendre === false && typeof renonce.message === "string" && renonce.message.includes("rouvert"),
  "trois fermetures d'affilée présentées comme une seule, et il rappuie pour retomber dessus",
)

verifier(
  "le message de renoncement dit aussi que ce n'est pas lui",
  typeof renonce.message === "string" && renonce.message.includes("ce n'est pas toi"),
  "sans ça il cherche ce qu'il a mal fait pendant que la panne est ailleurs",
)

verifier(
  "sans aucune reprise, le message reste la raison nue",
  messageApresReprises("Session fermée : Internal error occurred.", 0) === "Session fermée : Internal error occurred.",
  "annoncer des tentatives qui n'ont pas eu lieu est exactement ce que honnetete.ts interdit",
)

verifier(
  "une seule reprise se dit « une fois », pas « 1 fois »",
  messageApresReprises("Coupé.", 1).includes("une fois"),
  "détail de langue, mais c'est une phrase qu'il entend",
)

// ── Les deux compteurs restent séparés ───────────────────────────────────────

verifier(
  "un quart d'heure de conversation ne consomme pas le droit de survivre à une panne",
  deciderReprise(fermeture({ raison: "Session fermée : Internal error occurred.", reprises: 5, reprisesApresPanne: 0 })).reprendre === true,
  "cinq reconnexions normales (la limite des 15 min de Google) sont le fonctionnement attendu, pas des pannes",
)

verifier(
  "et une panne ne mange pas les reconnexions normales de Google",
  deciderReprise(fermeture({ reprises: 3, reprisesApresPanne: 2, dureeMs: 900000 })).reprendre === true,
  "après deux pannes traversées, une conversation qui dure doit encore pouvoir passer la limite des 15 minutes",
)

verifier(
  "le plafond global reste, même sans aucune panne",
  deciderReprise(fermeture({ reprises: RECONNEXIONS_MAX, dureeMs: 900000 })).reprendre === false,
  "une conversation rouverte indéfiniment n'est plus une conversation",
)

// ── La limite des quinze minutes, inchangée ──────────────────────────────────

verifier(
  "une fermeture muette après un vrai bout de conversation se rouvre (la limite des 15 min)",
  deciderReprise(fermeture({ dureeMs: 900000 })).reprendre === true,
  "c'est le comportement d'avant ce chantier, et il ne doit pas avoir bougé",
)

const muetteCourte = deciderReprise(fermeture({ dureeMs: DUREE_MIN_POUR_RECONNECTER_MS - 1 }))
verifier(
  "une fermeture muette et immédiate ne se rouvre pas",
  muetteCourte.reprendre === false,
  "sans raison ET sans durée, on ne sait pas ce qui s'est passé : rouvrir serait deviner",
)

verifier(
  "une reprise après panne est comptée comme telle, pas comme une reconnexion ordinaire",
  (deciderReprise(fermeture({ raison: "Session fermée : Internal error occurred." })) as { apresPanne?: boolean }).apresPanne === true &&
    (deciderReprise(fermeture({ dureeMs: 900000 })) as { apresPanne?: boolean }).apresPanne === false,
  "confondre les deux rendrait le compte des « Internal error » illisible dans le journal",
)

// ── Les deux endroits qui décidaient dans sessionLive.ts n'en font plus qu'un ─

import { readFileSync } from "node:fs"
const source = readFileSync("src/lib/live/sessionLive.ts", "utf8")
const maintenir = source.slice(source.indexOf("export async function maintenirSessionLive"))
const appels = (maintenir.match(/deciderReprise\(\{/g) ?? []).length
verifier(
  "maintenirSessionLive appelle la même décision à ses DEUX endroits",
  appels === 2,
  `${appels} appel(s) à deciderReprise trouvé(s) : la décision d'avaler le « fermee » et celle de reboucler ` +
    "doivent être la même, sinon le cœur reste sur « connexion » devant une session qui ne rouvrira jamais",
)

verifier(
  "aucune des deux ne réécrit le seuil à la main",
  !/Date\.now\(\) - debut >= 3\d{4}/.test(maintenir) && !maintenir.includes("reconnexions < "),
  "un seuil recopié ici diverge de repriseLive.ts sans que rien ne le signale",
)

/** UN ARRÊT PENDANT LA CONNEXION FERME QUAND MÊME LA SESSION. `arreter()` ne
 * peut rien clore tant que `demarrerSessionLive` n'a pas rendu la main : la
 * session qui aboutit ensuite n'a plus personne pour la fermer, le micro reste
 * pris, et `definirLiveActifNatif(false)` n'est jamais appelé — donc la veille
 * de l'autre fenêtre se tait pour toujours. Défaut antérieur à ce chantier,
 * trouvé en le faisant. */
verifier(
  "un arrêt demandé pendant la connexion ferme la session qui aboutit quand même",
  /if \(arretDemande\) \{\s*\n\s*courante\.arreter\(\)/.test(maintenir),
  "sans ça le micro et le WebSocket restent ouverts indéfiniment, et rien ne le dit",
)

/** LE CŒUR NE RESTE JAMAIS SUR « CONNEXION » DEVANT RIEN. On avale le
 * « fermee » pour promettre une reprise ; si elle n'a pas lieu — il appuie sur
 * arrêter dans l'intervalle, et sa décision l'emporte sur la nôtre —, plus
 * personne ne dit à l'écran que c'est fini. Défaut antérieur à ce chantier,
 * corrigé avec lui : les deux décisions étant désormais la même, il ne reste
 * que cette course-là à couvrir. */
verifier(
  "une reprise promise puis annulée referme quand même le cœur",
  /avalee\s*=\s*true/.test(maintenir) && /if \(avalee\) ev\.onEtat\("fermee"/.test(maintenir),
  "sans ça le cœur reste sur « connexion » devant une session qui ne rouvrira jamais, " +
    "et il n'a aucun moyen de savoir que Jarvis n'écoute plus",
)

verifier(
  "une reprise après panne laisse une trace distincte dans le journal",
  /apres_panne:/.test(maintenir),
  "sans elle, les reprises après « Internal error » se noient dans les reconnexions des 15 minutes",
)

/** Ce qui précède une fermeture ne se retrouve plus après : les deux premières
 * occurrences n'ont pu être rapprochées qu'à la main, en relisant les lignes
 * voisines. La prochaine doit arriver déjà comparable. */
const fermer = source.slice(source.indexOf("const fermer = ("), source.indexOf("/** Clôture à la voix"))
for (const champ of ["commandes", "ms_depuis_commande", "parlait", "ouverte"]) {
  verifier(
    `live_fin emporte « ${champ} », ce qui précède la fermeture`,
    fermer.includes(`${champ}`),
    "sans ce relevé, comparer la prochaine occurrence demandera la même enquête à la main que les deux premières",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
