import type { ContactTelephone } from "@/lib/actionsTelephone"

/**
 * Retrouver quelqu'un dans le répertoire DU TÉLÉPHONE, à partir de ce que
 * Raphaël a dit.
 *
 * SA PHRASE, 5 sept. 2026 : « rappelle ma femme à 23h22 » — et Jarvis
 * répondait qu'il n'avait pas son numéro, parce qu'il ne regardait que le
 * carnet d'adresses vide qu'il tenait de son côté.
 *
 * Pur : aucun appel à Capacitor, à React ni au réseau. C'est le rapprochement
 * qui peut se tromper en silence — composer le numéro de quelqu'un d'autre
 * est le genre d'erreur qu'on ne rattrape pas.
 */

export type Trouvaille =
  | { etat: "trouve"; contact: ContactTelephone }
  /** Plusieurs personnes portent ce nom : on demande, on ne tire pas au sort. */
  | { etat: "ambigu"; candidats: ContactTelephone[] }
  | { etat: "aucun" }

/** Ignore accents, casse et ponctuation. */
function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Les mots qui ne distinguent personne : « mon frère Yoni » doit trouver
 * Yoni, et « appelle le docteur » ne doit trouver personne en particulier. */
const MOTS_VIDES = new Set([
  "mon",
  "ma",
  "mes",
  "le",
  "la",
  "les",
  "un",
  "une",
  "de",
  "du",
  "des",
  "a",
  "au",
  "chez",
  "monsieur",
  "madame",
  "m",
  "mme",
])

function motsUtiles(texte: string): string[] {
  return aplatir(texte)
    .split(" ")
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m))
}

/**
 * Score de ressemblance entre ce qui a été dit et le nom d'un contact.
 * 100 = le nom entier est dit ; 0 = rien en commun.
 */
function score(cible: string, nom: string): number {
  const a = aplatir(cible)
  const b = aplatir(nom)
  if (!a || !b) return 0
  if (a === b) return 100

  const motsCible = motsUtiles(cible)
  const motsNom = motsUtiles(nom)
  if (motsCible.length === 0 || motsNom.length === 0) return 0

  // Un prénom entier retrouvé dans le nom du contact vaut beaucoup : « appelle
  // Yoni » doit trouver « Yoni Cohen », mais « appelle Yo » ne doit rien
  // trouver — un fragment n'est pas un nom.
  let communs = 0
  for (const m of motsCible) {
    if (motsNom.includes(m)) communs++
  }
  if (communs === 0) return 0
  return Math.round((communs / Math.max(motsCible.length, motsNom.length)) * 100)
}

/** Au-dessous, on préfère ne rien proposer plutôt que d'appeler un inconnu. */
export const SEUIL = 50

/**
 * Les entrées du répertoire qui ne sont PAS des personnes.
 *
 * CE QUI EST ARRIVÉ, sur son téléphone le 5 sept. 2026 à 21 h 07, et c'est
 * exactement l'erreur que ce fichier disait vouloir éviter : il a dit
 * « appelle ma femme », la reconnaissance a entendu « appelle mail », et
 * « mail » a marché à 50 avec l'entrée système « Voice Mail » — un mot commun
 * sur deux. L'appel est parti vers +972544151000, le répondeur.
 *
 * Le répertoire d'un téléphone contient des services que l'opérateur y pose :
 * messagerie, répondeur, service client. Ils portent des noms faits de mots
 * courants, donc ils gagnent contre un prénom mal entendu. On les sort AVANT
 * de comparer quoi que ce soit.
 *
 * Cette liste est forcément incomplète — un opérateur étranger nommera sa
 * messagerie autrement. C'est pour ça que le garde-fou des mots d'appareil
 * ci-dessous existe aussi : il ne dépend d'aucune liste de noms.
 */
const ENTREES_SYSTEME = new Set([
  "voice mail",
  "voicemail",
  "voice mail box",
  "mailbox",
  "messagerie",
  "messagerie vocale",
  "repondeur",
  "boite vocale",
  "visual voicemail",
  "service client",
  "service clients",
])

/** Vrai si ce nom du répertoire désigne un service, pas quelqu'un. */
export function estEntreeSysteme(nom: string): boolean {
  return ENTREES_SYSTEME.has(aplatir(nom))
}

/**
 * Les mots qui appartiennent au VOCABULAIRE DE L'APPAREIL, jamais à une
 * personne.
 *
 * Le vrai garde-fou, et il ne dépend d'aucune liste de noms de services :
 * quand tout ce qui a été entendu tient en UN mot, et que ce mot est un mot
 * d'appareil (« mail », « message », « appel »), ce n'est pas quelqu'un
 * qu'on a nommé — c'est une commande mal entendue. On ne compose rien.
 *
 * Ce qui n'est PAS ici, et surtout ne doit pas y arriver : les façons de
 * désigner une personne. « appelle ma femme » doit continuer de trouver
 * « Mel Ma Femme ❤ » ; « femme », « frère », « maman », « docteur » restent
 * donc des mots parfaitement valides.
 */
const MOTS_APPAREIL = new Set([
  "mail",
  "mails",
  "email",
  "emails",
  "message",
  "messages",
  "sms",
  "texto",
  "textos",
  "appel",
  "appels",
  "telephone",
  "tel",
  "numero",
  "contact",
  "contacts",
  "alarme",
  "minuteur",
  "musique",
  "note",
  "notes",
  "rappel",
  "rappels",
  "agenda",
  "memo",
])

/**
 * Vrai quand ce qui a été dit ne peut pas désigner quelqu'un : un seul mot,
 * et c'est un mot d'appareil. Deux mots suffisent à lever le doute — « Mail
 * Cohen » serait un nom, « mail » tout seul n'en est pas un.
 */
export function cibleTropCourante(cible: string): boolean {
  const mots = motsUtiles(cible)
  return mots.length === 1 && MOTS_APPAREIL.has(mots[0])
}

/**
 * Le numéro à privilégier quand un contact en a plusieurs : le mobile, puis
 * ce qui vient en premier. Appeler le fax de quelqu'un parce qu'il était
 * listé avant son portable serait un échec silencieux.
 */
function meilleurNumero(entrees: ContactTelephone[]): ContactTelephone {
  const mobile = entrees.find((e) => /mobile|portable|cell/i.test(e.etiquette))
  return mobile ?? entrees[0]
}

export function chercherContact(cible: string, repertoire: ContactTelephone[]): Trouvaille {
  if (!cible.trim() || repertoire.length === 0) return { etat: "aucun" }

  // Un seul mot, et c'est un mot d'appareil : la commande a été mal entendue,
  // personne n'a été nommé. Composer un numéro là-dessus est l'erreur qu'on
  // ne rattrape pas — elle est arrivée le 5 sept. 2026 à 21 h 07.
  if (cibleTropCourante(cible)) return { etat: "aucun" }

  // Regroupé par personne : un contact à trois numéros ne doit pas ressortir
  // comme trois homonymes à départager.
  const parNom = new Map<string, ContactTelephone[]>()
  for (const entree of repertoire) {
    const cle = aplatir(entree.nom)
    if (!cle) continue
    // La messagerie de l'opérateur n'est pas quelqu'un : elle ne doit jamais
    // gagner contre un prénom mal entendu.
    if (estEntreeSysteme(entree.nom)) continue
    const liste = parNom.get(cle)
    if (liste) liste.push(entree)
    else parNom.set(cle, [entree])
  }

  let meilleur = 0
  let gagnants: ContactTelephone[] = []
  for (const entrees of parNom.values()) {
    const s = score(cible, entrees[0].nom)
    if (s < SEUIL) continue
    if (s > meilleur) {
      meilleur = s
      gagnants = [meilleurNumero(entrees)]
    } else if (s === meilleur) {
      gagnants.push(meilleurNumero(entrees))
    }
  }

  if (gagnants.length === 0) return { etat: "aucun" }
  if (gagnants.length > 1) return { etat: "ambigu", candidats: gagnants }
  return { etat: "trouve", contact: gagnants[0] }
}
