// Mémoire longue durée de Jarvis.
//
// Isolé dans son propre module à dessein : plusieurs sessions Claude Code
// travaillent en parallèle sur index.ts, et la mémoire ne doit y ajouter que
// deux appels, pas quelques centaines de lignes.
//
// Ce qui est retenu : des faits courts (personnes, dossiers, engagements,
// préférences), jamais le texte des conversations. Le mot-à-mot vit 7 jours
// dans `echanges` puis disparaît — c'est le choix de Raphaël.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

/** Modèle embarqué dans les Edge Functions Supabase : gratuit, sur place. */
const MODELE_EMBEDDING = "gte-small"

const MAX_SOUVENIRS_RAPPELES = 8
const MAX_FAITS_PAR_ECHANGE = 5

interface Souvenir {
  contenu: string
  categorie: string
}

/** Le runtime Supabase expose `Supabase.ai` ; absent en local, d'où le garde-fou. */
function sessionIA(): { run: (t: string, o: unknown) => Promise<number[]> } | null {
  const global = globalThis as unknown as {
    Supabase?: { ai?: { Session: new (m: string) => { run: (t: string, o: unknown) => Promise<number[]> } } }
  }
  if (!global.Supabase?.ai?.Session) return null
  return new global.Supabase.ai.Session(MODELE_EMBEDDING)
}

async function empreinte(texte: string): Promise<number[] | null> {
  const session = sessionIA()
  if (!session) return null
  try {
    const sortie = await session.run(texte, { mean_pool: true, normalize: true })
    return Array.isArray(sortie) ? sortie : null
  } catch {
    // Une empreinte manquante dégrade la recherche, elle ne casse rien.
    return null
  }
}

/**
 * Souvenirs pertinents pour ce que l'utilisateur vient de dire.
 *
 * Retourne une chaîne prête à insérer dans le prompt, ou "" — jamais d'erreur :
 * un problème de mémoire ne doit pas empêcher Jarvis de répondre.
 */
export async function rappelerSouvenirs(
  supabase: SupabaseClient,
  transcript: string,
): Promise<string> {
  try {
    const vecteur = await empreinte(transcript)
    if (!vecteur) return ""

    const { data, error } = await supabase.rpc("chercher_souvenirs", {
      p_embedding: JSON.stringify(vecteur),
      p_limite: MAX_SOUVENIRS_RAPPELES,
    })
    if (error || !data?.length) return ""

    const lignes = (data as Souvenir[]).map((s) => `- (${s.categorie}) ${s.contenu}`)
    return `\nCe que tu sais déjà de l'utilisateur, et qui semble en rapport avec ce qu'il vient de dire :\n${lignes.join("\n")}\nSers-t'en naturellement, sans annoncer que tu t'en souviens.`
  } catch {
    return ""
  }
}

const OUTIL_EXTRACTION = {
  name: "extraire_faits",
  description:
    "Extrait de l'échange les faits durables à retenir sur l'utilisateur. Zéro fait est une réponse normale et fréquente.",
  input_schema: {
    type: "object" as const,
    properties: {
      faits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            contenu: {
              type: "string",
              description:
                "Le fait, en une phrase courte et autonome, compréhensible dans six mois sans le contexte de l'échange.",
            },
            categorie: {
              type: "string",
              enum: ["personne", "dossier", "engagement", "preference", "fait"],
            },
          },
          required: ["contenu", "categorie"],
        },
      },
    },
    required: ["faits"],
  },
}

const CONSIGNE_EXTRACTION = `Tu tries ce qui mérite d'être retenu d'un échange entre Raphaël et son assistant.

RETIENS : les personnes de son entourage (qui elles sont, leur lien avec lui), les dossiers et projets (état, montants, échéances), les engagements qu'il prend, ses préférences et sa façon de travailler, et les faits durables sur lui.

NE RETIENS PAS :
- Les salutations, le bavardage, les questions de culture générale et leurs réponses.
- Ce qui n'aura plus de sens dans une semaine.
- Une demande de créer une tâche, un chantier, un document ou un rappel. C'est DÉJÀ enregistré ailleurs, en dupliquer le contenu ici est une erreur. N'en tire un souvenir que si la phrase révèle en plus quelque chose de durable sur Raphaël — une préférence, une contrainte, une façon de travailler — et alors retiens cela seulement, pas la demande.
- Un bug ou un problème technique de l'application : il devient un chantier, pas un souvenir.

JARVIS, C'EST TOI. Jarvis (ou Claude) est l'assistant, jamais une personne de l'entourage de Raphaël. Ne crée jamais de souvenir qui le décrive comme quelqu'un qu'il connaît, et ne retiens rien sur le fonctionnement de l'assistant lui-même.

UN SEUL SOUVENIR PAR IDÉE. Ne découpe pas la même information en deux ou trois faits qui se répètent sous des angles différents : garde le plus utile et jette les autres.

MÉFIE-TOI DE LA TRANSCRIPTION. Ces phrases viennent d'une dictée vocale : un nom propre inconnu et improbable est souvent une erreur de reconnaissance. Dans le doute, n'en fais pas un fait.

Chaque fait tient en une phrase courte et se suffit à lui-même. Zéro fait est une réponse normale et fréquente : la plupart des échanges n'ont rien à retenir. N'invente jamais, ne déduis pas au-delà de ce qui a été dit.`

/**
 * Range l'échange : garde le mot-à-mot 7 jours, en extrait les faits durables.
 *
 * Silencieux par construction (choix de Raphaël) : rien n'est annoncé à
 * l'utilisateur, la page « Ce que Jarvis sait de moi » lui sert de contrôle.
 */
export async function memoriser(
  supabase: SupabaseClient,
  userId: string,
  transcript: string,
  reponse: string | null,
  anthropicKey: string,
): Promise<void> {
  try {
    await supabase.from("echanges").insert({ user_id: userId, transcript, reponse })
    // Purge paresseuse : pas de tâche planifiée à maintenir.
    await supabase.rpc("purger_echanges")

    const extraction = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: CONSIGNE_EXTRACTION,
        messages: [
          {
            role: "user",
            content: `Raphaël a dit : « ${transcript} »\n${reponse ? `Jarvis a répondu : « ${reponse} »` : ""}`,
          },
        ],
        tools: [OUTIL_EXTRACTION],
        tool_choice: { type: "tool", name: "extraire_faits" },
      }),
    })

    if (!extraction.ok) return

    const donnees = await extraction.json()
    const outil = donnees.content?.find((b: { type: string }) => b.type === "tool_use")
    const faits: Souvenir[] = outil?.input?.faits ?? []
    if (!faits.length) return

    const aRanger = faits.slice(0, MAX_FAITS_PAR_ECHANGE)
    const lignes = []
    for (const fait of aRanger) {
      if (!fait?.contenu?.trim()) continue
      lignes.push({
        user_id: userId,
        contenu: fait.contenu.trim(),
        categorie: fait.categorie ?? "fait",
        source: transcript.slice(0, 500),
        embedding: JSON.stringify(await empreinte(fait.contenu)),
      })
    }
    if (lignes.length) await supabase.from("souvenirs").insert(lignes)
  } catch {
    // Un échec de mémorisation ne doit jamais remonter à l'utilisateur :
    // sa commande a déjà été exécutée et sa réponse déjà donnée.
  }
}
