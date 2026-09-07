import { supabase } from "@/lib/supabase"
import type { CanalNotif } from "./plan"
import type { EntreeJournalNotif } from "./apprentissage"

/**
 * Le pont Supabase de `notifications_journal` (migration 0036).
 *
 * Tout ce qui décide vit dans apprentissage.ts, pur. Ici, seulement lire et
 * écrire — sans jamais faire échouer ce qu'on observe : une notification qui
 * s'affiche ou un appui qui navigue ne doivent jamais attendre après cette
 * écriture, ni échouer à cause d'elle. Même règle que journalEcoute.ts.
 */

/** Combien de jours d'historique suffisent à juger un canal. Au-delà, ses
 * habitudes ont pu changer ; ça borne aussi la taille de ce qu'on relit. */
export const FENETRE_JOURS = 60

/** Envoyée MAINTENANT (notification affichée, ou push parti). Sans attente :
 * appelé depuis un écouteur d'événement Android, jamais bloquant. */
export function noterEnvoyee(userId: string | undefined, canal: CanalNotif, notifId?: number) {
  if (!userId) return
  supabase
    .from("notifications_journal")
    .insert({ user_id: userId, canal, notif_id: notifId ?? null })
    .then(
      () => {},
      () => {},
    )
}

/**
 * Marque la plus récente notification non encore ouverte de ce canal comme
 * ouverte. `notifId`, quand on l'a, cible précisément la bonne ligne — sinon
 * (appui venu d'un push, dont l'id Android n'est pas transmis par FCM) on
 * prend la plus récente sans réponse pour ce canal : imprécis d'une place à
 * l'occasion, sans conséquence pour une moyenne calculée sur des dizaines
 * d'envois.
 */
export function noterOuverte(userId: string | undefined, canal: CanalNotif, notifId?: number) {
  if (!userId) return
  let requete = supabase
    .from("notifications_journal")
    .update({ ouverte_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("canal", canal)
    .is("ouverte_at", null)
  if (notifId !== undefined) requete = requete.eq("notif_id", notifId)
  requete
    .order("envoyee_at", { ascending: false })
    .limit(1)
    .then(
      () => {},
      () => {},
    )
}

/** Le journal des `FENETRE_JOURS` derniers jours, pour calculer les stats.
 * `null` sur échec — pas un tableau vide, qui se lirait comme « aucune
 * notification envoyée » alors qu'on n'a simplement pas pu lire. */
export async function lireJournal(userId: string): Promise<EntreeJournalNotif[] | null> {
  const depuis = new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("notifications_journal")
    .select("canal, envoyee_at, ouverte_at")
    .eq("user_id", userId)
    .gte("envoyee_at", depuis)
  if (error) return null
  return (data ?? []) as EntreeJournalNotif[]
}

/** Le bouton « Remettre à zéro » de la carte Paramètres : recommencer à
 * apprendre depuis rien, pour LUI, sans qu'un choix passé continue à peser. */
export async function remettreAZero(userId: string): Promise<void> {
  const { error } = await supabase.from("notifications_journal").delete().eq("user_id", userId)
  if (error) throw error
}
