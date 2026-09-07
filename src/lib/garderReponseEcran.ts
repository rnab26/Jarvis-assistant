import { lireEcran } from "@/lib/controleEcran"
import { phraseEcran, texteVisible } from "@/lib/ecranTelephone"
import { corpsDuDocument, rapprocher } from "@/lib/allerRetourIA"
import { lireQuestionEnAttente, oublierQuestionEnAttente } from "@/lib/questionEnAttente"
import { CLE_RELAIS_IA_LECTURE, lectureVoulue } from "@/lib/relaisIA"
import { noterEcoute } from "@/lib/journalEcoute"

/**
 * « Garde ça », « retiens sa réponse », « note ça » : reprendre à l'écran la
 * réponse d'une IA installée, sans l'appui long ni le menu « Partager »
 * d'Android (chantier 7d7967b2, NIVEAU 3 de 0262afdf).
 *
 * L'ENCHAÎNEMENT VISÉ PAR RAPHAËL : « Jarvis, cherche X sur Perplexity » →
 * l'application s'ouvre → la réponse s'affiche → « garde ça » → Jarvis la
 * reprend tout seul.
 *
 * CE QUI REND ÇA POSSIBLE SANS RIEN RÉÉCRIRE : le service d'accessibilité
 * (chantier 3f3ad20b) lit déjà le texte de l'écran de l'application du
 * dessous, et `rapprocher()` (allerRetourIA.ts) sait déjà rattacher un texte
 * à la question envoyée juste avant — avec ses garde-fous (fenêtre de
 * 30 min, texte trop court, « c'est ma propre question repartagée »). Ce
 * module ne fait QUE relier lecture d'écran et rapprochement, comme
 * `useShareReceiver.ts` le fait déjà pour le texte partagé — même chemin
 * d'enregistrement, pas un second.
 *
 * Non pur (appelle le plugin d'accessibilité et la synthèse vocale) : la
 * décision de rapprochement, elle, reste vérifiable hors ligne dans
 * `allerRetourIA.ts` / `verifier-aller-retour-ia.ts`.
 */
export async function garderReponseEcran(
  saveTextDocument: (filename: string, content: string) => Promise<void>,
): Promise<string> {
  const lecture = await lireEcran()
  if ("echec" in lecture) {
    noterEcoute("ecran_action", { commande: "garder_reponse", resultat: lecture.echec })
    if (lecture.echec === "service_inactif") {
      return phraseEcran({ fait: "echec", cause: "service_inactif" })
    }
    return "Je n'arrive pas à voir l'écran en ce moment, donc je n'ai rien retenu."
  }

  const maintenant = new Date()
  const resultat = rapprocher(texteVisible(lecture), lireQuestionEnAttente(), maintenant)

  if (resultat.type !== "reponse") {
    noterEcoute("ecran_action", {
      commande: "garder_reponse",
      resultat: "non_rapproche",
      pourquoi: resultat.pourquoi,
      paquet: lecture.paquet,
    })
    switch (resultat.pourquoi) {
      case "aucune_question":
        return "Je ne t'ai pas vu poser de question à une IA récemment, donc je ne sais pas à quoi rattacher ça."
      case "trop_tard":
        return "Ta question à l'IA date de trop longtemps, je préfère ne pas deviner. Repose ta question si tu veux que je garde la réponse."
      case "c_est_la_question":
        return "Ce que je vois ressemble à ta question, pas à sa réponse. Attends qu'elle ait fini de répondre, puis redis-le-moi."
      case "trop_court":
        return "Ce qui est affiché est trop court pour être une vraie réponse. Redis-le-moi une fois qu'elle a fini de répondre."
    }
  }

  // Une question n'attend qu'une réponse : la suivante repartirait sinon se
  // ranger sous la même, des heures plus tard.
  oublierQuestionEnAttente()
  await saveTextDocument(resultat.titre, corpsDuDocument(resultat, maintenant))
  noterEcoute("ecran_action", { commande: "garder_reponse", resultat: "garde", app: resultat.app })

  let lue = false
  try {
    lue = lectureVoulue(localStorage.getItem(CLE_RELAIS_IA_LECTURE))
  } catch {
    // Stockage indisponible : on garde le comportement par défaut, silencieux.
  }
  // La phrase rendue ici est celle que Jarvis dira ensuite (MicButton parle
  // toujours le retour d'une action) : pas de second appel à la synthèse en
  // parallèle, qui se couperait la parole avec ce retour.
  if (lue) {
    return `${resultat.app} a répondu : ${resultat.reponse} — c'est gardé dans Documents avec ta question.`
  }
  return `C'est noté : la réponse de ${resultat.app} est dans Documents, avec ta question.`
}
