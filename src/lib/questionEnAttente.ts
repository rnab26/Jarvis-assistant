import type { QuestionEnAttente } from "@/lib/allerRetourIA"

/**
 * La dernière question envoyée à une IA installée, en attendant que Raphaël
 * en partage la réponse.
 *
 * Volontairement LOCAL et non recopié en base (déclaré dans
 * `STOCKAGE_LOCAL_ASSUME`) : c'est l'état d'un aller-retour en cours sur CET
 * appareil, qui vit une demi-heure. Le retrouver sur un autre téléphone
 * n'aurait aucun sens — la réponse se partage depuis celui où la question est
 * partie.
 */
export const CLE_QUESTION_ATTENTE = "jarvis_question_ia"

export function noterQuestionEnvoyee(app: string, question: string, maintenant = new Date()) {
  const attente: QuestionEnAttente = { app, question, envoyeeA: maintenant.toISOString() }
  try {
    localStorage.setItem(CLE_QUESTION_ATTENTE, JSON.stringify(attente))
  } catch {
    // Stockage indisponible : la réponse reviendra comme un partage ordinaire,
    // ce qui est le comportement d'avant. Rien de cassé.
  }
}

export function lireQuestionEnAttente(): QuestionEnAttente | null {
  try {
    const brut = localStorage.getItem(CLE_QUESTION_ATTENTE)
    if (!brut) return null
    const v = JSON.parse(brut) as Partial<QuestionEnAttente>
    if (!v || typeof v.app !== "string" || typeof v.question !== "string" || typeof v.envoyeeA !== "string") {
      return null
    }
    return { app: v.app, question: v.question, envoyeeA: v.envoyeeA }
  } catch {
    return null
  }
}

export function oublierQuestionEnAttente() {
  try {
    localStorage.removeItem(CLE_QUESTION_ATTENTE)
  } catch {
    // rien à faire : au pire la question expire d'elle-même au bout de 30 min
  }
}
