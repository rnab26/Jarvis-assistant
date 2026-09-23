/**
 * Retenir ce que Raphaël a dit qui MARCHE (chantiers 6af9c51b et c2fd0205,
 * 23 sept. 2026) — le pendant de `signalerErreur` pour ce qui réussit.
 *
 * Un seul chemin d'écriture, la fonction `noter_ce_qui_marche` (migration
 * 0053) : c'est elle qui calcule l'empreinte de regroupement, comme
 * `signaler_erreur` pour le registre.
 *
 * MÊMES DEUX RÈGLES QUE `signalerErreur`, et pour la même raison :
 * - elle ne fait JAMAIS échouer ce qu'elle observe — pas d'`await` chez
 *   l'appelant, client Supabase chargé paresseusement, erreurs avalées ;
 * - elle est bornée dans le temps : un appel resté en attente ne doit rien
 *   bloquer derrière lui.
 */

const DELAI_MAX_MS = 10_000

let enCours: Promise<void> = Promise.resolve()

export function noterCeQuiMarche(
  titre: string,
  { paroles = null, contexte = null }: { paroles?: string | null; contexte?: string | null } = {},
): void {
  const propre = titre.replace(/\s+/g, " ").trim()
  if (!propre) return

  enCours = enCours
    .then(async () => {
      const { supabase } = await import("@/lib/supabase")
      const { withTimeout } = await import("@/lib/withTimeout")
      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      await withTimeout(
        supabase.rpc("noter_ce_qui_marche", {
          p_source: "voix",
          p_titre: propre.slice(0, 200),
          p_paroles: paroles?.slice(0, 1000) ?? null,
          p_contexte: contexte?.slice(0, 1000) ?? null,
        }),
        DELAI_MAX_MS,
      )
    })
    .catch(() => {
      // Une confirmation qui ne s'écrit pas ne doit jamais se voir.
    })
}
