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

export interface MessageAAnnoncer {
  id: string
  destinataire: string
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
export function prochainMessageAAnnoncer<T extends MessageAAnnoncer>(
  messages: T[],
  maintenant: Date,
  margeMs = 6 * 60 * 60 * 1000,
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
  return `Message à envoyer à ${m.destinataire} : « ${m.texte} ». Je te le prépare — dis-moi si je l'envoie, si tu veux corriger le texte, ou si tu préfères annuler.`
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
