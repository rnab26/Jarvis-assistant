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
      p_source: "memoire",
    })
  } catch {
    // Rien à faire de plus : on ne va pas signaler l'échec du signalement.
  }
}
