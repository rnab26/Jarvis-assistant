// Lire un lien ou un PDF qu'on partage à Jarvis, et en sortir l'essentiel.
//
// Chantier 73f06a28. Sa réponse du 3 sept. 2026 : oui, et sa phrase va plus
// loin que le lien — « pour l'entraîner et pour pouvoir le faire travailler sur
// des tâches que je lui demanderais et notamment des tâches répétitives, il
// faut qu'il puisse pousser et développer ses capacités. »
//
// CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT. Le partage depuis une autre
// application marche depuis le 5 sept. (`useShareReceiver.ts`) : ce qu'il
// partage à Jarvis est enregistré dans Documents. Mais ce n'était QUE ranger.
// Un devis, un bail, un compte-rendu de vingt pages atterrissaient tels quels,
// et il fallait les lire soi-même — donc ça ne servait à rien.
//
// TROIS CHOSES À NE PAS DÉFAIRE :
//
// 1. L'ADRESSE NE VIENT PAS DE LUI. Elle vient d'une application tierce, d'un
//    SMS, d'un mail. Tout passe donc par `_shared/lienSur.ts` : https
//    uniquement, aucune adresse interne, redirections revalidées une par une.
//    C'est la même protection que pour les reçus, et c'est exprès la MÊME
//    source — deux copies d'un garde-fou SSRF, c'est la garantie qu'on n'en
//    corrigera qu'une.
// 2. UN PDF PART TEL QUEL AU MODÈLE, on n'en extrait pas le texte nous-mêmes.
//    Un devis et un bail sont des documents MIS EN PAGE : un extracteur maison
//    perdrait les tableaux, donc les montants, et le résumé serait faux sans
//    que rien ne le signale.
// 3. QUAND ON N'A PAS TROUVÉ DE CONTENU, ON LE DIT. Une page rendue en
//    JavaScript ou derrière un mur de connexion ne donne que des menus ; en
//    tirer un résumé produirait quelque chose de plausible et de faux. C'est la
//    règle du projet — on n'annonce jamais au passé ce qu'on n'a pas constaté.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { appelerModele, moteurNonConfigure, phrasePourEchec } from "../_shared/modele.ts"
import { enBase64, recupererRessource } from "../_shared/lienSur.ts"
import { MAX_CARACTERES, assezDeTexte, lirePage, typeNu } from "../_shared/pageTexte.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jarvis-essai",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/** Ce que ce chemin-ci accepte : des pages, des documents, du texte brut. */
const TYPES_LISIBLES = [
  "text/html", "application/xhtml+xml", "text/plain", "text/markdown",
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
]

function estLisible(type: string | null): boolean {
  return TYPES_LISIBLES.includes(typeNu(type))
}

/**
 * La réponse EST l'appel d'outil, comme partout ailleurs dans ce projet.
 *
 * Un résumé en texte libre serait plus simple à obtenir et bien pire à
 * utiliser : on veut pouvoir en faire un document rangé, avec un titre qui se
 * lit dans une liste et des points qu'on parcourt. Et un champ « à faire »
 * séparé, parce que la question qu'il se pose devant un devis est « qu'est-ce
 * que ça m'engage à faire ».
 */
const OUTIL_RESUME = {
  name: "resume_document",
  description: "Rend l'essentiel d'un document ou d'une page, en français.",
  input_schema: {
    type: "object",
    properties: {
      titre: {
        type: "string",
        description:
          "Un titre court et PARLANT, qui dise de quoi il s'agit dans une liste de documents. « Devis Dupont, 4 200 € » et non « Document ».",
      },
      nature: {
        type: "string",
        enum: ["devis", "facture", "contrat", "compte_rendu", "article", "autre"],
        description: "Ce que c'est, pour qu'il le retrouve.",
      },
      essentiel: {
        type: "string",
        description:
          "Deux à quatre phrases : ce qu'il doit savoir s'il ne lit rien d'autre. Pas d'introduction, pas de « ce document présente ».",
      },
      points: {
        type: "array",
        items: { type: "string" },
        description:
          "Les faits qui comptent : montants, dates, durées, noms, conditions. Recopie les CHIFFRES tels quels, ne les arrondis jamais.",
      },
      a_faire: {
        type: "array",
        items: { type: "string" },
        description:
          "Ce que ce document lui demande de faire, s'il demande quelque chose. Tableau vide sinon — n'invente pas une action pour remplir.",
      },
      incertitudes: {
        type: "array",
        items: { type: "string" },
        description:
          "Ce que tu n'as PAS pu lire : passage coupé, tableau illisible, page incomplète. Tableau vide si tout était lisible. Ne présente jamais comme sûr ce qui ne l'est pas.",
      },
    },
    required: ["titre", "nature", "essentiel", "points", "a_faire", "incertitudes"],
  },
}

const CONSIGNE = `Tu lis un document ou une page que Raphaël vient de partager à Jarvis, et tu en sors l'essentiel en français.

Il est entrepreneur : immobilier, proptech, outils internes. Ce qu'il regarde en premier dans un document, ce sont les MONTANTS, les DATES, les DURÉES et ce qui l'ENGAGE.

Trois règles :
- Recopie les chiffres tels quels. Un montant arrondi ou une date approximative rend le résumé inutilisable, et il ne peut pas le savoir sans rouvrir le document.
- N'invente rien pour remplir un champ. Un tableau vide est une réponse juste ; une action inventée lui fait perdre du temps.
- Ce que tu n'as pas pu lire va dans « incertitudes ». Ne le présente jamais comme lu.

Appelle TOUJOURS l'outil.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return json({ error: "Non authentifié." }, 401)

    const essai = req.headers.get("x-jarvis-essai") === "1"
    const manque = await moteurNonConfigure(essai)
    if (manque) return json({ error: manque }, 500)

    const { url, texte } = await req.json().catch(() => ({}))
    if (!url && !texte) return json({ error: "Rien à lire : ni adresse, ni texte." }, 400)

    let aLire = ""
    let document: { mimeType: string; base64: string } | undefined
    let source = ""
    let tronquee = false

    if (url) {
      const r = await recupererRessource(String(url), {
        accepte: estLisible,
        refusDeType:
          "Je ne sais pas lire ce type de fichier. Je lis les pages, les PDF, les images et le texte.",
        entetesAccept: "text/html,application/pdf,text/plain,image/*;q=0.8,*/*;q=0.1",
      })
      source = r.url_finale
      const type = typeNu(r.type)

      if (type === "application/pdf" || type.startsWith("image/")) {
        // Tel quel au modèle : voir le point 2 de l'en-tête.
        document = { mimeType: type, base64: enBase64(r.octets) }
        aLire = `Lis ce document et rends-en l'essentiel. Il vient de ${source}.`
      } else {
        const brut = new TextDecoder("utf-8", { fatal: false }).decode(r.octets)
        const page = type === "text/html" || type === "application/xhtml+xml"
          ? lirePage(brut)
          : { titre: null, texte: brut.slice(0, MAX_CARACTERES), tronquee: brut.length > MAX_CARACTERES }
        tronquee = page.tronquee

        if (!assezDeTexte(page.texte)) {
          // On le DIT, on ne résume pas trois mots de menu. Une page rendue en
          // JavaScript ou derrière un mur de connexion tombe ici.
          return json({
            lisible: false,
            source,
            message:
              "Je n'ai trouvé presque aucun texte à cette adresse : la page se construit sûrement dans le navigateur, ou elle demande de se connecter. Ouvre-la et partage-moi le texte, je le lirai.",
          })
        }
        aLire = `Voici ${page.titre ? `« ${page.titre} », ` : ""}pris à l'adresse ${source}${
          page.tronquee ? " (le document est long, il est coupé à la fin)" : ""
        } :\n\n${page.texte}`
      }
    } else {
      const brut = String(texte)
      if (!assezDeTexte(brut)) return json({ error: "Ce texte est trop court pour valoir un résumé." }, 400)
      tronquee = brut.length > MAX_CARACTERES
      aLire = `Voici un texte que Raphaël a partagé${tronquee ? " (coupé à la fin)" : ""} :\n\n${brut.slice(0, MAX_CARACTERES)}`
    }

    const { args, echec } = await appelerModele({
      role: "commande",
      systeme: CONSIGNE,
      texte: aLire,
      document,
      outil: OUTIL_RESUME,
      maxTokens: 2048,
      essai,
      journal: { supabase, userId: user.id },
    })

    if (echec || !args) {
      console.error("lire-document : le modèle n'a pas répondu", echec?.statut, echec?.texte)
      return json({ lisible: false, source, message: phrasePourEchec(echec) })
    }

    return json({ lisible: true, source, tronquee, resume: args })
  } catch (err) {
    // Les refus du garde-fou de liens arrivent ici, et leur message est écrit
    // pour être lu par Raphaël : on le relaie tel quel plutôt que de le
    // remplacer par « une erreur est survenue ».
    return json({ lisible: false, message: String(err instanceof Error ? err.message : err) }, 400)
  }
})
