import { corpsReponse } from "@/lib/decisions"
import { AUTEUR_RAPHAEL, enAttenteDeRaphael } from "@/lib/journalDestinataire"
import { signalerErreur } from "@/lib/erreurs"
import type { DevLogEntry } from "@/types/database"

/**
 * Répondre à voix haute, en phrase libre, à un point de « Ce qui attend ta
 * décision » (chantier 6044d8ad) — sans passer par le cockpit.
 *
 * Le SERVEUR (voice-command, via `_shared/ceQuiLAttend.ts`) a déjà résolu
 * QUEL point (`decision_id`, un identifiant `dev_log` réel) et formulé la
 * réponse à écrire (`decision_reponse` : le libellé d'une option proche s'il
 * y en avait une, sinon la phrase telle quelle) — exactement le rôle que
 * `resolveTranscript` joue déjà pour task_id/item_id. Sa règle de sûreté est
 * dans la consigne du serveur : plusieurs points en attente et une phrase
 * qui ne désigne clairement que l'un d'eux → il répond à celui-là ; ambiguë
 * ou visant plusieurs à la fois → clarify, jamais cette action.
 *
 * ICI, on ne fait qu'écrire — exactement ce que fait `repondreAQuestion`
 * dans `useDevLog.ts` pour le cockpit (kind='reponse', repond_a=la question,
 * answered_at posé), sans option structurée ni photo : la voix ne fournit ni
 * l'une ni l'autre. Un module séparé plutôt qu'une modification de
 * `useDevLog.ts`, qui n'est monté que dans le cockpit et n'est donc pas
 * disponible depuis le micro.
 *
 * RELIT la question en base avant d'écrire, plutôt que de faire confiance à
 * l'identifiant reçu : un identifiant périmé (déjà répondu pendant qu'on
 * parlait, ou qui ne pointe plus vers une vraie question en attente) doit se
 * dire, pas s'écrire dans le vide. Client Supabase chargé PARESSEUSEMENT,
 * comme `echangeLocal.ts` et `erreurs.ts` : le banc d'essai du micro monte
 * ce module sans configuration Supabase.
 */
export async function repondreDecisionVoix(decisionId: string, reponse: string): Promise<string> {
  const mot = reponse.replace(/\s+/g, " ").trim()
  if (!mot) return "Je n'ai pas compris ce qu'il fallait répondre."

  try {
    const { supabase } = await import("@/lib/supabase")
    const { withTimeout } = await import("@/lib/withTimeout")

    const { data: session } = await supabase.auth.getSession()
    if (!session.session) return "Je ne suis pas connecté, je ne peux pas enregistrer ta réponse."
    const userId = session.session.user.id

    const { data: question, error: lectureError } = await withTimeout(
      supabase
        .from("dev_log")
        .select("id, user_id, item_id, author, kind, body, answered_at, created_at, pourquoi")
        .eq("id", decisionId)
        .maybeSingle(),
    )
    if (lectureError || !question) {
      return "Je ne retrouve pas cette question. Elle a peut-être déjà sa réponse."
    }
    // Une réponse tapée depuis le cockpit entre-temps, ou une question qui ne
    // s'adressait pas vraiment à Raphaël (message entre sessions, compte
    // rendu) : dans les deux cas on n'écrit rien plutôt que de deviner.
    if (question.answered_at || !enAttenteDeRaphael(question as DevLogEntry)) {
      return "Cette question a déjà sa réponse, je ne touche à rien."
    }

    const corps = corpsReponse(null, mot)

    const { data: inseree, error: insertError } = await withTimeout(
      supabase
        .from("dev_log")
        .insert({
          user_id: userId,
          item_id: question.item_id,
          author: AUTEUR_RAPHAEL,
          kind: "reponse",
          body: corps,
          repond_a: question.id,
        })
        .select("id"),
    )
    if (insertError || !inseree?.length) {
      signalerErreur("systeme", "Une réponse dictée à une décision en attente n'a pas pu être enregistrée", {
        detail: insertError ? String((insertError as { message?: string }).message ?? insertError) : "Aucune ligne insérée.",
        contexte: mot.slice(0, 200),
        source: "voix",
      })
      return "Je n'ai pas réussi à enregistrer ta réponse."
    }

    const { error: updateError } = await withTimeout(
      supabase.from("dev_log").update({ answered_at: new Date().toISOString() }).eq("id", question.id).select("id"),
    )
    if (updateError) {
      signalerErreur(
        "systeme",
        "Une réponse à une décision en attente est enregistrée mais la question ne s'est pas refermée",
        { detail: String((updateError as { message?: string }).message ?? updateError), contexte: mot.slice(0, 200), source: "voix" },
      )
      return `C'est noté : « ${corps} ».`
    }

    return `C'est noté : « ${corps} ».`
  } catch (err) {
    signalerErreur("systeme", "Une réponse dictée à une décision en attente n'a pas pu être enregistrée", {
      detail: err instanceof Error ? err.message : String(err),
      contexte: mot.slice(0, 200),
      source: "voix",
    })
    return "Je n'ai pas réussi à enregistrer ta réponse."
  }
}
