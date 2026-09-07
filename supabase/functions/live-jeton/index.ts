import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { type SupabaseClient, createClient } from "jsr:@supabase/supabase-js@2"
import { GoogleGenAI, Modality, Type } from "npm:@google/genai"
import { rappelerCorrections } from "../_shared/corrections.ts"
import { signalerPanne } from "../_shared/pannes.ts"
import { CONSIGNE_ENVIRONNEMENT } from "../_shared/environnement.ts"
import { rappelerBranchements } from "../_shared/branchements.ts"
import { CONSIGNE_HONNETETE } from "../_shared/honnetete.ts"
import { CONSIGNE_QUESTION_POSEE } from "../_shared/questionPosee.ts"

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
${CONSIGNE_HONNETETE}

${CONSIGNE_QUESTION_POSEE}
Pour le reste (questions générales, discussion, conseil), réponds directement.
${CONSIGNE_ENVIRONNEMENT}
Le contexte ci-dessous date de l'ouverture de la conversation : après une modification (tâche ajoutée, terminée…), reconsulte par l'outil plutôt que de répondre de mémoire.
SE SOUVENIR D'UNE CONVERSATION PASSÉE. Les faits que tu as retenus sur Raphaël sont dans le contexte ci-dessous, sers-t'en directement. En revanche le MOT-À-MOT de vos échanges passés (« on avait parlé de quoi pour la villa Dan ? », « qu'est-ce que tu m'avais dit à propos de… », « tu te souviens quand je t'ai parlé de… ») n'y est PAS : appelle alors l'outil commande_jarvis avec sa question telle quelle, c'est lui qui va rechercher dans vos conversations des sept derniers jours. Ne réponds jamais que tu ne t'en souviens pas sans avoir appelé l'outil.
Quand Raphaël clôt la conversation (« terminé », « fin de transmission », « au revoir », « c'est tout »…), réponds seulement « À plus tard. » — l'application ferme la conversation d'elle-même.
Si tu n'as pas compris, dis-le en un mot et laisse-le reformuler.`

/** Le contexte envoyé par l'app est borné : c'est relu à chaque tour. */
const CONTEXTE_MAX = 12000

/**
 * Souvenirs joints au contexte scellé. Quarante suffisent largement (Raphaël
 * en a une vingtaine de vivants), et ça reste petit devant CONTEXTE_MAX.
 */
const MAX_SOUVENIRS_LIVE = 40

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jarvis-essai",
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

/**
 * Les faits que Jarvis a retenus, mis en forme pour la consigne.
 *
 * Ne lève jamais : une mémoire indisponible doit dégrader la conversation,
 * pas l'empêcher de s'ouvrir.
 */
async function souvenirsDeLUtilisateur(supabase: SupabaseClient): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("souvenirs")
      .select("contenu, categorie")
      .is("perime_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_SOUVENIRS_LIVE)
    if (error) {
      // En Live le contexte est scellé UNE fois : une lecture ratée rend Jarvis
      // amnésique pour toute la conversation, sans que rien ne le dise.
      await signalerPanne(supabase, "Jarvis n'a pas pu relire ses souvenirs pour le mode Live", error)
      return ""
    }
    if (!data?.length) return ""
    const lignes = (data as { contenu: string; categorie: string }[]).map(
      (s) => `- (${s.categorie}) ${s.contenu}`,
    )
    return `Ce que tu sais déjà de Raphaël, retenu au fil de vos échanges :\n${lignes.join("\n")}\nSers-t'en naturellement, sans annoncer que tu t'en souviens.`
  } catch (err) {
    await signalerPanne(supabase, "Jarvis n'a pas pu relire ses souvenirs pour le mode Live", err)
    return ""
  }
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

    // NOS VÉRIFICATIONS NE DOIVENT PLUS VIDER LE QUOTA DE RAPHAËL. Même motif
    // que voice-command depuis le chantier 4eaf9c1d : l'en-tête « x-jarvis-essai »
    // fait basculer sur GEMINI_API_KEY_TEST, la clé d'un SECOND projet Google
    // AI Studio — le plafond de l'offre gratuite se compte PAR PROJET.
    // verifier-live-jeton.mjs et surtout verifier-live-contexte.mjs ouvrent de
    // VRAIES sessions Live : c'est par ce trou-là que quatre sessions l'ont
    // laissé sans Jarvis le 3 sept. à 21h28.
    //
    // L'en-tête n'ouvre aucun accès : la fonction exige déjà d'être connecté
    // (verify_jwt reste à true), et les deux clés sont également gratuites.
    const essai = req.headers.get("x-jarvis-essai") === "1"
    const cleEssai = Deno.env.get("GEMINI_API_KEY_TEST")
    const cle = (essai && cleEssai) || Deno.env.get("GEMINI_API_KEY")
    if (!cle) return json({ error: "GEMINI_API_KEY non configurée côté serveur." }, 500)

    // Sans cette trace, une clé de test absente est invisible : le contrôle
    // passe au vert en vidant quand même le quota du jour.
    if (essai) console.log("clé", cleEssai ? "test" : "normale (GEMINI_API_KEY_TEST absente)")

    const modele = Deno.env.get("GEMINI_MODELE_LIVE") || MODELE_LIVE_PAR_DEFAUT
    const maintenant = Date.now()

    let contexte = ""
    try {
      const corps = await req.json()
      if (typeof corps?.contexte === "string") contexte = corps.contexte.slice(0, CONTEXTE_MAX)
    } catch {
      // Pas de corps : une session sans contexte, c'est permis.
    }

    // Ce que Jarvis a retenu de Raphaël, joint ICI et pas par l'app.
    //
    // POURQUOI ICI. En mode classique, voice-command cherche les souvenirs
    // pertinents à CHAQUE phrase (rappelerSouvenirs). En Live, le contexte est
    // scellé une seule fois à l'ouverture : on ne sait pas encore de quoi on
    // va parler, donc on ne peut rien chercher « par rapport à la question ».
    // On joint donc ce qu'il sait, tout court. C'est petit — une vingtaine de
    // phrases courtes — et ça évite que Jarvis soit amnésique dans un mode et
    // pas dans l'autre.
    //
    // Et côté serveur plutôt que côté app : le contexte envoyé par l'app est
    // déjà volumineux, l'app n'a pas besoin de charger les souvenirs pour
    // parler, et surtout ça reste vrai même si une autre session change
    // contexteLive() dans MicButton.
    // Les corrections que Raphaël a écrites suivent aussi : se faire reprendre
    // deux fois sur la même chose est ce qui l'agace le plus, et ça ne doit pas
    // dépendre du mode dans lequel il parle.
    // « À quoi tu es branché ? » — sa remarque du 6 sept. Joint ici comme les
    // souvenirs et les corrections, et pour la même raison : en Live le
    // contexte est scellé une fois à l'ouverture, donc il doit contenir tout
    // ce que le modèle ne pourra plus aller chercher.
    // LES TROIS EN PARALLÈLE, ET C'EST MESURÉ. Écrites dans un gabarit, ces
    // trois lectures s'exécutaient l'une APRÈS l'autre — un gabarit évalue ses
    // expressions de gauche à droite, donc trois allers-retours Supabase mis
    // bout à bout. Relevé le 6 sept. sur son journal (live_debut, découpé en
    // trois depuis le 5) : ms_jeton est de loin le plus gros morceau d'une
    // ouverture Live — 1200 à 1500 ms d'ordinaire, 4444 et 8163 ms au pire —
    // devant ms_connexion (630-1275) et ms_micro (333-850). Le micro de la
    // WebView, que je soupçonnais, n'y est pour rien : c'est nous.
    //
    // Les trois sont indépendantes et aucune ne peut échouer bruyamment (elles
    // avalent leurs erreurs et rendent ""), donc Promise.all ne change que le
    // temps. L'ordre du texte final reste celui d'avant.
    const [branchements, souvenirs, corrections] = await Promise.all([
      rappelerBranchements(supabase),
      souvenirsDeLUtilisateur(supabase),
      rappelerCorrections(supabase),
    ])
    contexte = `${contexte}\n${branchements}\n${souvenirs}\n${corrections}`.trim()

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
