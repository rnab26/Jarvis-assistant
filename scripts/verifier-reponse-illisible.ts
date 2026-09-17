/**
 * LE MODE LIVE AFFICHAIT DU CHARABIA ET RESTAIT BLOQUÉ SANS RIEN ENREGISTRER.
 * Chantier `40f07c12`, signalé le 17 sept. 2026 : « Jarvis : <ctrl46><ctrl46> »
 * affiché à l'écran, puis plus rien — ni `live_commande` ni `live_fin` dans
 * `journal_ecoute` après sa demande.
 *
 *   node --experimental-strip-types scripts/verifier-reponse-illisible.ts
 *
 * Aucun réseau. Confirmé côté Google le 17 sept. (forum officiel des
 * développeurs Gemini) : un bug ouvert en janvier 2026 pour
 * `gemini-2.5-flash-native-audio-preview` décrit le même symptôme — des
 * jetons de contrôle bruts à la place de l'audio, et « the session never
 * recovers » pour certains cas. Détail dans `src/lib/live/reponseIllisible.ts`.
 *
 * Deux familles de contrôles : la détection pure (avec le cas EXACT de sa
 * capture, pas une paraphrase), et la présence réelle du branchement dans
 * `sessionLive.ts` — essayée à l'envers avant d'être crue, comme le reste du
 * projet : retirer le filtrage à l'affichage, ou l'appel à `fermer()` sur le
 * minuteur, ou son annulation à `turnComplete`, doit faire rougir un
 * contrôle distinct de celui qui vérifie sa présence.
 */
import { readFileSync } from "node:fs"
import { contientJetonDeControle, sansJetonsDeControle } from "../src/lib/live/reponseIllisible.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── La détection, sur son cas réel ───────────────────────────────────────────

verifier(
  "sa capture exacte du 17 sept. est détectée",
  contientJetonDeControle("<ctrl46><ctrl46>"),
  "c'est le cas qui a fait écrire ce chantier",
)

verifier(
  "un seul jeton isolé dans une phrase autrement correcte est détecté aussi",
  contientJetonDeControle("Je vais créer le chantier <ctrl46> pour ça."),
  "le bug peut interrompre une réponse en cours de route, pas seulement la remplacer en entier",
)

verifier(
  "un autre numéro de jeton (<ctrl123>) est détecté pareil",
  contientJetonDeControle("<ctrl123>"),
  "le motif ne doit pas être figé sur 46",
)

// ── Ce qui NE doit PAS se déclencher ─────────────────────────────────────────

verifier(
  "une phrase normale n'est jamais touchée",
  !contientJetonDeControle("J'ai créé le chantier « Le micro se coupe trop vite »."),
  "un faux positif priverait Raphaël d'une vraie réponse",
)

verifier(
  "le mot « contrôle », en français, ne déclenche rien",
  !contientJetonDeControle("Je n'ai pas le contrôle de cette application."),
  "c'est le mot français le plus proche du motif — il ne doit jamais matcher",
)

verifier(
  "« ctrl46 » sans les chevrons ne déclenche rien",
  !contientJetonDeControle("ctrl46"),
  "le motif exact rapporté porte les chevrons ; les retirer élargirait la détection sans raison mesurée",
)

// ── Ce qui reste affichable une fois nettoyé ─────────────────────────────────

verifier(
  "un texte entièrement composé de jetons devient une chaîne vide",
  sansJetonsDeControle("<ctrl46><ctrl46>") === "",
  "affiché tel quel, Raphaël verrait passer le charabia — vide, rien ne s'affiche du tout",
)

const nettoye = sansJetonsDeControle("Je vais créer le chantier <ctrl46> pour ça.")
verifier(
  "un texte mêlé garde sa partie lisible, sans le jeton",
  nettoye.includes("Je vais créer le chantier") && nettoye.includes("pour ça.") && !nettoye.includes("<ctrl"),
  "jeter tout le tour parce qu'il porte UN jeton perdrait une réponse par ailleurs correcte",
)

verifier(
  "un texte sans aucun jeton ressort inchangé (à l'espace près)",
  sansJetonsDeControle("J'appelle Dan Marciano Bureau.") === "J'appelle Dan Marciano Bureau.",
  "le nettoyage ne doit toucher que les jetons, jamais le reste",
)

// ── Le branchement dans sessionLive.ts, essayé à l'envers ───────────────────

const source = readFileSync("src/lib/live/sessionLive.ts", "utf8")

verifier(
  "sessionLive.ts importe la détection, pas une réécriture locale du motif",
  /from "@\/lib\/live\/reponseIllisible"/.test(source),
  "une seconde copie du motif divergerait de celle vérifiée ici sans que rien ne le signale",
)

const blocSortie = source.slice(
  source.indexOf('if (contenu?.outputTranscription?.text) {'),
  source.indexOf('for (const part of contenu?.modelTurn?.parts ?? []) {'),
)
verifier(
  "le texte affiché en cours de tour est TOUJOURS le texte nettoyé, jamais le brut accumulé",
  /ev\.onReponse\(propre, false\)/.test(blocSortie) && !/ev\.onReponse\(reponseEnCours, false\)/.test(blocSortie),
  "afficher reponseEnCours brut remettrait le charabia à l'écran, exactement le défaut signalé",
)

verifier(
  "un jeton de contrôle détecté est tracé dans journal_ecoute",
  /noterEcoute\("live_reponse_anormale"/.test(blocSortie),
  "sans cette trace, la prochaine occurrence resterait aussi invisible que celle du 17 sept.",
)

verifier(
  "un jeton détecté arme un minuteur qui referme la session",
  /minuteurAnormale\s*=\s*setTimeout\(/.test(blocSortie) && /fermer\("Le service vocal a renvoyé une réponse illisible\."\)/.test(blocSortie),
  "sans lui, un tour qui ne se termine jamais (turnComplete absent) laisse la conversation bloquée pour de bon — exactement le cas mesuré",
)

verifier(
  "le minuteur ne s'arme qu'une fois par tour, pas à chaque jeton reçu",
  /if \(!minuteurAnormale\) \{/.test(blocSortie),
  "sans cette garde, une rafale de jetons reprogrammerait le délai indéfiniment et ne fermerait jamais",
)

const blocTurnComplete = source.slice(source.indexOf("if (contenu?.turnComplete) {"), source.indexOf("if (m.toolCall?.functionCalls?.length) {"))
verifier(
  "un tour qui se termine normalement désarme le minuteur",
  /annulerMinuteurAnormale\(\)/.test(blocTurnComplete),
  "sans ça, un tour redevenu normal après un jeton isolé fermerait quand même la session huit secondes plus tard, pour rien",
)
verifier(
  "et affiche la version nettoyée à la fin du tour, pas le brut",
  /ev\.onReponse\(propre, true\)/.test(blocTurnComplete) && !/ev\.onReponse\(reponseEnCours, true\)/.test(blocTurnComplete),
  "le flush final doit passer par le même nettoyage que l'affichage en cours de route",
)

const blocInterrompu = source.slice(source.indexOf("if (contenu?.interrupted) {"), source.indexOf("if (contenu?.inputTranscription?.text) {"))
verifier(
  "une interruption par Raphaël désarme aussi le minuteur",
  /annulerMinuteurAnormale\(\)/.test(blocInterrompu),
  "sans ça, un minuteur armé sur le tour qu'il vient de couper fermerait la session après coup",
)

const blocFermer = source.slice(source.indexOf("const fermer = ("), source.indexOf("/** Clôture à la voix"))
verifier(
  "fermer() lui-même annule le minuteur, quel que soit le chemin de fermeture",
  /annulerMinuteurAnormale\(\)/.test(blocFermer),
  "sinon un minuteur resté armé après une fermeture par un autre chemin (appui, « terminé », panne réseau) se déclencherait sur une session déjà close",
)

// ── Le registre des erreurs voit passer la trace ─────────────────────────────

const erreurs = readFileSync("src/lib/erreurs.ts", "utf8")
verifier(
  "l'événement tracé est repris dans le registre des erreurs",
  /evenement === "live_reponse_anormale"/.test(erreurs),
  "sans ce branchement, la trace existe mais ne se voit dans aucune carte du cockpit",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
