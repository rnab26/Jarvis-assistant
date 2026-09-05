/**
 * L'aller-retour avec une IA déjà installée sur le téléphone — sans payer
 * quoi que ce soit.
 *
 * SA DEMANDE, 5 sept. 2026 : « moi je ne veux pas payer justement, je veux
 * profiter des applications que je paye déjà ». Il a un abonnement Perplexity
 * sur son téléphone ; il veut que Jarvis s'en serve.
 *
 * CE QUI EST IMPOSSIBLE, et pourquoi ce module existe : Android n'offre aucun
 * moyen à une application d'interroger le compte d'une autre. Et l'API de
 * Perplexity est facturée à part de l'abonnement grand public (vérifié le
 * 5 sept. : les crédits d'API autrefois inclus dans Pro ont été retirés). Il
 * n'y a donc rien à « brancher » au sens d'une clé.
 *
 * CE QUI MARCHE, et c'est ce qui est codé ici : le chemin passe par le
 * téléphone lui-même, en deux gestes qui existent déjà tous les deux.
 *   1. L'ALLER — Jarvis envoie la question à l'app par un intent Android
 *      (`ask_ai`, déjà en place). L'app s'ouvre, la question dedans.
 *   2. Le RETOUR — il partage la réponse vers Jarvis (menu « Partager »
 *      d'Android, déjà en place : ShareReceiverPlugin).
 * Ce module est la pièce qui manquait entre les deux : il RAPPROCHE le texte
 * partagé de la question posée juste avant, pour que la réponse revienne
 * attachée à sa question au lieu d'atterrir comme un document anonyme.
 *
 * Pur : aucun appel à Capacitor, à React ni au réseau, pour que le
 * rapprochement — la seule chose qui puisse se tromper en silence — se
 * vérifie sans téléphone (`scripts/verifier-aller-retour-ia.ts`).
 */

/** Ce qu'on retient d'une question envoyée à une IA, en attendant sa réponse. */
export type QuestionEnAttente = {
  /** L'application à qui la question a été posée, telle qu'Android la nomme. */
  app: string
  /** La question, telle que Jarvis l'a envoyée. */
  question: string
  /** Quand elle est partie (ISO). */
  envoyeeA: string
}

export type Rapprochement =
  | { type: "reponse"; app: string; question: string; reponse: string; titre: string }
  | { type: "document"; texte: string; pourquoi: RaisonNonRapproche }

/** Pourquoi un texte partagé n'a PAS été pris pour une réponse. Nommé, parce
 * qu'un rapprochement raté doit pouvoir se lire dans le journal plutôt que se
 * deviner. */
export type RaisonNonRapproche =
  | "aucune_question" // rien n'avait été demandé à une IA
  | "trop_tard" // la question date de trop longtemps
  | "c_est_la_question" // il a partagé sa propre question, pas la réponse
  | "trop_court" // deux mots : un titre, une URL seule, pas une réponse

/**
 * Combien de temps une question reste « en attente de sa réponse ».
 *
 * Trente minutes : le temps de lire une réponse, de rebondir dessus dans
 * l'app, puis de la partager. Au-delà, le rapprochement devient un pari — et
 * un mauvais rapprochement est pire que pas de rapprochement du tout, parce
 * qu'il range la réponse sous une question qui n'est pas la sienne.
 */
export const FENETRE_MINUTES = 30

/** En dessous, ce n'est pas une réponse : un titre, une URL seule, un mot. */
const LONGUEUR_MINIMALE = 40

/** Jusqu'à combien de fois la longueur de la question un texte qui la contient
 * reste « sa question repartagée » plutôt que sa réponse. */
const FACTEUR_REDITE = 2.5

/** Normalise pour comparer : accents, ponctuation et casse ne comptent pas. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Un titre court et reconnaissable, tiré de la question. */
export function titreDepuisQuestion(question: string, app: string): string {
  const propre = question.trim().replace(/\s+/g, " ")
  const court = propre.length > 60 ? propre.slice(0, 57).trimEnd() + "…" : propre
  return `${app} — ${court}`
}

/**
 * Ce texte qui arrive par le partage, est-ce la réponse à la question qu'on
 * vient de poser ?
 *
 * `attente` vaut `null` quand aucune question n'est en cours : le texte est
 * alors un partage ordinaire, et le comportement d'avant ne change pas.
 */
export function rapprocher(
  texteRecu: string,
  attente: QuestionEnAttente | null,
  maintenant: Date,
): Rapprochement {
  const texte = texteRecu.trim()

  if (!attente) return { type: "document", texte, pourquoi: "aucune_question" }

  const envoyee = new Date(attente.envoyeeA).getTime()
  const ecartMinutes = (maintenant.getTime() - envoyee) / 60000
  // `< 0` : une horloge qui recule (changement d'heure, correction réseau) ne
  // doit pas faire passer une question pour périmée.
  if (!Number.isFinite(ecartMinutes) || ecartMinutes > FENETRE_MINUTES) {
    return { type: "document", texte, pourquoi: "trop_tard" }
  }

  if (texte.length < LONGUEUR_MINIMALE) {
    return { type: "document", texte, pourquoi: "trop_court" }
  }

  // Le cas le plus fréquent de faux rapprochement : dans Perplexity, un appui
  // long sur SA PROPRE question la propose au partage avant que la réponse
  // existe. Deux conditions ensemble, jamais une seule — le texte CONTIENT la
  // question, et il reste du même ordre de grandeur qu'elle. Une vraie réponse
  // qui citerait la question serait, elle, bien plus longue : mesuré sur un
  // cas réel, 247 caractères de réponse pour 43 de question.
  const n = normaliser(texte)
  const q = normaliser(attente.question)
  if (q && (n === q || (n.includes(q) && n.length < q.length * FACTEUR_REDITE + 20))) {
    return { type: "document", texte, pourquoi: "c_est_la_question" }
  }

  return {
    type: "reponse",
    app: attente.app,
    question: attente.question,
    reponse: texte,
    titre: titreDepuisQuestion(attente.question, attente.app),
  }
}

/** Ce qui est écrit dans le document, pour que la réponse ne se retrouve
 * jamais séparée de sa question ni de sa provenance. */
export function corpsDuDocument(r: Extract<Rapprochement, { type: "reponse" }>, quand: Date): string {
  return [
    `Question posée à ${r.app} le ${quand.toLocaleString("fr-FR")} :`,
    r.question,
    "",
    `Sa réponse, rapportée par le partage Android :`,
    r.reponse,
  ].join("\n")
}
