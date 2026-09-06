// Envoie une notification PUSH (Firebase Cloud Messaging) pour les deux
// notifications que Raphaël a acceptées et qui ne sonnaient jusqu'ici que
// pendant que l'app tourne : « une session a livré des chantiers » et
// « une session est bloquée et t'attend » (CLAUDE.md, section « Les
// notifications », chantier 76a6a595).
//
// APPELÉE PAR POSTGRES, PAS PAR L'APP : deux triggers (migration 0028)
// postent ici via pg_net quand dev_items.archived_at passe à non-null, et à
// chaque insertion dans dev_log. C'est pour ça que verify_jwt est FALSE — il
// n'y a ni navigateur ni jeton utilisateur ici — et que la seule protection
// est le secret partagé x-push-secret (déposé dans Vault côté base et dans
// les secrets Edge Functions, jamais dans un fichier versionné).
//
// LE TRI « est-ce que ça concerne Raphaël » est réimplémenté ici en
// TypeScript plutôt qu'en SQL, pour rester le plus proche possible de
// l'original : src/lib/journalDestinataire.ts (estPourRaphael) côté client.
// Les deux copies doivent rester identiques — si tu changes l'une, change
// l'autre.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const AUTEUR_RAPHAEL = "Raphaël"

function adresseeAUneSession(body: string): boolean {
  return /^pour la session\b/i.test(body.trim())
}

/** Copie de estPourRaphael (src/lib/journalDestinataire.ts). */
function estPourRaphael(entry: { author: string; kind: string; body: string; answered_at: string | null }): boolean {
  if (entry.author === AUTEUR_RAPHAEL) return false
  if (entry.answered_at || adresseeAUneSession(entry.body)) return false
  return entry.kind === "question" || entry.kind === "blocage" || entry.kind === "action"
}

/** Copie de corpsChantiersLivres (src/lib/notifications/plan.ts). */
function corpsChantiersLivres(titres: string[]): string {
  if (titres.length === 1) return titres[0]
  const listes = titres.slice(0, 2).join(", ")
  const reste = titres.length - 2
  return reste > 0 ? `${listes} et ${reste} autre${reste > 1 ? "s" : ""}` : listes
}

interface PrefsNotifsUtiles {
  livre: boolean
  bloque: boolean
}

/** Lit les deux seuls réglages qui décident du push — le reste de
 * PrefsNotifications (échéances, heures de silence...) ne concerne que les
 * notifications LOCALES, programmées côté app. Défaut à true (le même
 * défaut que PREFS_NOTIFS_DEFAUT côté client) quand le réglage n'a jamais
 * été touché : un utilisateur neuf doit être notifié, pas mis en silence
 * par une clé absente. */
function prefsUtiles(brutJarvisNotifications: string | null | undefined): PrefsNotifsUtiles {
  if (!brutJarvisNotifications) return { livre: true, bloque: true }
  try {
    const o = JSON.parse(brutJarvisNotifications) as Partial<PrefsNotifsUtiles>
    return { livre: o.livre !== false, bloque: o.bloque !== false }
  } catch {
    return { livre: true, bloque: true }
  }
}

function base64url(donnees: ArrayBuffer | Uint8Array): string {
  const octets = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees)
  let bin = ""
  for (const o of octets) bin += String.fromCharCode(o)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function importerClePrivee(pem: string): Promise<CryptoKey> {
  const corps = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "")
  const binaire = Uint8Array.from(atob(corps), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    "pkcs8",
    binaire.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
}

/**
 * Le jeton OAuth2 qui autorise l'envoi FCM, signé depuis le compte de
 * service (flux "JWT bearer" de Google, RFC 7523 — pas d'utilisateur
 * derrière, donc pas de rafraîchissement à conserver : on en resigne un à
 * chaque appel, il est valable une heure et ce coût est négligeable face au
 * volume d'un seul utilisateur).
 */
async function jetonFCM(compteServiceJson: string): Promise<string> {
  const compte = JSON.parse(compteServiceJson) as { client_email: string; private_key: string }
  const maintenant = Math.floor(Date.now() / 1000)
  const encodeur = new TextEncoder()
  const base64urlJson = (o: unknown) => base64url(encodeur.encode(JSON.stringify(o)))
  const nonSigne = `${base64urlJson({ alg: "RS256", typ: "JWT" })}.${base64urlJson({
    iss: compte.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: maintenant,
    exp: maintenant + 3600,
  })}`
  const cle = await importerClePrivee(compte.private_key)
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cle,
    encodeur.encode(nonSigne),
  )
  const assertion = `${nonSigne}.${base64url(signature)}`

  const reponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })
  if (!reponse.ok) {
    throw new Error(`OAuth2 Google a refusé le jeton FCM : ${await reponse.text()}`)
  }
  const donnees = await reponse.json()
  return donnees.access_token as string
}

interface EnvoiPush {
  titre: string
  corps: string
  canal: "jarvis_livraisons" | "jarvis_blocages"
  route: string
}

/** Envoie à un jeton, et dit s'il faut le retirer (désinstallé ou expiré :
 * FCM répond alors 404 UNREGISTERED — un jeton qui ne répond plus ne doit
 * pas être retenté indéfiniment). */
async function envoyerAUnJeton(
  jetonAcces: string,
  projetId: string,
  jetonAppareil: string,
  push: EnvoiPush,
): Promise<{ ok: boolean; retirer: boolean }> {
  const reponse = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projetId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jetonAcces}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: jetonAppareil,
          notification: { title: push.titre, body: push.corps },
          android: { notification: { channel_id: push.canal } },
          data: { route: push.route },
        },
      }),
    },
  )
  if (reponse.ok) return { ok: true, retirer: false }
  const detail = await reponse.text()
  console.error(`push-notifier: échec FCM (${reponse.status}) : ${detail}`)
  return { ok: false, retirer: reponse.status === 404 || reponse.status === 400 }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Méthode non autorisée.", { status: 405 })
  }

  const secretAttendu = Deno.env.get("PUSH_TRIGGER_SECRET")
  if (!secretAttendu || req.headers.get("x-push-secret") !== secretAttendu) {
    return new Response("Non autorisé.", { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    const body = await req.json()

    let userId: string | null = null
    let push: EnvoiPush | null = null

    if (body.type === "chantiers_livres") {
      const titres = Array.isArray(body.titres) ? (body.titres as string[]) : []
      if (titres.length === 0 || !body.user_id) {
        return new Response(JSON.stringify({ ignore: "rien_a_livrer" }), { status: 200 })
      }
      userId = body.user_id as string
      push = {
        titre: titres.length === 1 ? "Un chantier livré" : `${titres.length} chantiers livrés`,
        corps: corpsChantiersLivres(titres),
        canal: "jarvis_livraisons",
        route: "/cockpit",
      }
    } else if (body.type === "dev_log") {
      const { data: entree, error } = await supabase
        .from("dev_log")
        .select("author, kind, body, answered_at, user_id")
        .eq("id", body.id)
        .maybeSingle()
      if (error || !entree || !estPourRaphael(entree)) {
        return new Response(JSON.stringify({ ignore: "pas_pour_raphael" }), { status: 200 })
      }
      userId = entree.user_id as string
      push = {
        titre: entree.kind === "blocage" ? "Une session est bloquée" : "Une session te pose une question",
        corps: (entree.body as string).slice(0, 240),
        canal: "jarvis_blocages",
        route: "/cockpit",
      }
    } else {
      return new Response(JSON.stringify({ error: "type inconnu." }), { status: 400 })
    }

    if (!userId || !push) {
      return new Response(JSON.stringify({ ignore: "rien_a_envoyer" }), { status: 200 })
    }

    // MÊME RÉGLAGE QUE LE LOCAL, PAS UN SECOND : prefs.livre / prefs.bloque
    // dans Paramètres commandent déjà les notifications locales ; le push
    // doit obéir au même interrupteur, sinon le couper dans Paramètres
    // laisserait le téléphone sonner quand même app fermée.
    const { data: reglages } = await supabase
      .from("reglages")
      .select("valeurs")
      .eq("user_id", userId)
      .maybeSingle()
    const prefs = prefsUtiles(reglages?.valeurs?.jarvis_notifications as string | undefined)
    if (push.canal === "jarvis_livraisons" && !prefs.livre) {
      return new Response(JSON.stringify({ ignore: "prefs_livre_coupe" }), { status: 200 })
    }
    if (push.canal === "jarvis_blocages" && !prefs.bloque) {
      return new Response(JSON.stringify({ ignore: "prefs_bloque_coupe" }), { status: 200 })
    }

    const { data: jetons } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
    if (!jetons || jetons.length === 0) {
      return new Response(JSON.stringify({ ignore: "aucun_jeton" }), { status: 200 })
    }

    const compteServiceJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT")
    if (!compteServiceJson) {
      console.error("push-notifier: FIREBASE_SERVICE_ACCOUNT absente côté serveur.")
      return new Response(JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT manquante." }), {
        status: 500,
      })
    }
    const compte = JSON.parse(compteServiceJson) as { project_id: string }
    const jetonAcces = await jetonFCM(compteServiceJson)

    const aRetirer: string[] = []
    let envoyes = 0
    for (const { token } of jetons) {
      const resultat = await envoyerAUnJeton(jetonAcces, compte.project_id, token, push)
      if (resultat.ok) envoyes++
      else if (resultat.retirer) aRetirer.push(token)
    }
    if (aRetirer.length > 0) {
      await supabase.from("push_tokens").delete().in("token", aRetirer)
    }

    return new Response(JSON.stringify({ envoyes, retires: aRetirer.length }), { status: 200 })
  } catch (err) {
    console.error(`push-notifier: erreur inattendue : ${err}`)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
