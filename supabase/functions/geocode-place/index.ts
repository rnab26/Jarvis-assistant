// Traduit un nom de lieu dicté ("chantier Dan", "la maison") en
// coordonnées GPS via l'API Google Geocoding. La clé API reste côté
// serveur (secret Supabase GOOGLE_GEOCODING_API_KEY), jamais dans le
// bundle client. N'est appelée que quand l'utilisateur active la
// géolocalisation des rappels de lieu dans Paramètres.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { place } = await req.json()
    if (!place || typeof place !== "string") {
      return new Response(JSON.stringify({ error: "place manquant." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY")
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_GEOCODING_API_KEY non configurée côté serveur." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
    url.searchParams.set("address", place)
    url.searchParams.set("key", apiKey)
    url.searchParams.set("language", "fr")

    const geoResponse = await fetch(url)
    if (!geoResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Erreur Google Geocoding: ${await geoResponse.text()}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const geoData = await geoResponse.json()
    if (geoData.status !== "OK" || !geoData.results?.[0]) {
      return new Response(
        JSON.stringify({ lat: null, lng: null, status: geoData.status ?? "ZERO_RESULTS" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { lat, lng } = geoData.results[0].geometry.location
    return new Response(JSON.stringify({ lat, lng, status: "OK" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
