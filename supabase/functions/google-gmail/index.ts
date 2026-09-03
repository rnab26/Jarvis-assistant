// Gmail vu par Jarvis : lire ce qui arrive, ouvrir un message en entier,
// préparer une réponse dictée, l'envoyer une fois validée, et faire circuler
// les pièces jointes.
//
// Construite sur le modèle de google-calendar : le jeton Google ne descend
// jamais dans le navigateur, l'app envoie une intention et cette fonction la
// traduit en appel Gmail avec le jeton qu'elle est seule à connaître. Le
// rafraîchissement du jeton est celui de _shared/google.ts, partagé avec
// l'agenda — il n'existe qu'une seule façon de décider si un jeton est encore
// valable.
//
// LA RÈGLE QUI COMMANDE TOUT LE RESTE : un e-mail part vers l'extérieur au
// nom de Raphaël. Rien ne s'envoie sans qu'il ait validé le texte à la voix.
// C'est pour ça que « préparer » et « envoyer » sont deux actions séparées, et
// que l'envoi exige `confirme: true` : une commande vocale mal comprise ne
// peut pas, à elle seule, écrire à quelqu'un. Ne les refonds jamais en une.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { clientAdmin, obtenirAccessToken } from "../_shared/google.ts"
// L'encodage vit à côté, sans dépendance Deno, pour que
// scripts/verifier-gmail.mjs le prouve sous Node sans envoyer d'e-mail.
import {
  construireMime,
  entete,
  extraireContenu,
  objetDeReponse,
  sansCitation,
} from "./message.ts"
// La requête de recherche des reçus vit à côté elle aussi : c'est la pièce
// la plus facile à casser sans s'en apercevoir, donc la plus utile à tester.
import { construireRequeteRecus, estDocument, liensDocuments } from "./recherche.ts"
// Suivre un lien venu d'un e-mail demande un garde-fou : l'adresse est
// choisie par celui qui écrit, pas par Raphaël. Le contrôle est isolé dans
// lien.ts pour être prouvable sans réseau.
import { recupererDocument } from "./lien.ts"

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

const API = "https://gmail.googleapis.com/gmail/v1/users/me"

/** Gmail renvoie des pièces jointes de plusieurs mégaoctets ; les faire
 * transiter en base64 dans une réponse JSON ferait tomber la fonction avant
 * d'être utile. Mieux vaut le dire que d'expirer sans explication. */
const TAILLE_MAX_PIECE = 8 * 1024 * 1024

/** Ce que Jarvis dit à voix haute d'un message, sans l'ouvrir. */
function resumer(m: {
  id: string
  threadId?: string
  snippet?: string
  labelIds?: string[]
  payload?: { headers?: { name: string; value: string }[] }
}) {
  const h = m.payload?.headers
  return {
    id: m.id,
    fil_id: m.threadId ?? null,
    de: entete(h, "From"),
    objet: entete(h, "Subject"),
    date: entete(h, "Date"),
    extrait: m.snippet ?? null,
    non_lu: (m.labelIds ?? []).includes("UNREAD"),
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

    const corps = await req.json()
    const action = String(corps.action ?? "list")

    // LE GARDE-FOU, AVANT TOUT LE RESTE. Il est placé ici volontairement :
    // avant même de chercher le jeton Google, pour qu'un envoi non confirmé
    // soit refusé sans qu'on ait seulement approché Gmail, et pour qu'il soit
    // vérifiable sans compte branché (cf. scripts/verifier-gmail.mjs).
    // L'app ne pose ce drapeau qu'après une validation dite à voix haute ;
    // sans lui, on refuse, même si tout le reste est prêt.
    if (action === "envoyer" && corps.confirme !== true) {
      return json(
        {
          error: "confirmation_absente",
          message:
            "Je n'envoie rien tant que tu ne me l'as pas confirmé. Dis-moi « envoie » quand le message te va.",
        },
        409,
      )
    }

    const admin = clientAdmin()
    const accessToken = await obtenirAccessToken(admin, auth.user.id)
    if (!accessToken) {
      // Message repris tel quel par la voix : il doit dire quoi faire.
      return json(
        {
          error: "compte_google_absent",
          message:
            "Ton compte Google n'est pas branché. Va dans Paramètres et appuie sur « Connecter mon compte Google ».",
        },
        409,
      )
    }

    const entetes = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }

    // ── Lister : « qu'est-ce que j'ai reçu ? », « des mails de Yoni ? » ──
    if (action === "list") {
      const params = new URLSearchParams({
        maxResults: String(Math.min(Number(corps.limite ?? 10), 25)),
      })
      // Par défaut la boîte de réception, non lus d'abord : c'est ce qu'il
      // demande en disant « qu'est-ce que j'ai reçu ? ».
      params.set("q", String(corps.recherche ?? "in:inbox is:unread"))

      const reponse = await fetch(`${API}/messages?${params}`, { headers: entetes })
      const donnees = await reponse.json()
      if (!reponse.ok) return json({ error: "google", details: donnees }, 502)

      // La liste ne renvoie que des identifiants : il faut un appel par
      // message pour l'expéditeur et l'objet. En « metadata », donc sans
      // rapatrier les corps ni les pièces jointes.
      const messages = await Promise.all(
        (donnees.messages ?? []).map(async (m: { id: string }) => {
          const p = new URLSearchParams({ format: "metadata" })
          for (const n of ["From", "Subject", "Date"]) p.append("metadataHeaders", n)
          const r = await fetch(`${API}/messages/${m.id}?${p}`, { headers: entetes })
          return r.ok ? resumer(await r.json()) : null
        }),
      )
      return json({ messages: messages.filter(Boolean) })
    }

    // ── Chercher ses reçus et ses factures ──
    //
    // Sa demande, mot pour mot : « qu il sache chercher des reçus si je lui
    // demande ». Une recherche Gmail nue ne suffit pas : « facture » sort
    // aussi les relances et les publicités, et le mot exact varie d un
    // fournisseur à l autre. D où cette requête composée, et le repli sur les
    // pièces jointes — un reçu voyage presque toujours en PDF ou en image.
    if (action === "recus") {
      // `recherche` désigne QUI ou QUOI : une personne (« Melissa »), une
      // enseigne (« Paz »), ou déjà de la syntaxe Gmail. La traduction est
      // dans recherche.ts, où elle se teste.
      const requete = construireRequeteRecus({
        recherche: corps.recherche ? String(corps.recherche) : null,
        jours: Number(corps.depuis_jours ?? 30),
      })

      const params = new URLSearchParams({
        q: requete,
        maxResults: String(Math.min(Number(corps.limite ?? 10), 25)),
      })
      const reponse = await fetch(`${API}/messages?${params}`, { headers: entetes })
      const donnees = await reponse.json()
      if (!reponse.ok) return json({ error: "google", details: donnees }, 502)

      // On descend en « full » ici, contrairement à `list` : sans le corps du
      // message, on ne saurait pas quelles pièces jointes il porte, et c est
      // justement le document qui l intéresse.
      const trouves = await Promise.all(
        (donnees.messages ?? []).map(async (m: { id: string }) => {
          const r = await fetch(`${API}/messages/${m.id}?format=full`, { headers: entetes })
          if (!r.ok) return null
          const message = await r.json()
          const { corps: texte, pieces_jointes } = extraireContenu(message.payload)
          return {
            ...resumer(message),
            // Un reçu est soit un document joint, soit un lien vers un
            // document — le cas de sa station essence. On rend les deux, et
            // c est l app qui décide quoi en faire.
            pieces_jointes: pieces_jointes.filter((p) => estDocument(p.type, p.nom)),
            liens: liensDocuments(texte),
          }
        }),
      )

      // Un message sans document ni lien n est pas un reçu exploitable : le
      // garder ferait dire à Jarvis « j en ai trouvé douze » pour rien.
      const recus = trouves.filter(
        (m): m is NonNullable<typeof m> =>
          !!m && (m.pieces_jointes.length > 0 || m.liens.length > 0),
      )
      return json({ recus })
    }

    // ── Lire un message en entier, pour que Jarvis le lise à voix haute ──
    if (action === "read") {
      if (!corps.message_id) return json({ error: "message_id manquant." }, 400)
      const reponse = await fetch(
        `${API}/messages/${encodeURIComponent(String(corps.message_id))}?format=full`,
        { headers: entetes },
      )
      const m = await reponse.json()
      if (!reponse.ok) return json({ error: "google", details: m }, 502)

      const { corps: texte, pieces_jointes } = extraireContenu(m.payload)
      const h = m.payload?.headers

      // Ouvrir un message, c'est l'avoir lu : sinon sa boîte reste pleine de
      // « non lus » qu'il vient justement de se faire lire.
      if (corps.marquer_lu !== false) {
        await fetch(`${API}/messages/${encodeURIComponent(String(corps.message_id))}/modify`, {
          method: "POST",
          headers: entetes,
          body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        })
      }

      return json({
        message: {
          ...resumer(m),
          // `corps` est ce qu'on lit à voix haute : sans les citations du fil,
          // qui feraient relire tout l'historique à chaque message.
          corps: sansCitation(texte),
          corps_complet: texte,
          pieces_jointes,
          // De quoi répondre dans le bon fil, sans que l'app ait à les
          // reconstituer elle-même.
          repondre_a: entete(h, "Reply-To") ?? entete(h, "From"),
          message_id_rfc: entete(h, "Message-ID"),
          references: entete(h, "References"),
          objet_reponse: objetDeReponse(entete(h, "Subject")),
        },
      })
    }

    // ── Préparer une réponse : on NE l'envoie pas, on la rend pour qu'il
    //    l'entende et la valide. C'est le cœur de ce qu'il a demandé. ──
    if (action === "preparer") {
      if (!corps.texte) return json({ error: "Il manque le texte de la réponse." }, 400)

      let destinataires = corps.destinataires ?? null
      let objet = corps.objet ?? null
      let repondA: string | null = corps.repond_a_message_id ?? null
      let references: string | null = corps.references ?? null
      let filId: string | null = corps.fil_id ?? null

      // Répondre à un message : on relit l'original plutôt que de faire
      // confiance à ce que le modèle a retenu de l'adresse et de l'objet.
      if (corps.message_id) {
        const r = await fetch(
          `${API}/messages/${encodeURIComponent(String(corps.message_id))}?format=metadata`,
          { headers: entetes },
        )
        if (!r.ok) return json({ error: "google", details: await r.json() }, 502)
        const m = await r.json()
        const h = m.payload?.headers
        destinataires = destinataires ?? entete(h, "Reply-To") ?? entete(h, "From")
        objet = objet ?? objetDeReponse(entete(h, "Subject"))
        repondA = repondA ?? entete(h, "Message-ID")
        references = references ?? entete(h, "References")
        filId = filId ?? m.threadId ?? null
      }

      if (!destinataires) return json({ error: "Il manque le destinataire." }, 400)

      return json({
        brouillon: {
          destinataires,
          copie: corps.copie ?? null,
          objet: objet ?? "(sans objet)",
          corps: String(corps.texte),
          repond_a_message_id: repondA,
          references,
          fil_id: filId,
          pieces_jointes: (corps.pieces_jointes ?? []).map(
            (p: { nom: string; type?: string }) => ({ nom: p.nom, type: p.type ?? null }),
          ),
        },
        // Lue telle quelle par la voix : il doit savoir que rien n'est parti.
        message:
          "Voilà ce que je m'apprête à envoyer. Dis-moi si je l'envoie, ou ce que tu veux changer.",
      })
    }

    // ── Envoyer, et seulement après validation explicite ──
    if (action === "envoyer") {
      // La confirmation a déjà été exigée plus haut, avant tout contact avec
      // Google : on ne peut pas arriver ici sans elle.
      if (!corps.destinataires) return json({ error: "Il manque le destinataire." }, 400)
      if (!corps.texte) return json({ error: "Il manque le texte du message." }, 400)

      const brut = construireMime({
        destinataires: String(corps.destinataires),
        copie: corps.copie ?? null,
        objet: String(corps.objet ?? "(sans objet)"),
        corps: String(corps.texte),
        repond_a_message_id: corps.repond_a_message_id ?? null,
        references: corps.references ?? null,
        pieces_jointes: corps.pieces_jointes ?? [],
      })

      const reponse = await fetch(`${API}/messages/send`, {
        method: "POST",
        headers: entetes,
        body: JSON.stringify({
          raw: brut,
          // Range la réponse dans la conversation d'origine côté Gmail.
          threadId: corps.fil_id ?? undefined,
        }),
      })
      const donnees = await reponse.json()
      if (!reponse.ok) return json({ error: "google", details: donnees }, 502)
      return json({ envoye: { id: donnees.id, fil_id: donnees.threadId ?? null } })
    }

    // ── Récupérer une pièce jointe (« récupération de documents ») ──
    if (action === "piece_jointe") {
      if (!corps.message_id || !corps.piece_jointe_id) {
        return json({ error: "message_id et piece_jointe_id sont nécessaires." }, 400)
      }
      const reponse = await fetch(
        `${API}/messages/${encodeURIComponent(String(corps.message_id))}` +
          `/attachments/${encodeURIComponent(String(corps.piece_jointe_id))}`,
        { headers: entetes },
      )
      const donnees = await reponse.json()
      if (!reponse.ok) return json({ error: "google", details: donnees }, 502)
      if ((donnees.size ?? 0) > TAILLE_MAX_PIECE) {
        return json(
          {
            error: "piece_jointe_trop_grosse",
            message: `Cette pièce jointe fait ${Math.round(donnees.size / 1048576)} Mo, c'est trop pour que je te la rapporte ici.`,
          },
          413,
        )
      }
      // Base64url, tel que Gmail le rend : c'est à l'appelant d'en faire un
      // fichier, on ne le décode pas pour rien en mémoire.
      return json({ piece_jointe: { taille: donnees.size ?? null, contenu_base64: donnees.data } })
    }

    // ── Récupérer le document au bout d'un lien ──
    //
    // « ils m'envoient un SMS avec la facture DANS LE LIEN ». Par mail, même
    // chose chez beaucoup de fournisseurs. Sans ça, `recus` sait dire qu'un
    // reçu existe mais pas le rapporter.
    if (action === "document_lien") {
      if (!corps.url) return json({ error: "url manquante." }, 400)
      try {
        const doc = await recupererDocument(String(corps.url))
        return json({ document: doc })
      } catch (err) {
        // Ces messages sont écrits pour être dits à voix haute : ils
        // expliquent quoi faire, ils ne récitent pas une erreur technique.
        return json({ error: "lien_inexploitable", message: String((err as Error).message) }, 422)
      }
    }

    return json({ error: `Action inconnue : ${action}` }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
