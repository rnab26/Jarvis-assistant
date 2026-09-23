/**
 * Quand et quoi Jarvis doit ANNONCER d'un message programmé — chantier
 * ed32cbcc.
 *
 * SA DÉCISION DU 3 SEPT. 2026, ses mots (fiche WhatsApp) : « si je lui
 * autorise dans un nouveau réglage des paramètres à ajouter il peut
 * intervenir à l'oral et me dire tu dois envoyer un message à Dylan je le
 * prépare ? Et je lui réponds éventuellement je le reprogramme ou autre. »
 *
 * PAS UNE NOTIFICATION PASSIVE, et ce n'est pas un oubli : sa réponse du
 * 4 sept. à la fiche « Quand Jarvis doit te déranger » est NON à une
 * notification pour un message programmé (voir le commentaire d'en-tête de
 * src/lib/notifications/prefs.ts, qui consigne ses choix). L'annonce vit
 * donc UNIQUEMENT dans une conversation active — Jarvis le dit la prochaine
 * fois qu'il a la parole, app ouverte, jamais par une alerte système.
 *
 * Module PUR : aucun appel à Android, au serveur ni à React. Vérifié par
 * scripts/verifier-message-annonce.ts.
 */

import { destinataireManquant } from "./destinataireProgramme.ts"

export interface MessageAAnnoncer {
  id: string
  destinataire: string
  /** Le contact vérifié au moment de programmer (chantier a122a936). */
  contact_nom?: string | null
  telephone?: string | null
  texte: string
  envoyer_a: string
  statut: "prevu" | "annonce" | "envoye" | "annule"
}

/** Les statuts que MicButton connaît pour son cœur — recopiés ici (pas
 * importés) pour que ce module reste indépendant de React. */
export type StatutJarvis = "idle" | "wake-listening" | "listening" | "processing" | "speaking" | "error"

/**
 * Le PLUS ANCIEN message dû, ou `null` s'il n'y a rien à annoncer
 * maintenant.
 *
 * `margeMs` couvre le cas où l'app était fermée à l'heure dite — même
 * principe que `messagesAAnnoncer()` de messagesProgrammes.ts (qui filtre
 * déjà côté requête ; ceci ne fait que CHOISIR dans ce qu'elle a rendu, en
 * pur, pour rester vérifiable sans réseau). Au-delà de la marge, un message
 * resté "prevu" ne sonne plus tout seul — il reste visible pour qui va le
 * chercher, mais Jarvis ne relance pas une annonce pour un rendez-vous
 * manqué de plusieurs heures.
 */
/** Au-delà, un message « prévu » n'est plus annoncé tout seul (voir
 * ci-dessous) — et l'écran « Programmé » le dit, au lieu d'afficher « Prévu »
 * pour un rendez-vous passé depuis la veille. */
export const MARGE_ANNONCE_MS = 6 * 60 * 60 * 1000

export function prochainMessageAAnnoncer<T extends MessageAAnnoncer>(
  messages: T[],
  maintenant: Date,
  margeMs = MARGE_ANNONCE_MS,
): T | null {
  const du = messages
    .filter((m) => m.statut === "prevu")
    .filter((m) => {
      const t = new Date(m.envoyer_a).getTime()
      if (Number.isNaN(t)) return false
      const ecart = maintenant.getTime() - t
      return ecart >= 0 && ecart <= margeMs
    })
    .sort((a, b) => new Date(a.envoyer_a).getTime() - new Date(b.envoyer_a).getTime())
  return du[0] ?? null
}

/**
 * Un message resté « prévu » dont l'heure est passée depuis plus que la marge :
 * il ne partira plus tout seul — l'app n'était pas ouverte à l'heure dite. Le
 * 22 sept., celui pour Harry (18 h) est resté « Prévu » le lendemain, sans
 * rien qui dise qu'il n'était jamais parti (chantier a122a936).
 */
export function messageManque(
  m: { statut: MessageAAnnoncer["statut"]; envoyer_a: string },
  maintenant: Date,
  margeMs = MARGE_ANNONCE_MS,
): boolean {
  if (m.statut !== "prevu") return false
  const t = new Date(m.envoyer_a).getTime()
  return !Number.isNaN(t) && maintenant.getTime() - t > margeMs
}

/**
 * Le moment est-il bon pour que Jarvis PARLE de lui-même ?
 *
 * Il ne coupe jamais une conversation en cours (`statut !== "idle"`), ni ne
 * parle si sa voix est coupée. Et il laisse un peu d'air après sa DERNIÈRE
 * annonce : sans ce recul, deux messages programmés à la même minute
 * s'enchaîneraient sans lui laisser le temps de répondre au premier.
 */
export function peutAnnoncerMaintenant(params: {
  statut: StatutJarvis
  voixCoupee: boolean
  /** `null` si aucune annonce n'a encore eu lieu dans cette session. */
  derniereAnnonceIlYA_ms: number | null
}): boolean {
  if (params.statut !== "idle") return false
  if (params.voixCoupee) return false
  if (params.derniereAnnonceIlYA_ms !== null && params.derniereAnnonceIlYA_ms < 20_000) return false
  return true
}

/**
 * Ce que Jarvis dit — nomme le destinataire, cite le texte mot pour mot, et
 * dit ce qu'il va faire ENSUITE (préparer le brouillon), pas une question
 * fermée : « Jarvis prépare, Raphaël valide », même principe que partout
 * ailleurs dans ce projet.
 */
export function phraseAnnonceMessage(m: MessageAAnnoncer): string {
  // Sans destinataire, on ne prépare RIEN : un brouillon « à personne » est
  // pire qu'une phrase qui dit où le compléter (chantier a122a936).
  if (!m.telephone && destinataireManquant(m.destinataire)) {
    return `C'est l'heure du message « ${m.texte} », mais je ne sais pas à qui l'envoyer : choisis le destinataire dans l'onglet Programmé.`
  }
  // Le nom EXACT du contact vérifié, quand on l'a : c'est lui que WhatsApp
  // affichera, et c'est à lui que le message partira.
  const qui = m.telephone && m.contact_nom ? m.contact_nom : m.destinataire
  return `Message à envoyer à ${qui} : « ${m.texte} ». Je te le prépare — dis-moi si je l'envoie, si tu veux corriger le texte, ou si tu préfères annuler.`
}

/** Les tournures qui annulent un message dont Jarvis vient de faire
 * l'annonce — vocabulaire fermé, comme `estReponseNon` de
 * confirmationEnvoiVocale.ts : un faux négatif redemande simplement (traité
 * comme une correction ou une nouvelle phrase), un faux positif annulerait
 * un envoi qu'il voulait garder. */
const MOTIFS_ANNULATION = [
  /^annule\b/i,
  /^laisse tomber\b/i,
  /^non,? annule\b/i,
  /^ne l'envoie pas\b/i,
  /^n'envoie rien\b/i,
]

/**
 * Vrai si, après l'annonce d'un message programmé, cette phrase demande de
 * l'ANNULER — jamais sans qu'un message ait vraiment été annoncé
 * (`enAttente` non nul) : « annule » dans n'importe quel autre contexte veut
 * dire autre chose.
 */
export function estAnnulationMessageAnnonce(enAttente: { id: string } | null, phrase: string): boolean {
  if (!enAttente) return false
  const texte = phrase.trim()
  if (!texte) return false
  return MOTIFS_ANNULATION.some((re) => re.test(texte))
}

/** Ce que Jarvis dit une fois l'annulation faite. */
export function phraseMessageAnnule(m: MessageAAnnoncer): string {
  return `D'accord, je n'envoie rien à ${m.destinataire}.`
}
