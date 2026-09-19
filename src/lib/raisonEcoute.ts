/**
 * Pourquoi le service de reconnaissance d'Android s'est arrêté.
 *
 * D'OÙ VIENT CE FICHIER (mesuré le 5 sept. 2026 sur le journal d'écoute réel
 * de Raphaël, pas supposé). Le registre des erreurs n'avait qu'une seule
 * ligne ouverte : « Le micro s'est arrêté sans rien entendre », vue 10 fois.
 * En regardant `journal_ecoute`, ces 10 signalements viennent de 363 rafales
 * de VEILLE terminées sans un mot — sur 387 au total, soit 94 %. Et sur les
 * 363, pas une seule n'avait entendu quoi que ce soit :
 *
 *     rafale_fin | silencieuse=true  | rien_entendu=true  | n=363
 *     rafale_fin | silencieuse=true  | rien_entendu=false | n=0
 *
 * Autrement dit : ce n'était pas une panne, c'était la pièce qui était
 * calme. Le téléphone posé sur la table, la boucle de veille qui relance une
 * rafale toutes les 1 à 8 secondes, et Android qui répond « personne n'a
 * parlé ». On signalait ça comme une erreur, et cette fausse alerte occupait
 * la seule place ouverte du registre — donc masquait les vraies.
 *
 * POURQUOI ON NE POUVAIT PAS FAIRE LA DIFFÉRENCE. `onError` du plugin fait
 * `call.reject(...)` sur un appel DÉJÀ RÉSOLU (en mode partiels, `start()`
 * se résout dès le lancement) : Capacitor ignore ce rejet, et le code
 * d'erreur d'Android est perdu. Côté JS il ne restait qu'un `isListening()`
 * qui passe à faux — la « mort silencieuse ». Un silence ordinaire
 * (ERROR_NO_MATCH, ERROR_SPEECH_TIMEOUT) et une vraie panne (service occupé,
 * réseau, permission refusée) rendaient exactement le même signal.
 *
 * Le patch du plugin émet maintenant ce code comme événement `listeningState`
 * (statut « error »), qui lui n'est jamais perdu. Ce fichier le traduit. Il
 * est PUR — aucune dépendance, aucun réseau — pour se vérifier sous Node :
 * `node --experimental-strip-types scripts/verifier-raison-ecoute.ts`.
 */

/** Ce que le code d'erreur d'Android veut dire, pour nous. */
export type RaisonEcoute =
  /** Personne n'a parlé. C'est le repos normal de la veille, pas une panne. */
  | "silence"
  /** Le service était encore pris par l'écoute précédente. */
  | "occupe"
  /** Micro inaccessible : autorisation refusée ou retirée. */
  | "permission"
  /** Le service parle à un serveur et n'y arrive pas. */
  | "reseau"
  /** Le micro lui-même n'a pas pu enregistrer. */
  | "audio"
  /** Le français n'est pas disponible sur ce service. */
  | "langue"
  /** Trop d'appels : le service nous rationne. */
  | "rationne"
  /** Le service a répondu une erreur qu'on ne sait pas classer. */
  | "service"

/**
 * Codes de `android.speech.SpeechRecognizer`.
 *
 * Écrits en clair plutôt qu'importés : ce module doit tourner sous Node, où
 * il n'y a pas d'Android. Les valeurs sont celles de la plateforme et ne
 * changent pas (elles font partie de l'API publique depuis API 3 à 33).
 */
const CODES: Record<number, RaisonEcoute> = {
  1: "reseau", // ERROR_NETWORK_TIMEOUT
  2: "reseau", // ERROR_NETWORK
  3: "audio", // ERROR_AUDIO
  4: "service", // ERROR_SERVER
  5: "service", // ERROR_CLIENT
  6: "silence", // ERROR_SPEECH_TIMEOUT — personne n'a commencé à parler
  7: "silence", // ERROR_NO_MATCH — rien de reconnaissable n'a été dit
  8: "occupe", // ERROR_RECOGNIZER_BUSY
  9: "permission", // ERROR_INSUFFICIENT_PERMISSIONS
  10: "rationne", // ERROR_TOO_MANY_REQUESTS
  11: "service", // ERROR_SERVER_DISCONNECTED
  12: "langue", // ERROR_LANGUAGE_NOT_SUPPORTED
  13: "langue", // ERROR_LANGUAGE_UNAVAILABLE
}

export function raisonDepuisCode(code: number | null | undefined): RaisonEcoute | null {
  if (code === null || code === undefined) return null
  return CODES[code] ?? "service"
}

/**
 * Ce silence-là mérite-t-il qu'on dérange Raphaël ?
 *
 * « silence » ne se signale JAMAIS : c'est le fonctionnement normal d'une
 * écoute qui attend qu'on lui parle. Tout le reste est une vraie panne — le
 * micro n'a pas pu écouter, et il faut le savoir.
 */
export function estUnePanne(raison: RaisonEcoute | null): boolean {
  return raison !== null && raison !== "silence"
}

/** Ce qu'on écrit dans le registre des erreurs, en français, pour que le
 * titre dise la cause au lieu de décrire le symptôme. */
const TITRES: Record<RaisonEcoute, string> = {
  silence: "Le micro n'a rien entendu",
  occupe: "Le micro était encore pris par l'écoute précédente",
  permission: "Le micro n'est plus autorisé",
  reseau: "La reconnaissance vocale n'atteint pas son serveur",
  audio: "Le micro n'a pas pu enregistrer",
  langue: "Le français n'est pas disponible pour la reconnaissance vocale",
  rationne: "Le service de reconnaissance vocale nous rationne",
  service: "Le service de reconnaissance vocale a répondu une erreur",
}

export function titreDeLaPanne(raison: RaisonEcoute): string {
  return TITRES[raison]
}

/**
 * CE QU'ON LUI DIT QUAND UN TOUR DE COMMANDE FINIT SANS UN MOT.
 *
 * « Je n'ai rien entendu, réessaie » accuse SON silence. C'était la seule
 * phrase possible, quelle que soit la cause — et c'est faux la moitié du
 * temps.
 *
 * MESURÉ LE 19 SEPT. 2026 (chantier 5df26510) sur les 14 tours de commande
 * réels terminés sans un mot : SEPT portaient `raison = "service"`, c'est-à-
 * dire qu'Android avait répondu une erreur (codes 5 et 11), pas qu'il s'était
 * tu. Trois d'entre eux ont duré 12 secondes pleines, avec 18, 21 et 28
 * relances du moteur. Il a parlé, on ne l'a pas écouté, et on lui a répondu
 * qu'il n'avait rien dit.
 *
 * C'est la règle de `_shared/honnetete.ts` appliquée à notre propre code, et
 * le même défaut que la phrase « Le serveur vocal a répondu : Failed to send
 * a request » du 15 sept. : on affirmait quelque chose qu'on n'avait pas
 * constaté. La distinction tient en un mot et elle est tout le sujet —
 * « je n'ai rien entendu » (son silence) contre « je n'ai pas pu écouter »
 * (notre panne).
 *
 * La veille faisait DÉJÀ cette distinction de son côté ; seul le tour de
 * commande ne la faisait pas.
 */
/** La phrase du silence, la seule qui lui attribue le silence. Exportée pour
 * que `MicButton` et les contrôles la reconnaissent sans la recopier. */
export const RIEN_ENTENDU = "Je n'ai rien entendu, réessaie."

const PHRASES: Record<RaisonEcoute, string> = {
  // Le seul cas où le silence est bien le sien. Phrase inchangée, et c'est
  // voulu : `MicButton` la reconnaît pour clore une conversation sans rien
  // afficher d'alarmant après une réponse de Jarvis.
  silence: RIEN_ENTENDU,
  occupe: "Je n'ai pas pu écouter : le micro était pris par autre chose. Réessaie dans un instant.",
  permission: "Je n'ai pas pu écouter : le micro n'est plus autorisé. Vérifie l'autorisation dans Paramètres.",
  reseau: "Je n'ai pas pu écouter : la reconnaissance vocale n'a pas joint son serveur.",
  audio: "Je n'ai pas pu écouter : le micro n'a pas pu enregistrer.",
  langue: "Je n'ai pas pu écouter : le français n'est pas disponible sur ce moteur de reconnaissance.",
  rationne: "Je n'ai pas pu écouter : le service de reconnaissance nous rationne. Réessaie dans un instant.",
  service: "Je n'ai pas pu écouter : le service de reconnaissance de ton téléphone a refusé. Réessaie.",
}

export function phraseTourSansTexte(raison: RaisonEcoute | null): string {
  if (!estUnePanne(raison)) return RIEN_ENTENDU
  return PHRASES[raison as RaisonEcoute]
}
