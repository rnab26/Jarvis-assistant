// Brancher (et débrancher) le compte Google de l'utilisateur.
//
// Trois chemins :
//   POST /google-oauth/start      — renvoie l'URL de consentement Google
//   GET  /google-oauth/callback   — Google y renvoie l'utilisateur après accord
//   POST /google-oauth/disconnect — révoque l'accès et efface les jetons
//
// La fonction est déployée SANS vérification automatique du jeton Supabase :
// le callback arrive de Google, qui n'en a pas. Chaque chemin qui touche aux
// données d'un utilisateur vérifie donc lui-même son identité — /start et
// /disconnect exigent un jeton valide, /callback s'appuie sur le paramètre
// "state" tiré au sort à l'aller et retrouvé en base au retour.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  AUTH_ENDPOINT,
  SCOPES,
  clientAdmin,
  configGoogle,
  echangerCode,
  emailDepuisIdToken,
  enregistrerJetons,
  revoquer,
} from "../_shared/google.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

/**
 * L'adresse de retour vers l'app, vérifiée contre une liste blanche. Sans
 * ce garde-fou, l'URL de callback deviendrait un tremplin vers n'importe
 * quel site — une redirection ouverte, que les hameçonneurs adorent.
 */
/** Schéma de retour propre à l'app Android — voir AndroidManifest.xml pour
 * pourquoi un schéma personnalisé plutôt qu'un App Link HTTPS. */
const SCHEMA_APP_ANDROID = "com.raphael.jarvis:"

function retourAutorise(url: string | null | undefined): string | null {
  if (!url) return null
  let cible: URL
  try {
    cible = new URL(url)
  } catch {
    return null
  }
  // Retour direct dans l'app native, plutôt que dans un onglet vers le site
  // web : c'est le schéma exact de l'application, garanti unique sur
  // l'appareil, donc pas de risque qu'une autre app se l'approprie.
  if (cible.protocol === SCHEMA_APP_ANDROID) return cible.toString()

  const hotesAutorises = [
    "rnab26.github.io",
    "localhost",
    "127.0.0.1",
  ]
  if (cible.protocol !== "https:" && cible.hostname !== "localhost" && cible.hostname !== "127.0.0.1") {
    return null
  }
  return hotesAutorises.includes(cible.hostname) ? cible.toString() : null
}

function page(titre: string, message: string, retour: string | null): Response {
  const lien = retour
    ? `<a class="btn" href="${retour.replace(/"/g, "&quot;")}">Revenir à Jarvis</a>`
    : `<p class="tip">Tu peux fermer cet onglet et revenir dans Jarvis.</p>`
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         background:#0f1318; color:#e7ecf2; padding:24px; }
  .box { max-width:420px; text-align:center; }
  h1 { font-size:22px; margin:0 0 10px; }
  p { color:#a6b0bc; margin:0 0 20px; }
  .btn { display:inline-block; padding:12px 20px; background:#e3a855; color:#1a1206;
         text-decoration:none; border-radius:4px; font-weight:600; }
  .tip { color:#79858f; font-size:14px; }
</style></head><body><div class="box"><h1>${titre}</h1><p>${message}</p>${lien}</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  )
}

async function utilisateurConnecte(req: Request) {
  const autorisation = req.headers.get("Authorization")
  if (!autorisation) return null
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: autorisation } } },
  )
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const chemin = url.pathname.split("/").filter(Boolean).pop()
  // L'adresse de retour vient de SUPABASE_URL, jamais de la requête reçue.
  //
  // `req.url` porte l'hôte vu par le runtime, qui n'est pas le domaine public
  // du projet : Google recevait donc une adresse qui ne figurait pas dans la
  // liste du client OAuth et refusait tout net, « Erreur 400 :
  // redirect_uri_mismatch », avant même d'afficher l'écran d'autorisation.
  // Constaté sur le téléphone de Raphaël le 3 sept. 2026.
  //
  // Cette adresse doit être IDENTIQUE au caractère près à celle enregistrée
  // chez Google, et identique entre l'aller (/start) et le retour (/callback)
  // — Google la revérifie au moment d'échanger le code.
  const base = Deno.env.get("SUPABASE_URL") ?? url.origin
  const redirectUri = `${base.replace(/\/$/, "")}/functions/v1/google-oauth/callback`

  try {
    const config = configGoogle()

    /* ---------------- Démarrer la connexion ---------------- */
    if (chemin === "start") {
      if (!config) {
        return json(
          { error: "Le compte Google n'est pas encore configuré côté serveur (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." },
          503,
        )
      }
      const user = await utilisateurConnecte(req)
      if (!user) return json({ error: "Non authentifié." }, 401)

      let corps: { redirect_to?: string } = {}
      try {
        corps = await req.json()
      } catch {
        corps = {}
      }

      const admin = clientAdmin()
      await admin.rpc("purger_google_oauth_states")

      const state = crypto.randomUUID() + crypto.randomUUID()
      const { error } = await admin.from("google_oauth_states").insert({
        state,
        user_id: user.id,
        redirect_to: retourAutorise(corps.redirect_to),
      })
      if (error) return json({ error: `Impossible de préparer la connexion : ${error.message}` }, 500)

      const auth = new URL(AUTH_ENDPOINT)
      auth.searchParams.set("client_id", config.clientId)
      auth.searchParams.set("redirect_uri", redirectUri)
      auth.searchParams.set("response_type", "code")
      auth.searchParams.set("scope", SCOPES)
      // Sans ces deux paramètres, Google ne délivre pas de jeton de
      // rafraîchissement : l'accès mourrait au bout d'une heure.
      auth.searchParams.set("access_type", "offline")
      auth.searchParams.set("prompt", "consent")
      auth.searchParams.set("include_granted_scopes", "true")
      auth.searchParams.set("state", state)

      return json({ url: auth.toString() })
    }

    /* ---------------- Retour de Google ---------------- */
    if (chemin === "callback") {
      const erreur = url.searchParams.get("error")
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")

      if (erreur) {
        return page("Connexion annulée", `Google a répondu : ${erreur}. Rien n'a été branché.`, null)
      }
      if (!code || !state) {
        return page("Lien incomplet", "Il manque des informations dans le retour de Google. Relance la connexion depuis Jarvis.", null)
      }

      const admin = clientAdmin()
      const { data: demande } = await admin
        .from("google_oauth_states")
        .select("user_id, redirect_to, created_at")
        .eq("state", state)
        .maybeSingle()

      // Le state est à usage unique : on l'efface avant toute autre chose,
      // qu'il soit valable ou non.
      await admin.from("google_oauth_states").delete().eq("state", state)

      if (!demande) {
        return page("Demande expirée", "Cette demande de connexion n'est plus valable (elle expire après dix minutes). Relance-la depuis Jarvis.", null)
      }
      if (Date.now() - new Date(demande.created_at).getTime() > 10 * 60 * 1000) {
        return page("Demande expirée", "Plus de dix minutes se sont écoulées. Relance la connexion depuis Jarvis.", retourAutorise(demande.redirect_to))
      }

      const jetons = await echangerCode(code, redirectUri)
      await enregistrerJetons(admin, demande.user_id, jetons)

      const email = emailDepuisIdToken(jetons.id_token)
      await admin.from("google_accounts").upsert({
        user_id: demande.user_id,
        email,
        scopes: jetons.scope ?? SCOPES,
        connected_at: new Date().toISOString(),
      })

      return page(
        "Compte Google branché",
        email
          ? `Jarvis a maintenant accès à l'agenda et aux mails de ${email}.`
          : "Jarvis a maintenant accès à ton agenda et à tes mails.",
        retourAutorise(demande.redirect_to),
      )
    }

    /* ---------------- Débrancher ---------------- */
    if (chemin === "disconnect") {
      const user = await utilisateurConnecte(req)
      if (!user) return json({ error: "Non authentifié." }, 401)

      const admin = clientAdmin()
      const { data } = await admin
        .from("google_tokens")
        .select("refresh_token, access_token")
        .eq("user_id", user.id)
        .maybeSingle()

      if (data) await revoquer(data.refresh_token ?? data.access_token)

      await admin.from("google_tokens").delete().eq("user_id", user.id)
      await admin.from("google_accounts").delete().eq("user_id", user.id)
      return json({ ok: true })
    }

    return json({ error: "Chemin inconnu." }, 404)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
