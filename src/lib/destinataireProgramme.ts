import type { ContactTelephone } from "@/lib/actionsTelephone"
import { chercherContact } from "./chercherContact.ts"
import type { LectureRepertoire } from "@/lib/repertoire"

/**
 * Le destinataire d'un message PROGRAMMÉ, vérifié au moment où il le dicte —
 * pas à l'heure dite (chantier a122a936).
 *
 * SES MOTS, 22 sept. 2026 : « améliorer la gestion des contacts lors de la
 * programmation de messages, en s'assurant que le contact WhatsApp programmé
 * soit visible et garanti ». MESURÉ juste avant, à 10h44 : « Programme un
 * message à envoyer à Harry locataire bureau sur WhatsApp pour 18h… » a été
 * enregistré avec pour destinataire « ce contact » — le nom n'était pas
 * arrivé jusqu'à l'app, qui avait comblé en silence et répondu « C'est
 * noté ». À 18h, rien n'aurait pu trouver « ce contact ».
 *
 * Deux règles, et ce module est pur pour qu'elles se vérifient sans téléphone
 * (`scripts/verifier-destinataire-programme.ts`) :
 *
 * 1. ON NE COMBLE JAMAIS UN DESTINATAIRE MANQUANT. Le message est gardé (le
 *    texte et l'heure sont ce qui coûte le plus à redicter), mais marqué sans
 *    destinataire, et Jarvis le DIT.
 * 2. LE RÉPERTOIRE TRANCHE MAINTENANT, pendant qu'il est là pour répondre.
 *    Trouvé : on garde le nom exact et le numéro, et c'est ce numéro qui sert
 *    à l'heure dite. Deux homonymes ou personne : on ne tire pas au sort, on
 *    le dit — avec les noms — et l'écran « Programmé » le montre.
 */

export type Verification =
  | { etat: "verifie"; contact_nom: string; telephone: string }
  | { etat: "ambigu"; candidats: ContactTelephone[] }
  | { etat: "introuvable" }
  /** Il a refusé l'accès aux contacts : on n'a pas regardé. */
  | { etat: "sans_acces" }
  /** Hors du téléphone (le site) : le répertoire n'existe pas ici. */
  | { etat: "hors_telephone" }
  /** Il n'a nommé personne (ou le nom s'est perdu en route). */
  | { etat: "manquant" }

/** Un numéro dicté : au moins sept chiffres, séparateurs usuels tolérés. */
export function estUnNumero(texte: string): boolean {
  const t = texte.trim()
  return /^\+?[\d\s().-]+$/.test(t) && t.replace(/\D/g, "").length >= 7
}

/** Les façons dont le nom s'est perdu en route, jamais un vrai destinataire.
 * « ce contact » est ce que l'app elle-même écrivait avant ce correctif : un
 * message resté en base avec ça doit se lire comme « à préciser ». */
const PLACEHOLDERS = new Set(["", "ce contact", "contact", "destinataire", "inconnu"])

export function destinataireManquant(nom: string | null | undefined): boolean {
  return PLACEHOLDERS.has((nom ?? "").trim().toLowerCase())
}

/** Un identifiant (UUID) n'est pas un nom : le modèle en invente parfois un. */
function estUnIdentifiant(texte: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texte.trim())
}

/**
 * Ce qu'il a DIT pour désigner le destinataire, à partir des champs du
 * modèle. `contact_id` qui ne correspond à aucun contact connu et qui n'est
 * pas un identifiant est un NOM mal rangé par le modèle — on le reprend
 * plutôt que de le perdre.
 */
export function nomDit(champs: {
  nomContactConnu?: string | null
  contact_name?: string | null
  contact_id?: string | null
  phone_number?: string | null
}): string | null {
  const candidats = [
    champs.nomContactConnu,
    champs.contact_name,
    champs.contact_id && !estUnIdentifiant(champs.contact_id) ? champs.contact_id : null,
    champs.phone_number,
  ]
  for (const c of candidats) {
    if (c && !destinataireManquant(c)) return c.trim()
  }
  return null
}

export function verifierDestinataire(dit: string | null, lecture: LectureRepertoire): Verification {
  if (!dit || destinataireManquant(dit)) return { etat: "manquant" }
  // Un numéro dicté se garde tel quel : il n'y a rien à chercher.
  if (estUnNumero(dit)) return { etat: "verifie", contact_nom: dit.trim(), telephone: dit.trim() }
  if (lecture.etat === "refuse") return { etat: "sans_acces" }
  if (lecture.etat === "indisponible") return { etat: "hors_telephone" }
  const trouvaille = chercherContact(dit, lecture.contacts)
  if (trouvaille.etat === "trouve") {
    return { etat: "verifie", contact_nom: trouvaille.contact.nom, telephone: trouvaille.contact.numero }
  }
  if (trouvaille.etat === "ambigu") return { etat: "ambigu", candidats: trouvaille.candidats }
  return { etat: "introuvable" }
}

/** Ce que Jarvis répond après avoir programmé. `quand` : « mardi 22 septembre
 * à 18:00 ». Chaque cas où le destinataire n'est pas garanti le DIT, et dit
 * où le corriger — jamais un « C'est noté » qui le laisserait croire. */
export function phraseProgrammation(dit: string | null, v: Verification, quand: string): string {
  const ou = "choisis-le dans l'onglet Programmé"
  switch (v.etat) {
    case "verifie":
      return `C'est noté : je te proposerai ce message pour ${v.contact_nom} ${quand}.`
    case "ambigu": {
      const noms = v.candidats.map((c) => c.nom).join(", ")
      return `C'est noté pour ${quand}, mais j'ai plusieurs « ${dit} » dans ton répertoire : ${noms}. ${majuscule(ou)} pour être sûr que ce soit le bon.`
    }
    case "introuvable":
      return `C'est noté pour ${quand}, mais je ne trouve pas « ${dit} » dans ton répertoire : ${ou}, sinon il ne pourra pas partir.`
    case "sans_acces":
      return `C'est noté pour ${quand}, mais je n'ai pas accès à ton répertoire pour vérifier « ${dit} ». Autorise les contacts pour Jarvis (Paramètres › Autorisations du téléphone).`
    case "hors_telephone":
      return `C'est noté : je te proposerai ce message pour ${dit} ${quand}. Le contact se vérifie depuis ton téléphone.`
    case "manquant":
      return `C'est noté pour ${quand}, mais je n'ai pas compris à qui l'envoyer : ${ou}.`
  }
}

function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/** Les champs à écrire en base pour une vérification donnée. */
export function champsVerifies(v: Verification): { contact_nom: string | null; telephone: string | null } {
  return v.etat === "verifie" ? { contact_nom: v.contact_nom, telephone: v.telephone } : { contact_nom: null, telephone: null }
}

/** Ce que l'écran « Programmé » dit du destinataire d'un message. */
export type EtatDestinataire =
  | { etat: "verifie"; libelle: string; numero: string }
  | { etat: "a_verifier"; libelle: string }
  | { etat: "manquant" }

export function etatDestinataire(m: {
  destinataire: string
  contact_nom?: string | null
  telephone?: string | null
}): EtatDestinataire {
  if (m.telephone) return { etat: "verifie", libelle: m.contact_nom || m.destinataire, numero: m.telephone }
  if (destinataireManquant(m.destinataire)) return { etat: "manquant" }
  return { etat: "a_verifier", libelle: m.destinataire }
}
