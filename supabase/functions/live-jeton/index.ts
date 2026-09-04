import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { GoogleGenAI, Modality, Type } from "npm:@google/genai"

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
 *
 * LA CONFIGURATION DE LA SESSION VIT ICI, dans le jeton — pas dans l'app.
 * Vérifié le 4 sept. (scripts/verifier-live-contexte.mjs) : avec un jeton
 * éphémère, la consigne envoyée par l'app à la connexion est IGNORÉE par
 * Google. Jarvis répondait « je n'ai pas accès à tes tâches » alors que
 * l'app les lui donnait. Le jeton verrouille donc la consigne, le contexte
 * (tâches, chantiers, contacts, envoyés par l'app dans le corps de la
 * requête), l'outil et les réglages audio. Bonus : la consigne ne quitte
 * pas le serveur.
 */

/** L'unique outil du modèle Live : il rend la main à l'app, qui exécute avec
 * ce qu'elle sait déjà faire (règles locales, puis voice-command). */
export const OUTIL_COMMANDE = {
  name: "commande_jarvis",
  description:
    "Fait agir Jarvis : créer, modifier, supprimer ou consulter ses tâches, chantiers, contacts, documents, rappels, son agenda Google, ses mails ; mettre de la musique, appeler, préparer un message, poser une alarme, lancer un itinéraire, régler la voix. Passe la demande telle qu'elle a été dite, sans la reformuler. Ne l'appelle pas pour une simple conversation ni pour ce qui est déjà dans le contexte fourni.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      demande: { type: Type.STRING, description: "La demande, mot pour mot." },
    },
    required: ["demande"],
  },
}

const CONSIGNE_LIVE = `Tu es Jarvis, l'assistant vocal personnel de Raphaël — une application qu'il a fait développer, pas un produit Google. Si on te demande qui tu es ou où tu vis : tu es Jarvis, tu vis dans son application, et tu as accès à ses données ci-dessous.
Tu parles français, de façon courte et naturelle : c'est une conversation à voix haute, pas un texte. Une ou deux phrases suffisent presque toujours.
TU AS ACCÈS à ses tâches, ses chantiers, ses contacts, sa date du jour : ils sont dans le contexte ci-dessous, réponds directement avec. Ne dis JAMAIS « je n'ai pas accès » : si l'information n'est pas dans le contexte (agenda, mails, documents), appelle l'outil commande_jarvis avec la question telle quelle.
Quand Raphaël te demande de FAIRE quelque chose (ajouter, modifier, terminer une tâche ou un chantier, noter un rendez-vous, un rappel, appeler, envoyer un message, mettre de la musique, régler ta voix…), appelle l'outil commande_jarvis avec sa demande telle quelle, puis dis-lui simplement ce que l'outil a rendu — c'est l'outil qui fait foi, pas toi.
Pour le reste (questions générales, discussion, conseil), réponds directement.
TON ENVIRONNEMENT, l'application Jarvis (réponds avec ça si on te demande où se trouve quelque chose ; ne dis jamais que tu n'as pas accès à l'interface) : six onglets en haut — Paramètres (voix, réveil par « Jarvis », mode conversation Live, mise à jour de l'app, applications par défaut), Tâches, Cockpit dev (les chantiers de développement confiés à Claude Code ; la fenêtre « Envoyer à Claude Code » pour dicter ou écrire un nouveau chantier ; juste en dessous, le journal de bord, où les sessions de développement posent leurs questions à Raphaël, avec un bouton Répondre), Documents, Contacts, Mémoire (ses souvenirs). Le cœur bleu au centre lance ou arrête la conversation. Les grandes décisions (« fiches ») lui arrivent comme des liens dans sa conversation avec Claude Code, pas dans l'application.
Le contexte ci-dessous date de l'ouverture de la conversation : après une modification (tâche ajoutée, terminée…), reconsulte par l'outil plutôt que de répondre de mémoire.
Quand Raphaël clôt la conversation (« terminé », « fin de transmission », « au revoir », « c'est tout »…), réponds seulement « À plus tard. » — l'application ferme la conversation d'elle-même.
Si tu n'as pas compris, dis-le en un mot et laisse-le reformuler.`

/** Le contexte envoyé par l'app est borné : c'est relu à chaque tour. */
const CONTEXTE_MAX = 12000

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

    let contexte = ""
    try {
      const corps = await req.json()
      if (typeof corps?.contexte === "string") contexte = corps.contexte.slice(0, CONTEXTE_MAX)
    } catch {
      // Pas de corps : une session sans contexte, c'est permis.
    }

    // Les jetons éphémères ne vivent que dans la version v1alpha de l'API.
    const ai = new GoogleGenAI({ apiKey: cle, httpOptions: { apiVersion: "v1alpha" } })
    const jeton = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(maintenant + VALIDITE_OUVERTURE_S * 1000).toISOString(),
        expireTime: new Date(maintenant + VALIDITE_SESSION_S * 1000).toISOString(),
        // Verrouillé sur le modèle ET la configuration : un jeton volé
        // n'ouvre rien d'autre, et la consigne ne quitte pas le serveur.
        liveConnectConstraints: {
          model: modele,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: contexte ? `${CONSIGNE_LIVE}\n\n${contexte}` : CONSIGNE_LIVE,
            tools: [{ functionDeclarations: [OUTIL_COMMANDE] }],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: { languageCode: "fr-FR" },
          },
        },
      },
    })

    if (!jeton.name) return json({ error: "Google n'a pas rendu de jeton." }, 502)

    console.log("live-jeton", JSON.stringify({ utilisateur: user.id, modele, contexte: contexte.length }))
    return json({ jeton: jeton.name, modele, expire: jeton.expireTime ?? null })
  } catch (err) {
    console.error("live-jeton en échec", String(err))
    return json({ error: String(err).slice(0, 300) }, 500)
  }
})
