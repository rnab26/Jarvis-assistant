/**
 * « Avec quelle application ? », posée DANS la conversation Live.
 *
 * LE MANQUE (chantier d3b6eeb4). Au micro classique, `runTurn` pose la
 * question la première fois qu'une demande touche une app du téléphone sans
 * dire laquelle — musique, itinéraire, canal de message, IA — puis retient la
 * réponse (AppsParDefaut). En Live, l'outil `commande_jarvis` appelle
 * `executerActions` directement : la question n'était pas posée, et Android
 * ouvrait son sélecteur « Terminer l'action avec… », ce que Raphaël a dit ne
 * pas vouloir (3 sept.).
 *
 * POURQUOI ÇA NE PEUT PAS ÊTRE LE MÊME CODE. En Live, on ne peut pas ouvrir
 * un second micro pour recueillir la réponse : c'est Google qui tient le
 * micro, en continu. La question doit donc repartir vers le MODÈLE, qui la
 * pose de vive voix, et la réponse nous revient au tour suivant — s'il
 * rappelle l'outil. D'où la consigne explicite ci-dessous : sans elle, le
 * modèle répond « d'accord » et n'appelle jamais l'outil, la préférence n'est
 * jamais enregistrée, et la demande d'origine est perdue.
 *
 * Ce module est PUR (aucun React, aucun Capacitor, aucun réseau) pour se
 * vérifier sous Node : `node --experimental-strip-types scripts/verifier-question-app-live.ts`.
 */

/**
 * Au-delà, on considère que Raphaël est passé à autre chose.
 *
 * Une question en attente qui ne périme jamais est un piège : il demande de
 * la musique, ne répond pas, parle d'autre chose pendant deux minutes, et sa
 * phrase suivante serait enregistrée comme « son application de musique ».
 */
export const MEMOIRE_QUESTION_MS = 90_000

/** Ce qui est mis de côté le temps qu'il réponde. */
export interface QuestionEnAttente {
  /** La demande d'origine, à rejouer une fois la préférence connue. */
  demande: string
  /** Musique, navigation, messages ou IA. */
  categorie: string
  /** Quand la question a été posée. */
  poseeAt: number
}

/**
 * Ce qu'on rend au modèle : la question, ET l'ordre de rappeler l'outil.
 *
 * Le modèle ne voit que ce texte. S'il n'y lit pas qu'il doit rappeler
 * `commande_jarvis`, il se contentera d'acquiescer et la chaîne s'arrête là.
 */
export function consigneQuestionApp(message: string): string {
  return `${message} — pose-lui cette question telle quelle, puis rappelle commande_jarvis avec sa réponse seule (juste le nom de l'application).`
}

/**
 * La phrase qui arrive répond-elle vraiment à la question ?
 *
 * Une réponse attendue est un nom d'application : « Spotify », « SMS »,
 * « WhatsApp », « Google Maps », « ChatGPT ». Si Raphaël a ignoré la question
 * et redemandé autre chose (« ajoute une tâche pour le plombier »), on ne doit
 * SURTOUT pas l'enregistrer comme son application préférée — on oublie la
 * question et on traite sa nouvelle demande normalement.
 *
 * On juge sur la forme, pas sur une liste d'applications : la liste serait
 * fausse le jour où il en installe une autre.
 */
export function reponseEstUnNomDApp(reponse: string): boolean {
  const propre = reponse.trim()
  if (!propre) return false
  // Un nom d'application tient en quelques mots. Au-delà, c'est une phrase.
  const mots = propre.split(/\s+/)
  if (mots.length > 4) return false
  // Un verbe d'action en tête, c'est une nouvelle demande, pas une réponse.
  return !/^(ajoute|crée|creer|créer|mets|met|rappelle|supprime|envoie|appelle|ouvre|lance|note|termine|modifie|donne|quelle?s?|combien|c'est quoi)\b/i.test(
    propre,
  )
}

/**
 * Que faire de la commande qui arrive, sachant ce qu'on attendait.
 *
 * Rendu sous forme de décision plutôt qu'exécuté ici : c'est ce qui rend la
 * règle vérifiable sans micro, sans Android et sans modèle.
 */
export type SuiteQuestionApp =
  /** Rien n'était en attente : traiter la commande normalement. */
  | { suite: "normale" }
  /** C'est sa réponse : enregistrer la préférence puis rejouer la demande. */
  | { suite: "enregistrer"; categorie: string; app: string; demande: string }
  /** Il a répondu autre chose, ou trop tard : oublier et traiter normalement. */
  | { suite: "oublier" }

export function suiteDeLaQuestion(
  enAttente: QuestionEnAttente | null,
  commande: string,
  maintenant: number,
): SuiteQuestionApp {
  if (!enAttente) return { suite: "normale" }
  if (maintenant - enAttente.poseeAt > MEMOIRE_QUESTION_MS) return { suite: "oublier" }
  if (!reponseEstUnNomDApp(commande)) return { suite: "oublier" }
  return {
    suite: "enregistrer",
    categorie: enAttente.categorie,
    app: commande.trim(),
    demande: enAttente.demande,
  }
}
