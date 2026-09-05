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

  // Regroupé par personne : un contact à trois numéros ne doit pas ressortir
  // comme trois homonymes à départager.
  const parNom = new Map<string, ContactTelephone[]>()
  for (const entree of repertoire) {
    const cle = aplatir(entree.nom)
    if (!cle) continue
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
