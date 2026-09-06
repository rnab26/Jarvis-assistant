import { signalerErreur } from "@/lib/erreurs"

/**
 * Garder la trace d'une commande que l'appareil a traitée tout seul.
 *
 * POURQUOI CE FICHIER EXISTE (chantier 5c3182c5, mesuré sur ses vraies
 * données le 5 sept. 2026, ce n'est pas une hypothèse) : `resolveTranscript`
 * essaie d'abord `interpreterLocalement`, et quand une règle locale reconnaît
 * la phrase, elle rend la main immédiatement — `voice-command` n'est jamais
 * appelé. Or c'est `voice-command` (memoire.ts) qui écrit la ligne dans
 * `echanges`. Une commande comprise sur l'appareil ne laissait donc AUCUNE
 * trace : invisible pour « on avait parlé de quoi ? », invisible pour la
 * mémoire, et le seul reste était `journal_ecoute`, qui tronque la demande à
 * 80 caractères. Deux chantiers dictés le 5 sept. à 18h20 et 19h32 ont été
 * perdus pour de bon comme ça — il a dû les redicter.
 *
 * Trois règles, reprises de `noterEcoute` et `signalerErreur` :
 *
 *   — aucun `await` chez l'appelant : cette écriture OBSERVE une commande,
 *     elle ne doit jamais la ralentir ni la faire échouer ;
 *   — client Supabase chargé PARESSEUSEMENT, pour que le banc d'essai du
 *     micro (scripts/harness, monté sans configuration Supabase) puisse
 *     continuer à importer `MicButton` ;
 *   — l'écriture se termine par un `.select()` qui PROUVE qu'une ligne a
 *     bougé, et une écriture qui n'écrit rien part au registre des erreurs.
 *     Ce n'est pas de la prudence gratuite : le 5 sept., `echanges` n'avait
 *     aucune politique RLS UPDATE (migration 0021) et le rattrapage des
 *     empreintes n'a rien écrit pendant deux jours EN SILENCE — RLS ne refuse
 *     pas bruyamment, il restreint les lignes, et PostgREST rend un succès.
 *
 * `embedding` reste `null` : l'empreinte se calcule avec `Supabase.ai`, qui
 * n'existe que dans une Edge Function, pas dans le navigateur. Ce n'est pas
 * bloquant — `rattraperEmpreintes` (memoire.ts) donne son empreinte à dix
 * échanges anciens à chaque phrase envoyée au serveur, donc la ligne devient
 * cherchable d'elle-même peu après.
 *
 * Ces phrases ne passent volontairement PAS par l'extraction de souvenirs :
 * la consigne d'extraction dit déjà de ne rien retenir d'une demande de
 * création de tâche ou de chantier, et ce sont exactement les phrases que les
 * règles locales reconnaissent. C'est l'historique qui manquait, pas les
 * souvenirs.
 */

/** Au-delà, on abandonne : une trace n'attend jamais après le réseau. */
const DELAI_MAX_MS = 10_000

export function enregistrerEchangeLocal(transcript: string, reponse: string | null): void {
  const dit = transcript.replace(/\s+/g, " ").trim()
  if (!dit) return

  void (async () => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { withTimeout } = await import("@/lib/withTimeout")
      const { data: session } = await supabase.auth.getSession()
      // Pas connecté : rien à écrire, et surtout pas une erreur de plus.
      if (!session.session) return

      const { data, error } = await withTimeout(
        supabase
          .from("echanges")
          .insert({
            user_id: session.session.user.id,
            transcript: dit,
            reponse: reponse?.replace(/\s+/g, " ").trim() || null,
          })
          .select("id"),
        DELAI_MAX_MS,
      )

      // Zéro ligne rendue = l'écriture n'a pas eu lieu, quoi qu'en dise
      // l'absence d'erreur. C'est exactement la panne qui s'est lue comme une
      // absence pendant deux jours ; elle ne doit plus pouvoir se cacher.
      if (error || !data?.length) {
        signalerErreur("systeme", "Une commande traitée sur l'appareil n'a pas pu être gardée dans l'historique", {
          detail: error
            ? String((error as { message?: string }).message ?? error)
            : "L'écriture n'a touché aucune ligne : politique RLS manquante sur echanges, ou session expirée.",
          contexte: dit.slice(0, 200),
          source: "voix",
        })
      }
    } catch (err) {
      signalerErreur("systeme", "Une commande traitée sur l'appareil n'a pas pu être gardée dans l'historique", {
        detail: err instanceof Error ? err.message : String(err),
        contexte: dit.slice(0, 200),
        source: "voix",
      })
    }
  })()
}
