/**
 * Traduit l'échec du serveur vocal en une phrase qui dit quoi faire.
 *
 * supabase-js masque le corps de la réponse derrière un message unique et
 * inutile : « Edge Function returned a non-2xx status code ». Raphaël l'a vu
 * s'afficher sous le cœur de Jarvis sans aucun moyen de savoir ce qui n'allait
 * pas — alors que la vraie raison était nette côté serveur : la clé Anthropic
 * n'avait plus de crédit. Une panne qui ne se nomme pas se cherche pendant des
 * heures.
 */

/** Le vrai corps de la réponse, que supabase-js range dans `context`. */
export async function corpsDeLErreur(error: unknown): Promise<string> {
  const contexte = (error as { context?: unknown } | null)?.context
  if (!contexte || typeof (contexte as Response).text !== "function") return ""
  try {
    return await (contexte as Response).text()
  } catch {
    // Corps déjà consommé ou illisible : on se rabattra sur le message brut.
    return ""
  }
}

/**
 * La phrase à dire, à partir du corps renvoyé par la Edge Function.
 *
 * Chaque cas connu nomme la cause ET la sortie. Le reste est relayé tel quel
 * plutôt que masqué : un message obscur reste plus utile qu'un « une erreur
 * est survenue » qui n'apprend rien.
 */
export function traduireErreurServeur(corps: string, messageBrut = ""): string {
  const texte = `${corps} ${messageBrut}`.toLowerCase()

  if (texte.includes("credit balance is too low")) {
    return "Ma clé Anthropic n'a plus de crédit : je ne peux plus réfléchir tant qu'elle n'est pas rechargée. C'est à faire sur console.anthropic.com, rubrique facturation."
  }
  if (texte.includes("anthropic_api_key non configurée")) {
    return "Ma clé Anthropic n'est pas configurée côté serveur : je ne peux pas traiter ta demande."
  }
  if (texte.includes("overloaded") || texte.includes("529")) {
    return "Le modèle est débordé en ce moment. Redis-moi ça dans quelques secondes."
  }
  if (texte.includes("rate_limit") || texte.includes("too many requests")) {
    return "J'ai atteint ma limite de requêtes. Laisse-moi souffler quelques secondes."
  }
  if (texte.includes("authentication_error") || texte.includes("invalid x-api-key")) {
    return "Ma clé Anthropic est refusée par le serveur : elle a dû être changée ou révoquée."
  }
  if (texte.includes("non authentifié")) {
    return "Ta session a expiré. Reconnecte-toi et redis-moi ça."
  }
  if (texte.includes("transcript manquant")) {
    return "Je n'ai rien reçu à traiter."
  }

  // Cas inconnu : on remonte ce que le serveur a dit, débarrassé de
  // l'emballage JSON, plutôt qu'un message générique qui n'aide personne.
  const detail = extraireDetail(corps) || messageBrut
  return detail ? `Le serveur vocal a répondu : ${detail}` : "Le serveur vocal n'a pas répondu correctement."
}

function extraireDetail(corps: string): string {
  if (!corps) return ""
  try {
    const json = JSON.parse(corps)
    const brut = typeof json?.error === "string" ? json.error : ""
    if (!brut) return ""
    // La Edge Function préfixe l'erreur Anthropic puis recolle son JSON :
    // on en tire la phrase, pas la structure.
    const imbrique = brut.match(/"message"\s*:\s*"([^"]+)"/)
    return (imbrique ? imbrique[1] : brut).slice(0, 200)
  } catch {
    return corps.slice(0, 200)
  }
}

/** Le tout, pour l'appelant : lit le corps puis le traduit. */
export async function messageErreurServeurVocal(error: unknown): Promise<string> {
  const corps = await corpsDeLErreur(error)
  const brut = (error as { message?: string } | null)?.message ?? ""
  return traduireErreurServeur(corps, brut)
}
