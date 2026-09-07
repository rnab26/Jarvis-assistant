/**
 * Dire au registre des erreurs qu'un morceau de la mémoire a lâché.
 *
 * POURQUOI DANS `_shared/`. La mémoire est silencieuse par construction — choix
 * de Raphaël, elle ne doit jamais le déranger — et elle avale ses erreurs.
 * Silencieuse ne doit pas vouloir dire invisible : elle ne dérange pas, mais
 * elle laisse une trace là où il peut aller la lire (le registre des erreurs
 * du cockpit, migration 0019). Trois endroits en ont besoin — `memoire.ts`,
 * `corrections.ts` et `live-jeton` — d'où le module partagé.
 *
 * LA FAMILLE DE DÉFAUT QUE ÇA FERME, formulée par la session cockpit le
 * 5 sept. : « une PANNE qui se lit comme une ABSENCE ». Un rappel de souvenirs
 * qui échoue rendait exactement le même résultat qu'un rappel qui n'a rien
 * trouvé — la chaîne vide. Jarvis devenait amnésique et tout avait l'air
 * normal, y compris le témoin de santé, qui mesure les ÉCRITURES et ne voit
 * pas une lecture cassée.
 *
 * Ne lève jamais, n'attend rien de l'appelant : un registre d'erreurs qui
 * ferait échouer ce qu'il observe serait la pire des ironies.
 */

/** Le client Supabase réduit à ce qu'on utilise : pas d'import Deno ici. */
interface ClientRpc {
  rpc: (nom: string, args: Record<string, unknown>) => Promise<{ error: unknown }>
}

export async function signalerPanne(
  supabase: ClientRpc,
  titre: string,
  erreur: unknown,
  contexte?: string | null,
  /**
   * L'utilisateur concerné, quand l'appelant le connaît et que `auth.uid()`
   * ne le donne pas. `jarvis_erreurs.user_id` est NOT NULL avec pour défaut
   * `auth.uid()` : ça suffit pour voice-command et live-jeton, qui portent le
   * jeton de Raphaël, mais PAS pour push-notifier, appelée par Postgres avec
   * la clé service_role. Là, `auth.uid()` est nul, l'insertion échoue, et le
   * catch ci-dessous l'avale — la panne restait invisible (constaté le
   * 7 sept. 2026).
   */
  userId?: string | null,
  /**
   * D'où vient la panne, tel que Raphaël le lit dans le registre. Défaut
   * « memoire » parce que c'est l'usage d'origine ; le push passe le sien,
   * sans quoi il chercherait une panne de mémoire pour une notification.
   */
  source: string = "memoire",
): Promise<void> {
  try {
    const detail =
      erreur instanceof Error
        ? erreur.message
        : typeof erreur === "object" && erreur !== null && "message" in erreur
          ? String((erreur as { message: unknown }).message)
          : String(erreur)
    await supabase.rpc("signaler_erreur", {
      p_categorie: "serveur",
      p_titre: titre,
      p_detail: detail.slice(0, 2000),
      p_contexte: contexte ? contexte.slice(0, 1000) : null,
      // Le registre regroupe par empreinte : une panne qui se répète à chaque
      // phrase reste UNE ligne avec un compteur, pas cinquante.
      p_source: source,
      ...(userId ? { p_user_id: userId } : {}),
    })
  } catch {
    // Rien à faire de plus : on ne va pas signaler l'échec du signalement.
  }
}
