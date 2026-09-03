/**
 * Vérifie Gmail : l'encodage des messages, puis la lecture réelle de la boîte
 * du compte branché.
 *
 *   node --experimental-strip-types scripts/verifier-gmail.mjs
 *
 * CE QUE CE SCRIPT N'ENVOIE PAS. Aucun e-mail ne part d'ici, jamais. Un envoi
 * réel serait un message vers l'extérieur au nom de Raphaël, et c'est
 * précisément ce que la fonction interdit sans sa validation vocale. Ce qui
 * est vérifié, c'est (1) que le message construit est correct au bit près,
 * hors ligne, et (2) que la lecture fonctionne sur sa vraie boîte.
 *
 * Le MIME est un format qu'on ne devine pas, et ses erreurs sont silencieuses :
 * un objet accentué non encodé arrive en charabia, une ligne de base64 trop
 * longue et le corps se perd, un « In-Reply-To » oublié et la réponse crée un
 * fil neuf au lieu de se ranger dans la conversation. Rien de tout ça ne lève
 * d'erreur : d'où ces contrôles.
 *
 * L'étage 2 a besoin du jeton d'accès Google, qui dure une heure (voir la
 * même remarque dans verifier-agenda-google.mjs).
 */
import { execFileSync } from "node:child_process"
import {
  construireMime,
  decoderBase64Url,
  encoderEntete,
  extraireContenu,
  objetDeReponse,
  sansCitation,
} from "../supabase/functions/google-gmail/message.ts"
import { construireRequeteRecus, estDocument, liensDocuments } from "../supabase/functions/google-gmail/recherche.ts"
import { lienAutorise, recupererDocument, estTypeDocument } from "../supabase/functions/google-gmail/lien.ts"

const API = "https://gmail.googleapis.com/gmail/v1/users/me"

let echecs = 0
const verifier = (nom, ok, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64")

// ─────────────────── 1. L'encodage des messages, hors ligne ───────────────

console.log("— Construction des messages (sans réseau) —")

{
  const mime = construireMime({
    destinataires: "yoni@example.com",
    objet: "Où en est le chantier ?",
    corps: "Bonjour Yoni,\n\nOù en êtes-vous ? À très vite.\n\nRaphaël",
  })
  const [entetes, ...reste] = mime.split("\r\n\r\n")

  verifier(
    "un objet accentué voyage encodé (RFC 2047)",
    entetes.includes("Subject: =?UTF-8?B?"),
    `en-têtes obtenus :\n${entetes}`,
  )
  verifier(
    "et se décode sur l'objet exact",
    Buffer.from(
      entetes.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)[1],
      "base64",
    ).toString("utf8") === "Où en est le chantier ?",
    "l'objet décodé ne correspond pas",
  )
  const corpsDecode = Buffer.from(reste.join("\r\n\r\n").replace(/\r\n/g, ""), "base64").toString("utf8")
  verifier(
    "les accents du corps survivent à l'aller-retour",
    corpsDecode.includes("Où en êtes-vous ?") && corpsDecode.includes("Raphaël"),
    `corps décodé : ${JSON.stringify(corpsDecode)}`,
  )
  verifier(
    "aucune ligne de base64 ne dépasse 76 colonnes",
    mime.split("\r\n").every((l) => l.length <= 998),
    "une ligne trop longue peut être tronquée par un serveur",
  )
}

{
  // Un objet purement ASCII doit rester lisible tel quel.
  verifier(
    "un objet sans accent n'est pas encodé pour rien",
    encoderEntete("Weekly report") === "Weekly report",
    `obtenu : ${encoderEntete("Weekly report")}`,
  )
}

{
  // Le fil de discussion : sans ces deux en-têtes, la réponse part à côté.
  const mime = construireMime({
    destinataires: "yoni@example.com",
    objet: "Re: Chantier",
    corps: "Oui, mardi.",
    repond_a_message_id: "<abc123@mail.gmail.com>",
    references: "<debut@mail.gmail.com>",
  })
  verifier(
    "une réponse se range dans la conversation d'origine",
    mime.includes("In-Reply-To: <abc123@mail.gmail.com>") &&
      mime.includes("References: <debut@mail.gmail.com>"),
    mime.split("\r\n\r\n")[0],
  )
}

{
  // Un en-tête sur deux lignes permettrait d'ajouter un Bcc invisible.
  const mime = construireMime({
    destinataires: "yoni@example.com\r\nBcc: espion@example.com",
    objet: "Bonjour",
    corps: "Test",
  })
  verifier(
    "on ne peut pas glisser un en-tête dans un destinataire",
    !/^Bcc:/m.test(mime),
    "un Bcc injecté est passé dans les en-têtes",
  )
}

{
  const mime = construireMime({
    destinataires: "yoni@example.com",
    objet: "Le devis",
    corps: "Le voici.",
    pieces_jointes: [
      { nom: "devis.pdf", type: "application/pdf", contenu_base64: b64("%PDF-1.4 faux devis") },
    ],
  })
  const frontiere = mime.match(/boundary="([^"]+)"/)?.[1]
  verifier(
    "une pièce jointe donne un message multipart bien fermé",
    !!frontiere &&
      mime.includes(`Content-Disposition: attachment; filename="devis.pdf"`) &&
      mime.trimEnd().endsWith(`--${frontiere}--`),
    "frontière absente ou multipart non refermé",
  )
  verifier(
    "et le corps du message reste présent à côté",
    mime.includes(b64("Le voici.")),
    "le texte a disparu au profit de la pièce jointe",
  )
}

{
  verifier(
    "« Re: » ne se cumule pas d'un aller-retour à l'autre",
    objetDeReponse("Re: Chantier") === "Re: Chantier" &&
      objetDeReponse("Chantier") === "Re: Chantier",
    `obtenu : ${objetDeReponse("Re: Chantier")}`,
  )
}

{
  // Gmail imbrique les parties : un message écrit depuis un téléphone remonte
  // vide si on ne regarde que le premier niveau.
  const charge = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: Buffer.from("Bonjour Raphaël", "utf8").toString("base64url") } },
          { mimeType: "text/html", body: { data: Buffer.from("<p>Bonjour</p>", "utf8").toString("base64url") } },
        ],
      },
      {
        mimeType: "application/pdf",
        filename: "facture.pdf",
        body: { attachmentId: "att-1", size: 12345 },
      },
    ],
  }
  const { corps, pieces_jointes } = extraireContenu(charge)
  verifier(
    "le corps se trouve même imbriqué à deux niveaux",
    corps === "Bonjour Raphaël",
    `corps obtenu : ${JSON.stringify(corps)}`,
  )
  verifier(
    "et la pièce jointe est repérée avec son nom et sa taille",
    pieces_jointes.length === 1 && pieces_jointes[0].nom === "facture.pdf" &&
      pieces_jointes[0].taille === 12345,
    JSON.stringify(pieces_jointes),
  )
}

{
  const html = {
    mimeType: "text/html",
    body: { data: Buffer.from("<p>Bonjour</p><p>&agrave; demain</p>", "utf8").toString("base64url") },
  }
  verifier(
    "un message en HTML seul est lisible à voix haute",
    !extraireContenu(html).corps.includes("<"),
    `obtenu : ${JSON.stringify(extraireContenu(html).corps)}`,
  )
}

{
  const fil = "Oui, c'est bon pour mardi.\n\nLe 3 sept. 2026, Yoni a écrit :\n> Est-ce qu'on se voit ?\n> Dis-moi."
  verifier(
    "les citations du fil ne sont pas relues à voix haute",
    sansCitation(fil) === "Oui, c'est bon pour mardi.",
    `obtenu : ${JSON.stringify(sansCitation(fil))}`,
  )
}

{
  verifier(
    "le base64url de Gmail se décode, padding manquant compris",
    decoderBase64Url(Buffer.from("Café", "utf8").toString("base64url")) === "Café",
    `obtenu : ${decoderBase64Url(Buffer.from("Café", "utf8").toString("base64url"))}`,
  )
}

// ───────────── 1 bis. La requête qui retrouve un reçu, hors ligne ─────────
//
// Raphaël, le 3 sept. : « il ne faut pas forcément se bloquer à un prestataire
// en question qui s'appelle finbot que moi j'ai nommé ». Rien de personnel ne
// doit donc être codé ici — ni un nom, ni un destinataire — et la recherche
// doit marcher pour lui comme pour sa femme.

console.log("\n— La requête qui retrouve un reçu (sans réseau) —")

{
  const r = construireRequeteRecus()
  verifier(
    "sans précision : tous ses reçus de la période",
    r.includes("newer_than:30d") && r.includes("facture") && r.includes("has:attachment"),
    `obtenu : ${r}`,
  )
  verifier(
    "ses propres envois et les promotions sont écartés",
    r.includes("-in:sent") && r.includes("-category:promotions"),
    `obtenu : ${r}`,
  )
}

{
  // Le cas qu'il a décrit : « aller récupérer la facture chez ma femme ».
  // `from:` compare aussi le NOM AFFICHÉ, donc son adresse n'est pas requise.
  const r = construireRequeteRecus({ recherche: "Melissa" })
  verifier(
    "une personne nommée est cherchée comme expéditrice ET en texte",
    r.includes("from:Melissa") && /\bOR Melissa\b/.test(r),
    `obtenu : ${r}`,
  )
}

{
  const r = construireRequeteRecus({ recherche: "la station essence" })
  verifier(
    "un déterminant dicté ne part pas dans la recherche",
    !/from:l[ae]\b/i.test(r) && r.includes('from:"station essence"'),
    `obtenu : ${r}`,
  )
}

{
  const r = construireRequeteRecus({ recherche: "from:facturation@bezeq.co.il" })
  verifier(
    "une requête Gmail déjà écrite n'est pas réécrite par-dessus",
    r.includes("from:facturation@bezeq.co.il") && !r.includes("from:from:"),
    `obtenu : ${r}`,
  )
}

{
  verifier(
    "la période demandée est respectée, et bornée",
    construireRequeteRecus({ jours: 7 }).includes("newer_than:7d") &&
      construireRequeteRecus({ jours: 99999 }).includes("newer_than:365d"),
    `obtenu : ${construireRequeteRecus({ jours: 99999 })}`,
  )
}

{
  // Aucun nom propre ne doit exister dans le code : Jarvis sert aussi sa
  // femme, qui n'a pas les mêmes contacts.
  const r = construireRequeteRecus({ recherche: "finbot" })
  const neutre = construireRequeteRecus()
  verifier(
    "aucun destinataire n'est codé en dur",
    !/finbot|melissa|raphael/i.test(neutre) && r.includes("from:finbot"),
    `requête neutre : ${neutre}`,
  )
}

{
  verifier(
    "un PDF ou une photo est un reçu, une signature .ics non",
    estDocument("application/pdf", "f.pdf") && estDocument(null, "recu.JPG") &&
      !estDocument("text/calendar", "invite.ics"),
    "le filtre de documents ne trie pas correctement",
  )
  verifier(
    "un reçu au bout d'un lien est repéré",
    liensDocuments("Votre facture : https://paz.co.il/invoice/8891 merci").length === 1,
    `obtenu : ${JSON.stringify(liensDocuments("Votre facture : https://paz.co.il/invoice/8891 merci"))}`,
  )
}

// ─────── 1 ter. Le garde-fou des liens, hors ligne ───────
//
// L'adresse d'un reçu vient d'un e-mail : n'importe qui peut écrire à Raphaël,
// donc n'importe qui peut choisir l'adresse que notre serveur ira visiter.
// Sans ces contrôles, c'est un client HTTP offert à un inconnu, à l'intérieur
// de notre infrastructure — et rien ne se verrait à l'usage.

console.log("\n— Le garde-fou des liens (sans réseau) —")

{
  verifier(
    "une adresse de fournisseur en https est acceptée",
    lienAutorise("https://paz.co.il/invoice/8891.pdf").ok,
    "un lien légitime est refusé",
  )
  verifier(
    "http en clair est refusé",
    !lienAutorise("http://paz.co.il/invoice.pdf").ok,
    "un lien non chiffré est passé",
  )
  verifier(
    "les adresses internes sont refusées",
    ["https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x",
     "https://192.168.1.1/x", "https://172.16.0.9/x", "https://[::1]/x",
     "https://metadata.google.internal/x", "https://boîte.internal/x"]
      .every((u) => !lienAutorise(u).ok),
    "une adresse interne est passée à travers",
  )
  verifier(
    "169.254.169.254 — l'adresse des métadonnées de l'hébergeur — est refusée",
    !lienAutorise("https://169.254.169.254/computeMetadata/v1/").ok,
    "la cible SSRF classique est accessible",
  )
  verifier(
    "un autre protocole (file:, data:) est refusé",
    !lienAutorise("file:///etc/passwd").ok && !lienAutorise("data:text/html,x").ok,
    "un protocole non http est passé",
  )
}

{
  verifier(
    "seuls un PDF ou une image comptent comme document",
    estTypeDocument("application/pdf") && estTypeDocument("image/jpeg; charset=binary") &&
      !estTypeDocument("text/html") && !estTypeDocument(null),
    "le tri des types accepte n'importe quoi",
  )
}

{
  // Une redirection est le vrai piège : l'adresse d'entrée peut être publique
  // et parfaitement innocente, et rediriger vers l'intérieur.
  const faux = async (url) => {
    if (url.startsWith("https://paz.co.il"))
      return new Response(null, { status: 302, headers: { location: "https://169.254.169.254/secret" } })
    return new Response("ne devrait jamais être atteint", { status: 200 })
  }
  let refus = null
  try {
    await recupererDocument("https://paz.co.il/facture", { fetch: faux })
  } catch (e) { refus = e.message }
  verifier(
    "une redirection vers une adresse interne est refusée elle aussi",
    !!refus && /interne/i.test(refus),
    `obtenu : ${refus ?? "aucune erreur — la redirection a été suivie"}`,
  )
}

{
  // Le cas courant en vrai : le lien mène à une page de connexion.
  const page = async () =>
    new Response("<html>Connectez-vous</html>", { status: 200, headers: { "content-type": "text/html" } })
  let refus = null
  try {
    await recupererDocument("https://fournisseur.example/facture", { fetch: page })
  } catch (e) { refus = e.message }
  verifier(
    "une page HTML n'est pas prise pour un reçu, et il sait quoi faire",
    !!refus && /page/i.test(refus) && /ouvre/i.test(refus),
    `obtenu : ${refus}`,
  )
}

{
  const gros = async () =>
    new Response(new Uint8Array(10), {
      status: 200,
      headers: { "content-type": "application/pdf", "content-length": String(50 * 1024 * 1024) },
    })
  let refus = null
  try {
    await recupererDocument("https://fournisseur.example/gros.pdf", { fetch: gros })
  } catch (e) { refus = e.message }
  verifier(
    "un document trop gros est refusé avant d'être chargé",
    !!refus && /gros/i.test(refus),
    `obtenu : ${refus}`,
  )
}

{
  const pdf = async () =>
    new Response(new TextEncoder().encode("%PDF-1.4 facture"), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    })
  const doc = await recupererDocument("https://paz.co.il/facture.pdf", { fetch: pdf })
  verifier(
    "un vrai PDF est rapporté, décodable",
    Buffer.from(doc.contenu_base64, "base64").toString("utf8").startsWith("%PDF") &&
      doc.type === "application/pdf" && doc.taille === 16,
    JSON.stringify({ type: doc.type, taille: doc.taille }),
  )
}

// ────────────────────── 2. Lecture réelle de sa boîte ─────────────────────

console.log("\n— Lecture réelle de la boîte —")

const sql = (q) =>
  JSON.parse(execFileSync("scripts/sql.sh", [q], { encoding: "utf8" })).rows ?? []

const [compte] = sql(
  "select ga.email, gt.access_token, gt.expires_at" +
    " from google_accounts ga join google_tokens gt on gt.user_id = ga.user_id limit 1",
)

if (!compte) {
  console.log("Aucun compte Google branché : rien à vérifier côté Gmail.")
} else if (new Date(compte.expires_at).getTime() <= Date.now()) {
  console.log(
    `Le jeton d'accès de ${compte.email} a expiré le ${compte.expires_at}.\n` +
      "Ouvre l'app une fois pour qu'il se rafraîchisse, puis relance.",
  )
  console.log(`\n${echecs} échec(s) sur l'encodage ; Gmail non vérifié.`)
  process.exit(2)
} else {
  const entetes = { Authorization: `Bearer ${compte.access_token}` }
  console.log(`Compte : ${compte.email}`)

  const profil = await fetch(`${API}/profile`, { headers: entetes })
  const p = profil.ok ? await profil.json() : null
  verifier(
    "la portée gmail.modify ouvre bien la boîte",
    profil.ok,
    `Gmail répond ${profil.status}`,
  )

  const liste = await fetch(`${API}/messages?maxResults=3&q=in:inbox`, { headers: entetes })
  const d = liste.ok ? await liste.json() : {}
  verifier("lister la boîte de réception", liste.ok, `Gmail répond ${liste.status}`)

  const premier = (d.messages ?? [])[0]
  if (premier) {
    const r = await fetch(`${API}/messages/${premier.id}?format=full`, { headers: entetes })
    const m = r.ok ? await r.json() : null
    verifier("ouvrir un message en entier", r.ok, `Gmail répond ${r.status}`)
    if (m) {
      const { corps, pieces_jointes } = extraireContenu(m.payload)
      // Sur un vrai message, pas un jeu d'essai : c'est là que les cas tordus
      // (multipart imbriqué, HTML seul, encodages exotiques) se révèlent.
      verifier(
        "en extraire un corps lisible",
        typeof corps === "string" && corps.length > 0,
        "le corps extrait est vide — regarde la structure de ce message",
      )
      console.log(
        `      (${p?.messagesTotal ?? "?"} messages en tout ; dernier lu : ` +
          `${corps.length} caractères, ${pieces_jointes.length} pièce(s) jointe(s))`,
      )
    }
  }

  // La recherche de reçus, sur ses vrais messages. Une requête Gmail se teste
  // sur une vraie boîte ou pas du tout : sur un jeu d'essai, n'importe quelle
  // requête « marche ».
  const requete = construireRequeteRecus({ jours: 90 })
  const rRecus = await fetch(
    `${API}/messages?${new URLSearchParams({ q: requete, maxResults: "10" })}`,
    { headers: entetes },
  )
  const dRecus = rRecus.ok ? await rRecus.json() : {}
  verifier(
    "la requête « reçus » est acceptée par Gmail",
    rRecus.ok,
    `Gmail répond ${rRecus.status} — la syntaxe de recherche est refusée`,
  )

  // Trouver des messages ne suffit pas : ce qui compte est qu'il en reste
  // après le filtre « porte vraiment un document », sinon Jarvis annoncerait
  // des reçus qui n'en sont pas.
  let exploitables = 0
  for (const m of (dRecus.messages ?? []).slice(0, 8)) {
    const rr = await fetch(`${API}/messages/${m.id}?format=full`, { headers: entetes })
    if (!rr.ok) continue
    const msg = await rr.json()
    const { corps: texte, pieces_jointes: pj } = extraireContenu(msg.payload)
    const docs = pj.filter((x) => estDocument(x.type, x.nom))
    const liens = liensDocuments(texte)
    if (docs.length || liens.length) exploitables++
  }
  verifier(
    "et elle remonte des reçus réellement exploitables",
    exploitables > 0,
    `${(dRecus.messages ?? []).length} message(s) trouvés, mais aucun ne porte de document ` +
      "ni de lien de facture — la requête ou le filtre est à revoir",
  )
  console.log(`      (${exploitables} reçu(s) exploitable(s) sur 90 jours)`)
}

// ──────────── 3. Le garde-fou d'envoi, sur la fonction DÉPLOYÉE ──────────
//
// Le contrôle qui compte le plus. Il tourne sur un utilisateur de test
// éphémère, sans compte Google : c'est justement ce qui le rend probant, car
// un envoi non confirmé doit être refusé AVANT tout contact avec Gmail. Si un
// jour ce contrôle vire au rouge, un e-mail peut partir au nom de Raphaël
// sans qu'il l'ait dit.

const URL_PROJET = "https://bexiyvmdbxcwxasgslxp.supabase.co"
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANON || !SERVICE) {
  console.log(
    "\n— Garde-fou d'envoi — non vérifié : il faut ANON_KEY et SUPABASE_SERVICE_ROLE_KEY.",
  )
} else {
  console.log("\n— Garde-fou d'envoi, sur la fonction déployée —")

  const admin = (chemin, options = {}) =>
    fetch(`${URL_PROJET}${chemin}`, {
      ...options,
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

  const emailEssai = `essai-${Date.now()}@jarvis-test.local`
  const motDePasse = crypto.randomUUID()
  const cree = await (
    await admin("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: emailEssai, password: motDePasse, email_confirm: true }),
    })
  ).json()

  if (!cree?.id) {
    console.log("      (utilisateur de test impossible à créer, garde-fou non vérifié)")
  } else {
    try {
      const session = await (
        await fetch(`${URL_PROJET}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: ANON, "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailEssai, password: motDePasse }),
        })
      ).json()

      const appeler = async (charge) => {
        const r = await fetch(`${URL_PROJET}/functions/v1/google-gmail`, {
          method: "POST",
          headers: {
            apikey: ANON,
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(charge),
        })
        return { statut: r.status, corps: await r.json() }
      }

      const sansConfirmation = await appeler({
        action: "envoyer",
        destinataires: "personne@jarvis-test.local",
        objet: "Ceci ne doit jamais partir",
        texte: "Si ce message part, le garde-fou est cassé.",
      })
      verifier(
        "un envoi sans confirmation est refusé",
        sansConfirmation.statut === 409 &&
          sansConfirmation.corps?.error === "confirmation_absente",
        `obtenu : HTTP ${sansConfirmation.statut} ${JSON.stringify(sansConfirmation.corps)}`,
      )

      const confirmeFaux = await appeler({
        action: "envoyer",
        confirme: "oui",
        destinataires: "personne@jarvis-test.local",
        objet: "Ceci ne doit jamais partir",
        texte: "Une chaîne n'est pas une confirmation.",
      })
      verifier(
        "un « confirme » qui n'est pas exactement true ne suffit pas",
        confirmeFaux.statut === 409 &&
          confirmeFaux.corps?.error === "confirmation_absente",
        `obtenu : HTTP ${confirmeFaux.statut} ${JSON.stringify(confirmeFaux.corps)}`,
      )

      // Et la preuve que le refus vient bien du garde-fou et non de l'absence
      // de compte Google : la même requête confirmée va, elle, jusqu'au jeton.
      const confirme = await appeler({
        action: "envoyer",
        confirme: true,
        destinataires: "personne@jarvis-test.local",
        objet: "Ceci ne doit jamais partir",
        texte: "Sans compte Google branché, ça doit s'arrêter là.",
      })
      verifier(
        "le refus vient du garde-fou, pas d'un hasard de configuration",
        confirme.statut === 409 && confirme.corps?.error === "compte_google_absent",
        `obtenu : HTTP ${confirme.statut} ${JSON.stringify(confirme.corps)}`,
      )

      const lecture = await appeler({ action: "list" })
      verifier(
        "sans compte branché, Jarvis dit quoi faire au lieu d'échouer",
        lecture.statut === 409 && lecture.corps?.error === "compte_google_absent",
        `obtenu : HTTP ${lecture.statut} ${JSON.stringify(lecture.corps)}`,
      )
    } finally {
      await admin(`/auth/v1/admin/users/${cree.id}`, { method: "DELETE" })
    }
  }
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs ? 1 : 0)
