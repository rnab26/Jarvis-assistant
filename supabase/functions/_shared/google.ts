// Tout ce qui touche aux jetons Google, en un seul endroit : l'échange du
// code d'autorisation, le rafraîchissement, et la lecture d'un jeton
// utilisable. Les fonctions qui appellent une API Google (agenda, plus tard
// Gmail) passent toutes par `obtenirAccessToken` — pour qu'il n'existe
// jamais deux façons de décider si un jeton est encore valable.
//
// Rien ici ne s'exécute côté navigateur : ces fonctions manipulent le jeton
// de rafraîchissement, qui donne un accès durable au compte Google.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"

export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
export const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"

/**
 * Les autorisations demandées, dans l'ordre où Raphaël les a cochées dans la
 * console Google Cloud le 3 sept. 2026 :
 *   calendar.events — voir et modifier les événements de ses agendas
 *   gmail.modify    — lire, rédiger et envoyer des e-mails
 * openid et email sont les deux autorisations de base qui permettent de
 * savoir QUEL compte vient d'être branché, pour l'afficher dans Paramètres.
 * Elles ne donnent accès à aucune donnée.
 */
export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ")

export type JetonsGoogle = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  id_token?: string
}

/** Client à pleins pouvoirs : les tables de jetons n'ont aucune policy RLS. */
export function clientAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )
}

export function configGoogle(): { clientId: string; clientSecret: string } | null {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/** L'adresse du compte, lue dans l'id_token. Aucun appel réseau de plus. */
export function emailDepuisIdToken(idToken?: string): string | null {
  if (!idToken) return null
  try {
    const charge = idToken.split(".")[1]
    if (!charge) return null
    const json = atob(charge.replace(/-/g, "+").replace(/_/g, "/"))
    const donnees = JSON.parse(json) as { email?: string }
    return donnees.email ?? null
  } catch {
    return null
  }
}

export async function echangerCode(
  code: string,
  redirectUri: string,
): Promise<JetonsGoogle> {
  const config = configGoogle()
  if (!config) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absents.")

  const reponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })
  const donnees = await reponse.json()
  if (!reponse.ok) {
    throw new Error(`Google a refusé l'échange du code : ${JSON.stringify(donnees)}`)
  }
  return donnees as JetonsGoogle
}

export async function enregistrerJetons(
  admin: SupabaseClient,
  userId: string,
  jetons: JetonsGoogle,
  refreshDeSecours?: string | null,
): Promise<void> {
  // Google ne renvoie le jeton de rafraîchissement qu'à la toute première
  // autorisation. Sur un renouvellement, on garde celui qu'on avait déjà,
  // sans quoi la connexion mourrait au bout d'une heure.
  const refresh = jetons.refresh_token ?? refreshDeSecours ?? null
  const expiresAt = new Date(Date.now() + (jetons.expires_in - 60) * 1000).toISOString()

  const { error } = await admin.from("google_tokens").upsert({
    user_id: userId,
    access_token: jetons.access_token,
    refresh_token: refresh,
    expires_at: expiresAt,
    scopes: jetons.scope ?? SCOPES,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Enregistrement des jetons impossible : ${error.message}`)
}

/**
 * Un jeton d'accès utilisable, rafraîchi si besoin. `null` quand le compte
 * n'est pas branché — l'appelant doit alors le dire à l'utilisateur, pas
 * échouer silencieusement.
 */
export async function obtenirAccessToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("google_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw new Error(`Lecture des jetons impossible : ${error.message}`)
  if (!data) return null

  if (new Date(data.expires_at).getTime() > Date.now()) return data.access_token
  if (!data.refresh_token) return null

  const config = configGoogle()
  if (!config) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absents.")

  const reponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  })
  const jetons = await reponse.json()

  if (!reponse.ok) {
    // Jeton révoqué côté Google (mot de passe changé, accès retiré) : on
    // efface la connexion pour que l'app propose de la refaire, au lieu de
    // rejouer indéfiniment un jeton mort.
    if (reponse.status === 400 || reponse.status === 401) {
      await admin.from("google_tokens").delete().eq("user_id", userId)
      await admin.from("google_accounts").delete().eq("user_id", userId)
      return null
    }
    throw new Error(`Rafraîchissement refusé par Google : ${JSON.stringify(jetons)}`)
  }

  await enregistrerJetons(admin, userId, jetons as JetonsGoogle, data.refresh_token)
  return (jetons as JetonsGoogle).access_token
}

export async function revoquer(token: string): Promise<void> {
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    })
  } catch {
    // Une révocation qui échoue ne doit pas empêcher la déconnexion locale.
  }
}
