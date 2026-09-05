import { Capacitor } from "@capacitor/core"
import { ActionsTelephone, type ContactTelephone } from "@/lib/actionsTelephone"

/**
 * Le répertoire du téléphone, tel que Jarvis s'en sert.
 *
 * SA DEMANDE, 5 sept. 2026 : « pour l'accès à mes contacts, l'onglet contacts
 * ne me sert à rien. Moi c'était juste pour dire "rappelle ma femme à 23h22",
 * et il me répond qu'il n'a pas son numéro. »
 *
 * Le carnet d'adresses que Jarvis tenait dans sa base était une DEUXIÈME
 * source de vérité, vide, qui aurait de toute façon divergé du téléphone dès
 * le premier contact modifié. On lit le vrai répertoire, à la demande, et on
 * n'en garde rien.
 *
 * `null` distingue « pas pu lire » de « aucun contact » : rendre une liste
 * vide sur un refus de permission ferait dire à Jarvis « tu n'as personne à ce
 * nom » alors qu'il n'a simplement pas regardé.
 */
export type LectureRepertoire =
  | { etat: "ok"; contacts: ContactTelephone[] }
  | { etat: "refuse" }
  | { etat: "indisponible" }

export async function lireRepertoire(): Promise<LectureRepertoire> {
  if (!Capacitor.isNativePlatform()) return { etat: "indisponible" }
  try {
    const { contacts } = await ActionsTelephone.lireContacts()
    return { etat: "ok", contacts: contacts ?? [] }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes("REFUS_CONTACTS")) return { etat: "refuse" }
    return { etat: "indisponible" }
  }
}
