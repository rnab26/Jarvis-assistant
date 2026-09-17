import type { TourJarvis } from "./retours.ts"

/**
 * Corriger ou faire relire un message WhatsApp/SMS PRÉPARÉ, à la voix, avant
 * de l'envoyer — chantier ed32cbcc.
 *
 * CE QUE ÇA COMPLÈTE. `confirmationEnvoi.ts` sait déjà reconnaître « vas-y »,
 * « envoie-le » après préparation, et les cliquer sur Envoyer. Mais si la
 * réponse n'est ni « oui » ni « envoie », rien ne la rattachait au message en
 * attente : elle partait comme une phrase toute neuve, sans que le serveur
 * sache jamais qu'un brouillon était déjà écrit — MÊME DÉFAUT que
 * `confirmationEnvoi.ts` décrit pour « envoie-le » (chantier 21cf48d2) :
 * `resolveTranscript` n'envoie au serveur que la phrase courante, jamais le
 * tour précédent. La reconnaissance doit donc se faire ICI, avec
 * `dernierTourRef`, comme pour la confirmation.
 *
 * DEUX BESOINS DISTINCTS. « remplace X par Y », « enlève la dernière
 * phrase » : une CORRECTION, qui doit récrire le MÊME brouillon plutôt que
 * d'en ouvrir un second ou de laisser l'ancien tel quel — voir
 * `phraseCorrection`, qui repart au serveur (seul endroit qui sait récrire
 * un texte, pas de bricolage de chaînes ici). « relis-le moi », « qu'est-ce
 * que t'as écrit » : une RELECTURE, qui ne modifie ni n'envoie rien — Jarvis
 * dit juste le texte tel qu'il est, `parler()`, sans aller-retour serveur.
 *
 * LE GARDE-FOU CONTRE LES FAUX POSITIFS. « remplace », « change », « enlève »,
 * « ajoute », « supprime » sont aussi des verbes d'AUTRES domaines (« ajoute
 * une tâche », « supprime le rappel de la villa Dan »). Contrairement à
 * confirmationEnvoi.ts (vocabulaire fermé et sans ambiguïté : « vas-y »,
 * « envoie-le »), ceux-ci sont trop génériques pour être sûrs seuls. Deux
 * garde-fous : (1) le verbe doit être EN TÊTE de phrase (ancré), comme
 * partout ailleurs dans ce projet ; (2) `AUTRE_DOMAINE` exclut toute phrase
 * qui nomme un autre objet du projet (tâche, chantier, rappel, alarme…) —
 * un faux négatif renvoie la phrase au pipeline normal (qui la traite très
 * bien), un faux positif récrirait le message à la place de supprimer une
 * tâche.
 *
 * Module PUR : aucun appel à Android, au serveur ni à React. Vérifié par
 * scripts/verifier-correction-message.ts.
 */

/** Même fenêtre que `confirmationEnvoi.ts` : au-delà, une phrase seule est
 * trop loin du message préparé pour lui être rattachée sans risque. */
export const FENETRE_MS = 90_000

const ACTIONS_PREPARATION = new Set(["send_message"])

/** Ce que « corriger/relire un message » ne doit PAS avaler : une phrase qui
 * nomme un autre objet du projet est une AUTRE demande, même si elle
 * commence par un verbe qu'on reconnaît par ailleurs pour les messages. */
const AUTRE_DOMAINE =
  /\b(t[âa]che|chantiers?|rappels?|alarmes?|minuteurs?|calendrier|rendez-?vous|[ée]v[ée]nements?|notes?|contacts?|documents?|sections?)\b/i

function dernierEstUnMessagePrepare(dernierTour: TourJarvis | null, maintenant: number): boolean {
  if (!dernierTour) return false
  if (maintenant - dernierTour.at > FENETRE_MS) return false
  return dernierTour.actions.some((a) => ACTIONS_PREPARATION.has(a))
}

/** Les tournures qui demandent d'ENTENDRE le message, sans le changer. */
const MOTIFS_RELECTURE = [
  /^relis(?:-le|-moi)?(?:\s+le\s+message)?\b/i,
  /^r[ée]p[èe]te(?:\s+le\s+message)?\b/i,
  /^qu'?est[\s-]?ce que (?:tu as|t'as) [ée]crit\b/i,
  /^c'est quoi le message\b/i,
  /^rappelle-?moi le message\b/i,
]

/**
 * Vrai si, après un message préparé, cette phrase demande une RELECTURE —
 * Jarvis doit dire le texte tel qu'il est, sans rien d'autre.
 */
export function estDemandeRelectureMessage(
  dernierTour: TourJarvis | null,
  phrase: string,
  maintenant: number,
): boolean {
  if (!dernierEstUnMessagePrepare(dernierTour, maintenant)) return false
  const texte = phrase.trim()
  if (!texte) return false
  return MOTIFS_RELECTURE.some((re) => re.test(texte))
}

/** Les tournures qui demandent de RÉCRIRE le message — vocabulaire large
 * exprès (c'est le serveur qui interprète le détail de la correction), mais
 * ancré en tête de phrase et filtré par `AUTRE_DOMAINE`. */
const MOTIFS_CORRECTION = [
  /^remplace\b/i,
  /^change\b/i,
  /^enl[èe]ve\b/i,
  /^retire\b/i,
  /^supprime\b/i,
  /^ajoute\b/i,
  /^raccourcis\b/i,
  /^rallonge\b/i,
  /^reformule\b/i,
  /^corrige\b/i,
  /^r[ée]cris\b/i,
  /^mets plut[ôo]t\b/i,
  /^[ée]cris plut[ôo]t\b/i,
  /^au lieu de\b/i,
]

/**
 * Vrai si, après un message préparé, cette phrase demande de le CORRIGER —
 * à recomposer avec un texte différent, pas à créer un second message.
 */
export function estCorrectionMessage(dernierTour: TourJarvis | null, phrase: string, maintenant: number): boolean {
  if (!dernierEstUnMessagePrepare(dernierTour, maintenant)) return false
  const texte = phrase.trim()
  if (!texte) return false
  if (AUTRE_DOMAINE.test(texte)) return false
  return MOTIFS_CORRECTION.some((re) => re.test(texte))
}

/** Ce que Jarvis dit pour relire, sans rien changer. */
export function phraseRelectureMessage(cible: string | null, texte: string): string {
  const pour = cible ? ` pour ${cible}` : ""
  return `Voici ce que j'ai écrit${pour} : « ${texte} ».`
}

/**
 * La phrase envoyée au serveur pour récrire le message — même principe que
 * la correction de `confirmationEnvoiVocale.ts` (relecture AVANT ouverture) :
 * seul le modèle sait récrire un texte, on ne bricole pas de chaînes ici.
 *
 * `canal` nomme le bon mot (« SMS » ou « WhatsApp ») dans le prompt : sans
 * lui, un SMS corrigé repartirait décrit comme un message WhatsApp, ce qui
 * n'induit personne en erreur ici (le contact et le canal restent ceux du
 * brouillon d'origine, jamais redevinés par le modèle) mais reste faux à
 * lire.
 */
export function phraseCorrectionMessage(
  cible: string | null,
  texteActuel: string,
  correction: string,
  canal: "whatsapp" | "sms" = "whatsapp",
): string {
  const pour = cible ? ` pour ${cible}` : ""
  const application = canal === "sms" ? "SMS" : "WhatsApp"
  return `Message ${application} déjà préparé${pour} : "${texteActuel}". Correction demandée par Raphaël : "${correction}". Récris ce message ${application} en tenant compte de cette correction, pour le même destinataire.`
}
