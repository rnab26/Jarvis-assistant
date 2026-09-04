// Lire, créer, modifier et supprimer des événements dans l'agenda Google de
// l'utilisateur. Appelée par l'app quand une commande vocale parle d'agenda.
//
// Pourquoi côté serveur : le jeton Google ne descend jamais dans le
// navigateur (cf. supabase/migrations/0013_google_oauth.sql). L'app envoie
// une intention ("crée ce rendez-vous"), la fonction la traduit en appel
// Google avec le jeton qu'elle est seule à connaître.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { clientAdmin, obtenirAccessToken } from "../_shared/google.ts"
// Les règles de dates vivent à côté, dans un fichier sans dépendance Deno,
// pour que scripts/verifier-agenda-google.mjs puisse les prouver sous Node.
import { bornes, FUSEAU, instant, instantISO } from "./dates.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

type Evenement = {
  id: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  htmlLink?: string
}

/** Ce que l'app affiche et ce que Jarvis dit à voix haute. */
function simplifier(e: Evenement) {
  return {
    id: e.id,
    titre: e.summary ?? "(sans titre)",
    description: e.description ?? null,
    lieu: e.location ?? null,
    debut: e.start?.dateTime ?? e.start?.date ?? null,
    fin: e.end?.dateTime ?? e.end?.date ?? null,
    journee_entiere: !e.start?.dateTime && !!e.start?.date,
    lien: e.htmlLink ?? null,
  }
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  try {
    const autorisation = req.headers.get("Authorization")
    if (!autorisation) return json({ error: "Non authentifié." }, 401)

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: autorisation } } },
    )
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) return json({ error: "Non authentifié." }, 401)

    const admin = clientAdmin()
    const accessToken = await obtenirAccessToken(admin, auth.user.id)
    if (!accessToken) {
      // Message repris tel quel par la voix : il doit dire quoi faire.
      return json(
        {
          error: "compte_google_absent",
          message: "Ton compte Google n'est pas branché. Va dans Paramètres et appuie sur « Connecter mon compte Google ».",
        },
        409,
      )
    }

    const corps = await req.json()
    const action = String(corps.action ?? "list")
    const entetes = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }

    if (action === "list") {
      // Google exige un instant complet ici : un "2026-09-04T00:00:00" dicté
      // tel quel lui vaut un 400, et Jarvis répondait « Google a refusé la
      // demande » sur la question la plus banale, « qu'est-ce que j'ai
      // demain ? ».
      const depuis = corps.depuis ? instantISO(String(corps.depuis)) : new Date().toISOString()
      if (!depuis) return json({ error: "Début de période illisible." }, 400)
      const jusquA = corps.jusqu_a ? instantISO(String(corps.jusqu_a)) : null
      if (corps.jusqu_a && !jusquA) return json({ error: "Fin de période illisible." }, 400)

      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: String(Math.min(Number(corps.limite ?? 10), 50)),
        timeMin: depuis,
        timeZone: FUSEAU,
      })
      if (jusquA) params.set("timeMax", jusquA)
      if (corps.recherche) params.set("q", String(corps.recherche))

      const reponse = await fetch(`${API}?${params}`, { headers: entetes })
      const donnees = await reponse.json()
      if (!reponse.ok) return json({ error: "google", details: donnees }, 502)
      return json({ evenements: (donnees.items ?? []).map(simplifier) })
    }

    if (action === "create") {
      const dates = bornes(corps.debut, corps.fin, corps.journee_entiere)
      if (!dates) {
        return json(
          { error: corps.debut ? "Date de début illisible." : "Il manque la date de début." },
          400,
        )
      }

      const reponse = await fetch(API, {
        method: "POST",
        headers: entetes,
        body: JSON.stringify({
          summary: corps.titre ?? "(sans titre)",
          description: corps.description ?? undefined,
          location: corps.lieu ?? undefined,
          ...dates,
        }),
      })
      const donnees = await reponse.json()
      if (!reponse.ok) return json({ error: "google", details: donnees }, 502)
      return json({ evenement: simplifier(donnees) })
    }

    if (action === "update") {
      if (!corps.event_id) return json({ error: "event_id manquant." }, 400)
      const modifs: Record<string, unknown> = {}
      if (corps.titre !== undefined) modifs.summary = corps.titre
      if (corps.description !== undefined) modifs.description = corps.description
      if (corps.lieu !== undefined) modifs.location = corps.lieu
      if (corps.debut) {
        // Décaler un rendez-vous ne doit pas le raccourcir. « Décale mon
        // rendez-vous de jeudi à 16h » n'annonce pas de fin : sans cette
        // relecture, l'heure par défaut d'une heure écrasait la durée réelle
        // et un créneau de deux heures se retrouvait amputé de moitié.
        let fin = corps.fin ?? null
        if (!fin && !corps.journee_entiere) {
          const actuel = await fetch(
            `${API}/${encodeURIComponent(String(corps.event_id))}`,
            { headers: entetes },
          )
          if (actuel.ok) {
            const e = (await actuel.json()) as Evenement
            const d0 = e.start?.dateTime ? Date.parse(e.start.dateTime) : NaN
            const f0 = e.end?.dateTime ? Date.parse(e.end.dateTime) : NaN
            const debutAbsolu = instant(String(corps.debut))
            if (!Number.isNaN(d0) && !Number.isNaN(f0) && !Number.isNaN(debutAbsolu.getTime())) {
              fin = new Date(debutAbsolu.getTime() + (f0 - d0)).toISOString()
            }
          }
        }
        const dates = bornes(corps.debut, fin, corps.journee_entiere)
        if (!dates) return json({ error: "Date de début illisible." }, 400)
        Object.assign(modifs, dates)
      }

      if (Object.keys(modifs).length === 0) {
        return json({ error: "Aucune modification demandée." }, 400)
      }

      // PATCH plutôt que PUT : ne touche que ce qui est fourni, et laisse
      // intacts les invités, les rappels et tout ce qu'on ne connaît pas.
      const reponse = await fetch(`${API}/${encodeURIComponent(corps.event_id)}`, {
        method: "PATCH",
        headers: entetes,
        body: JSON.stringify(modifs),
      })
      const donnees = await reponse.json()
      if (!reponse.ok) return json({ error: "google", details: donnees }, 502)
      return json({ evenement: simplifier(donnees) })
    }

    if (action === "delete") {
      if (!corps.event_id) return json({ error: "event_id manquant." }, 400)
      const reponse = await fetch(`${API}/${encodeURIComponent(corps.event_id)}`, {
        method: "DELETE",
        headers: entetes,
      })
      if (!reponse.ok && reponse.status !== 410) {
        return json({ error: "google", details: await reponse.text() }, 502)
      }
      return json({ ok: true })
    }

    return json({ error: `Action inconnue : ${action}` }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
