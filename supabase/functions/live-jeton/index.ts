import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { GoogleGenAI } from "npm:@google/genai"

/**
 * Jeton éphémère pour ouvrir une session Gemini Live depuis l'app.
 *
 * POURQUOI : le prototype « Mode conversation Live » (décision de Raphaël,
 * 4 sept. 2026) fait parler l'app DIRECTEMENT avec Gemini par WebSocket —
 * l'audio part en continu, Google gère la détection de voix, la fin de tour
 * et l'interruption. Mais une clé d'API dans une app installée, c'est une
 * clé publique. Google prévoit pour ça des jetons à usage unique, courts,
 * verrouillés sur un modèle : c'est ce que rend cette fonction, à un
 * utilisateur connecté, et rien d'autre.
 *
 * verify_jwt reste à true (créée fermée par scripts/deployer-fonction.sh) :
 * il faut être connecté à Jarvis pour obtenir un jeton.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/**
 * Le modèle Live de l'offre gratuite (« Free of charge » en entrée et en
 * sortie sur la page des tarifs, vérifié le 4 sept.). Réglable par le
 * secret GEMINI_MODELE_LIVE sans redéployer.
 */
const MODELE_LIVE_PAR_DEFAUT = "gemini-2.5-flash-native-audio-preview-12-2025"

/** Durée de vie du jeton : de quoi ouvrir la session, pas plus. */
const VALIDITE_OUVERTURE_S = 120
/** Durée maximale d'une session ouverte avec ce jeton. */
const VALIDITE_SESSION_S = 30 * 60

function json(corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    )
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: "Non authentifié." }, 401)

    const cle = Deno.env.get("GEMINI_API_KEY")
    if (!cle) return json({ error: "GEMINI_API_KEY non configurée côté serveur." }, 500)

    const modele = Deno.env.get("GEMINI_MODELE_LIVE") || MODELE_LIVE_PAR_DEFAUT
    const maintenant = Date.now()

    // Les jetons éphémères ne vivent que dans la version v1alpha de l'API.
    const ai = new GoogleGenAI({ apiKey: cle, httpOptions: { apiVersion: "v1alpha" } })
    const jeton = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(maintenant + VALIDITE_OUVERTURE_S * 1000).toISOString(),
        expireTime: new Date(maintenant + VALIDITE_SESSION_S * 1000).toISOString(),
        // Verrouillé sur le modèle : un jeton volé n'ouvre rien d'autre.
        liveConnectConstraints: { model: modele },
      },
    })

    if (!jeton.name) return json({ error: "Google n'a pas rendu de jeton." }, 502)

    console.log("live-jeton", JSON.stringify({ utilisateur: user.id, modele }))
    return json({ jeton: jeton.name, modele, expire: jeton.expireTime ?? null })
  } catch (err) {
    console.error("live-jeton en échec", String(err))
    return json({ error: String(err).slice(0, 300) }, 500)
  }
})
