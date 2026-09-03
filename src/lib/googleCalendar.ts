import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { EvenementAgenda } from "@/types/database"

/**
 * L'agenda Google, vu depuis l'app. Tout passe par la Edge Function
 * google-calendar : le jeton d'accès reste côté serveur, le navigateur ne
 * fait qu'exprimer une intention.
 *
 * Les erreurs remontent en français, prêtes à être dites à voix haute — en
 * particulier celle qui compte le plus : le compte Google n'est pas branché.
 * Une commande vocale qui échoue en silence, c'est ce qui fait croire que
 * Jarvis n'écoute pas.
 */

export class AgendaError extends Error {}

type Reponse = {
  evenements?: EvenementAgenda[]
  evenement?: EvenementAgenda
  ok?: boolean
  error?: string
  message?: string
}

async function appeler(corps: Record<string, unknown>): Promise<Reponse> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke<Reponse>("google-calendar", { body: corps }),
    15000,
  )

  if (error) {
    const contexte = (error as { context?: Response }).context
    if (contexte && typeof contexte.json === "function") {
      try {
        const detail = (await contexte.json()) as Reponse
        if (detail?.message) throw new AgendaError(detail.message)
        if (detail?.error === "google") {
          throw new AgendaError("Google a refusé la demande sur ton agenda.")
        }
        if (detail?.error) throw new AgendaError(detail.error)
      } catch (e) {
        if (e instanceof AgendaError) throw e
      }
    }
    throw new AgendaError("L'agenda n'a pas répondu.")
  }
  return data ?? {}
}

export async function listerEvenements(options: {
  depuis?: string
  jusqu_a?: string
  limite?: number
  recherche?: string
}): Promise<EvenementAgenda[]> {
  const reponse = await appeler({ action: "list", ...options })
  return reponse.evenements ?? []
}

export async function creerEvenement(options: {
  titre: string
  debut: string
  fin?: string | null
  journee_entiere?: boolean
  lieu?: string | null
  description?: string | null
}): Promise<EvenementAgenda | null> {
  const reponse = await appeler({ action: "create", ...options })
  return reponse.evenement ?? null
}

export async function modifierEvenement(options: {
  event_id: string
  titre?: string
  debut?: string
  fin?: string | null
  journee_entiere?: boolean
  lieu?: string | null
  description?: string | null
}): Promise<EvenementAgenda | null> {
  const reponse = await appeler({ action: "update", ...options })
  return reponse.evenement ?? null
}

export async function supprimerEvenement(eventId: string): Promise<void> {
  await appeler({ action: "delete", event_id: eventId })
}

/** L'agenda tel qu'on l'injecte dans l'exécuteur de commandes vocales. */
export const agendaApi = {
  listerEvenements,
  creerEvenement,
  modifierEvenement,
  supprimerEvenement,
}
