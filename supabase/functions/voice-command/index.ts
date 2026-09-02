import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const VOICE_ACTION_TOOL = {
  name: "resolve_voice_command",
  description:
    "Résout une commande vocale en français en une action structurée sur les tâches de l'utilisateur.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["list_tasks", "add_task", "update_task", "delete_task", "clarify", "unknown"],
        description:
          "list_tasks: lister/consulter des tâches. add_task: en créer une. update_task: modifier une tâche existante identifiée par task_id (ex: la marquer faite). delete_task: supprimer une tâche identifiée par task_id. clarify: la commande est ambiguë (plusieurs tâches possibles, ou infos manquantes) — poser une question via `message`. unknown: hors-sujet ou incompréhensible.",
      },
      title: { type: "string", description: "Titre de la tâche (add_task)." },
      category_id: {
        type: ["string", "null"],
        description: "id de catégorie existant correspondant le mieux, ou null si aucune/pas de correspondance claire.",
      },
      due_date: {
        type: ["string", "null"],
        description: "Échéance au format YYYY-MM-DD, déduite si l'utilisateur dit 'demain', 'vendredi', etc. null si non précisée.",
      },
      task_id: {
        type: "string",
        description: "id de la tâche existante ciblée (update_task, delete_task), résolu depuis la liste de tâches fournie.",
      },
      changes: {
        type: "object",
        description: "Champs à modifier pour update_task, ex: { \"status\": \"done\" } ou { \"title\": \"nouveau titre\" }.",
      },
      filter_category_id: { type: "string", description: "Filtre catégorie pour list_tasks." },
      filter_status: { type: "string", enum: ["todo", "done"], description: "Filtre statut pour list_tasks." },
      message: {
        type: "string",
        description: "Phrase à dire à l'utilisateur : question de clarification (clarify) ou réponse (unknown).",
      },
    },
    required: ["action"],
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { transcript, categories, tasks, todayISO } = await req.json()

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript manquant." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée côté serveur." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const systemPrompt = `Tu es l'assistant vocal d'un dashboard de tâches personnelles nommé Jarvis.
Date du jour : ${todayISO}.
Catégories existantes : ${JSON.stringify(categories)}.
Tâches existantes de l'utilisateur : ${JSON.stringify(tasks)}.
Traduis la commande vocale de l'utilisateur en un appel à l'outil resolve_voice_command.
Pour update_task/delete_task, résous task_id en cherchant la tâche correspondante dans la liste fournie (par titre approchant). Si plusieurs tâches correspondent ou qu'aucune ne correspond clairement, utilise action="clarify" avec une question précise.
Réponds toujours en français dans le champ message.`

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: transcript }],
        tools: [VOICE_ACTION_TOOL],
        tool_choice: { type: "tool", name: "resolve_voice_command" },
      }),
    })

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text()
      return new Response(
        JSON.stringify({ error: `Erreur API Claude: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const anthropicData = await anthropicResponse.json()
    const toolUse = anthropicData.content?.find(
      (block: { type: string }) => block.type === "tool_use",
    )

    if (!toolUse) {
      return new Response(
        JSON.stringify({ action: { action: "unknown", message: "Je n'ai pas compris." } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    return new Response(JSON.stringify({ action: toolUse.input }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
