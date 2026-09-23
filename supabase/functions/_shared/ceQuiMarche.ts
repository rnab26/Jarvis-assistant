/**
 * Ce que Raphaël a dit qui MARCHE — joint à la consigne de Jarvis, comme ses
 * corrections (`corrections.ts`), et pour la raison inverse.
 *
 * Chantier c2fd0205, 23 sept. 2026, ses mots : « Quand je dis à Jarvis que
 * tout se passe bien ou qu'il a bien accompli une tâche, la mémoire doit
 * s'entraîner en continuant à aller dans ce sens ». Les corrections disent à
 * Jarvis ce qu'il ne doit plus faire ; rien ne lui disait ce qu'il doit
 * CONTINUER à faire. Et « qu'est-ce qui marche bien chez toi ? » n'avait
 * aucune réponse (chantier a9c75d52 : « Jarvis doit pouvoir tout savoir sur
 * tout ce qu'il contient »).
 *
 * UNE SEULE SOURCE, importée par voice-command ET live-jeton : une règle
 * écrite d'un seul côté serait vraie au micro et fausse en Live.
 *
 * COURT, et silencieux quand il n'y a rien : chaque phrase envoie déjà ~45 000
 * caractères au modèle. Huit lignes au plus, et aucun titre suivi de rien.
 */
import { signalerPanne } from "./pannes.ts"

export interface ConfirmationMarche {
  source: string
  titre: string
  paroles?: string | null
  occurrences?: number | null
}

export const MAX_CONFIRMATIONS = 8
const PAROLES_MAX = 120

function propre(texte: string | null | undefined, max: number): string {
  return (texte ?? "").replace(/\s+/g, " ").trim().slice(0, max)
}

export function formaterCeQuiMarche(lignes: ConfirmationMarche[]): string {
  const retenues = (lignes ?? []).filter((l) => propre(l?.titre, 200)).slice(0, MAX_CONFIRMATIONS)
  if (!retenues.length) return ""
  const texte = retenues.map((l) => {
    const quoi =
      l.source === "cockpit"
        ? `la fonctionnalité « ${propre(l.titre, 160)} » (il l'a essayée sur son téléphone)`
        : `quand tu fais ${propre(l.titre, 120)}`
    const fois = (l.occurrences ?? 1) > 1 ? ` — ${l.occurrences} fois` : ""
    const mots = propre(l.paroles, PAROLES_MAX)
    return `- ${quoi}${fois}${mots ? ` : « ${mots} »` : ""}`
  })
  return (
    `\nCE QUE RAPHAËL T'A DIT QUI MARCHE BIEN. Continue exactement comme ça, ` +
    `et sers-t'en si on te demande ce qui fonctionne chez toi :\n${texte.join("\n")}`
  )
}

interface ClientLecture {
  from: (table: string) => {
    select: (colonnes: string) => {
      order: (colonne: string, options: { ascending: boolean }) => {
        limit: (n: number) => Promise<{ data: unknown; error: unknown }>
      }
    }
  }
}

export async function rappelerCeQuiMarche(
  supabase: ClientLecture & Parameters<typeof signalerPanne>[0],
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("ce_qui_marche")
      .select("source, titre, paroles, occurrences")
      .order("last_seen", { ascending: false })
      .limit(MAX_CONFIRMATIONS)
    if (error) {
      // Même règle que les corrections : une lecture cassée ne doit pas se
      // lire comme « il ne m'a jamais rien dit de bien ».
      await signalerPanne(supabase, "Jarvis n'a pas pu relire ce que Raphaël a dit qui marche", error)
      return ""
    }
    if (!Array.isArray(data)) return ""
    return formaterCeQuiMarche(data as ConfirmationMarche[])
  } catch (e) {
    await signalerPanne(supabase, "Jarvis n'a pas pu relire ce que Raphaël a dit qui marche", e)
    return ""
  }
}
