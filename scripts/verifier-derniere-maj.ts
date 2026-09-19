/**
 * Vérifie qu'un chantier déplié peut montrer sa dernière mise à jour seule,
 * au lieu de tout le pavé historique — sans jamais couper au mauvais endroit.
 *
 *   node --experimental-strip-types scripts/verifier-derniere-maj.ts
 *
 * Aucun réseau. Plainte de Raphaël, 17 sept. 2026 (chantier e71199d6) : un
 * chantier déplié affiche tout l'historique accumulé par chaque session, et
 * il ne comprend plus où ça en est. Le correctif est dans l'AFFICHAGE
 * seulement — `derniereMajChantier` ne modifie ni ne supprime rien, il choisit
 * juste quel paragraphe montrer en premier.
 *
 * Les extraits ci-dessous sont recopiés du VRAI format de notes trouvé en
 * base le 17 sept. 2026 (fa16146d, ba140853, 920ff758) — pas inventés.
 */
import { derniereMajChantier, paragraphesNotes } from "../src/lib/derniereMajChantier.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// --- Cas 1 : chantier court, sans historique (une seule mise à jour, jamais
// touché par une seconde session). La dernière mise à jour EST tout le texte.
{
  const notes = "Ameliorer la pertinence et la coherence des titres des chantiers crees automatiquement dans le cockpit dev"
  const derniere = derniereMajChantier(notes)
  verifier(
    "chantier court : la dernière mise à jour est le texte entier",
    derniere === notes,
    `obtenu : ${JSON.stringify(derniere)}`,
  )
  verifier(
    "chantier court : un seul paragraphe, donc pas d'historique à cacher",
    paragraphesNotes(notes).length === 1,
  )
}

// --- Cas 2 : marqueur en tête, aucune mise à jour après. Le marqueur ne doit
// jamais être pris pour « la dernière mise à jour ».
{
  const notes = "[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]\nPérimètre pas assez défini pour coder sans lui."
  const derniere = derniereMajChantier(notes)
  verifier(
    "marqueur seul : la dernière mise à jour ne contient pas le crochet",
    derniere !== null && !derniere.startsWith("["),
    `obtenu : ${JSON.stringify(derniere)}`,
  )
}

// --- Cas 3 : chantier archivé court, une seule mise à jour après la demande
// d'origine (format réel de 920ff758, archivé le 17 sept. 2026).
{
  const notes = [
    "Pouvoir connaitre le moteur de langue utilise en temps reel, meme en mode automatique, pour identifier le plus performant.",
    "Fait le 17 sept. 2026 : voice-command joint désormais à chaque phrase le modèle qui a REELLEMENT répondu à ses dernières commandes. Déployé (voice-command v111) et vérifié bout-en-bout (41/41). Fusionné sur claude/new-session-rn6puh, commit be620b0.",
  ].join("\n\n")
  const derniere = derniereMajChantier(notes)
  verifier(
    "chantier archivé : la dernière mise à jour est le compte rendu final, pas la demande d'origine",
    derniere !== null && derniere.startsWith("Fait le 17 sept. 2026"),
    `obtenu : ${JSON.stringify(derniere)}`,
  )
  verifier(
    "chantier archivé : deux paragraphes, donc un historique existe derrière",
    paragraphesNotes(notes).length === 2,
  )
}

// --- Cas 4 : chantier long, plusieurs sessions séparées par des lignes vides
// et des en-têtes hétérogènes (format réel de fa16146d, plusieurs milliers de
// caractères en base). La dernière mise à jour doit être la toute dernière
// entrée écrite — pas le marqueur, pas une entrée du milieu.
{
  const notes = [
    "[LIBRE — la dependance n'attend plus de decision de Raphael. Attend juste le code.]",
    '[BLOQUÉ PAR : "Mémoire longue durée" et "Notifications push", à cadrer avec Raphaël]\n[Questionnaire] Oui. Raphaël : « il peut soit rajouter un rappel dans Google Agenda… »',
    "[session parallel-tasks, 03/09] Décision actée : publier l'app Google SANS demander la vérification.",
    "[FICHE DE DEBLOCAGE, 3 sept.] Ce chantier attend une configuration manuelle de Raphael.",
    "[MISE À JOUR 7 sept. 2026, claude/signale-0709] Les deux dépendances sont maintenant réellement livrées. CE QUI MANQUE VRAIMENT, donc : une phrase dans la consigne…",
    "JE N'AI PAS TOUCHÉ à supabase/functions/voice-command/index.ts, volontairement.",
    "À FAIRE PAR LA PROCHAINE SESSION : ajouter la phrase de consigne ci-dessus, déployer voice-command, puis vérifier.",
    "[EN COURS, claude/rappels-canal-0709, 7 sept. 22h47 UTC] Code déployé (voice-command v102), vérification réelle bloquée par le quota du jour de la clé de test. Reprendre après ~08h UTC.",
  ].join("\n\n")
  const derniere = derniereMajChantier(notes)
  verifier(
    "chantier long (fa16146d) : la dernière mise à jour est la toute dernière entrée écrite",
    derniere !== null && derniere.startsWith("[EN COURS, claude/rappels-canal-0709"),
    `obtenu : ${JSON.stringify(derniere)}`,
  )
  verifier(
    "chantier long : ce n'est ni le marqueur [LIBRE] ni une entrée du milieu",
    derniere !== null &&
      !derniere.startsWith("[LIBRE") &&
      !derniere.includes("JE N'AI PAS TOUCHÉ"),
  )
  verifier("chantier long : plusieurs paragraphes, donc un historique à proposer", paragraphesNotes(notes).length > 1)
}

// --- Cas 5 : lignes vides multiples entre deux sessions (deux, trois lignes
// blanches d'affilée, cas réel trouvé dans ba140853) — ne doit pas produire de
// paragraphe vide au milieu.
{
  const notes = "Première mise à jour.\n\n\n\nDeuxième mise à jour, bien plus tard."
  const blocs = paragraphesNotes(notes)
  verifier(
    "plusieurs lignes vides d'affilée : toujours deux paragraphes, pas trois",
    blocs.length === 2,
    `obtenu ${blocs.length} : ${JSON.stringify(blocs)}`,
  )
  verifier(
    "plusieurs lignes vides d'affilée : la dernière mise à jour est bien la seconde",
    derniereMajChantier(notes) === "Deuxième mise à jour, bien plus tard.",
  )
}

// --- Cas 6 : régression trouvée par Raphaël le 17 sept. 2026 (chantier
// 4be6b04c), sur le VRAI chantier 6d94ab6a. Le dernier paragraphe
// chronologique est un rangement de sections purement administratif, sans
// aucun rapport avec la question du chantier — il ne doit jamais être pris
// pour « la dernière mise à jour ».
{
  const notes = [
    "[À CADRER AVEC RAPHAËL AVANT DE COMMENCER — périmètre pas assez défini pour coder sans lui : quoi enregistrer exactement, où l'afficher, et en quoi ça diffère de ce qui existe déjà (journal_ecoute, jarvis_erreurs, dev_log).]",
    "Dans le cockpit dev sur l'enregistrement du comportement entre le telephone et ce que je fais a l'audio en vocal ainsi que mes interactions de clic sur l'application afin de comprendre reellement comment jarvis se comporte lors de mes requetes et de mes differents problemes",
    "--- 6 sept. 2026, rangement des sections (chantier 765af020). Rattaché à « L'app elle-même » : son ancien thème (un seul chantier) n'avait pas de section déclarée, et une section pour un seul chantier éparpille au lieu de rassembler.",
  ].join("\n\n")
  const derniere = derniereMajChantier(notes)
  verifier(
    "6d94ab6a : la dernière mise à jour n'est jamais le rangement de sections",
    derniere !== null && !derniere.includes("rangement des sections"),
    `obtenu : ${JSON.stringify(derniere)}`,
  )
  verifier(
    "6d94ab6a : la dernière mise à jour retombe sur la vraie demande d'origine",
    derniere !== null && derniere.startsWith("Dans le cockpit dev"),
    `obtenu : ${JSON.stringify(derniere)}`,
  )
}

// --- Cas 7 : un paragraphe daté qui n'est PAS un rangement de sections reste
// une vraie mise à jour — le motif administratif ne doit écarter que ce cas
// précis, pas n'importe quel paragraphe commençant par des tirets.
{
  const notes = [
    "Première mise à jour, contexte d'origine.",
    "--- 9 sept. 2026, claude/une-session. Code déployé et vérifié bout-en-bout, 41/41.",
  ].join("\n\n")
  const derniere = derniereMajChantier(notes)
  verifier(
    "paragraphe daté ordinaire : reste la dernière mise à jour, n'est pas écarté",
    derniere === "--- 9 sept. 2026, claude/une-session. Code déployé et vérifié bout-en-bout, 41/41.",
    `obtenu : ${JSON.stringify(derniere)}`,
  )
}

// --- Cas limites : notes vides ou nulles ne doivent jamais planter.
{
  verifier("notes nulles : aucune dernière mise à jour", derniereMajChantier(null) === null)
  verifier("notes vides : aucune dernière mise à jour", derniereMajChantier("") === null)
  verifier(
    "notes réduites au marqueur seul : aucune dernière mise à jour",
    derniereMajChantier("[LIBRE]") === null,
  )
}

// --- La dernière mise à jour est toujours PLUS COURTE (ou égale) que le
// texte complet : c'est elle qui réduit la hauteur d'un chantier déplié, pas
// l'inverse — condition explicite du chantier e71199d6.
{
  const long = [
    "[LIBRE] intro d'origine, assez longue pour ne pas être la dernière mise à jour à elle seule.",
    "Deuxième bloc, plus court.",
  ].join("\n\n")
  const derniere = derniereMajChantier(long)!
  verifier(
    "la dernière mise à jour ne dépasse jamais la longueur du texte complet",
    derniere.length <= long.length,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
