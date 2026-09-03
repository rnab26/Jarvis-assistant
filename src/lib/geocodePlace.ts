import { supabase } from "@/lib/supabase"

/** Traduit un nom de lieu en coordonnées GPS via la Edge Function
 * geocode-place (clé Google Geocoding côté serveur uniquement). Renvoie
 * null si le lieu n'a pas pu être localisé — le rappel reste alors
 * déclenché seulement par la conversation, comme avant. */
export async function geocodePlace(place: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      lat: number | null
      lng: number | null
      status: string
    }>("geocode-place", { body: { place } })
    if (error || !data || data.lat === null || data.lng === null) return null
    return { lat: data.lat, lng: data.lng }
  } catch {
    return null
  }
}
