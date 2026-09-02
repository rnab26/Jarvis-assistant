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
    "Résout une commande vocale en français en une action structurée. Deux domaines distincts : les tâches perso/clients (avec catégories) et les chantiers de développement de Jarvis lui-même (cockpit, avec statut à 3 valeurs + priorité, pas de catégories).",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: [
          "list_tasks",
          "add_task",
          "update_task",
          "delete_task",
          "list_dev_items",
          "add_dev_item",
          "update_dev_item",
          "delete_dev_item",
          "archive_dev_item",
          "clarify",
          "unknown",
        ],
        description:
          "Tâches perso/clients : list_tasks, add_task, update_task (task_id + changes), delete_task (task_id). Chantiers de dev Jarvis (cockpit) : list_dev_items, add_dev_item, update_dev_item (item_id + changes), delete_dev_item (item_id), archive_dev_item (item_id) — marque le chantier comme fait et l'archive, utilisé quand l'utilisateur dit qu'un chantier est terminé/traité et veut l'archiver — utilisés quand l'utilisateur parle explicitement de 'chantier', de développement de Jarvis, du cockpit, ou d'une fonctionnalité à coder pour l'assistant lui-même. clarify: commande ambiguë (plusieurs éléments possibles, ou infos manquantes) — poser une question via `message`. unknown: hors-sujet ou incompréhensible.",
      },
      title: { type: "string", description: "Titre (add_task ou add_dev_item)." },
      category_id: {
        type: ["string", "null"],
        description: "add_task uniquement : id de catégorie existant correspondant le mieux, ou null si aucune/pas de correspondance claire.",
      },
      due_date: {
        type: ["string", "null"],
        description: "add_task uniquement : échéance au format YYYY-MM-DD, déduite si l'utilisateur dit 'demain', 'vendredi', etc. null si non précisée.",
      },
      priority: {
        type: "string",
        enum: ["low", "normal", "high"],
        description: "add_dev_item uniquement : priorité du chantier, 'normal' par défaut si non précisée.",
      },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "done"],
        description: "add_dev_item uniquement : statut initial du chantier, 'todo' par défaut.",
      },
      task_id: {
        type: "string",
        description: "id de la tâche existante ciblée (update_task, delete_task), résolu depuis la liste de tâches fournie.",
      },
      item_id: {
        type: "string",
        description: "id du chantier existant ciblé (update_dev_item, delete_dev_item, archive_dev_item), résolu depuis la liste de chantiers fournie.",
      },
      changes: {
        type: "object",
        description: "Champs à modifier pour update_task (ex: { \"status\": \"done\" }) ou update_dev_item (ex: { \"status\": \"in_progress\" }, { \"priority\": \"high\" }).",
      },
      filter_category_id: { type: "string", description: "list_tasks uniquement : filtre par catégorie." },
      filter_status: {
        type: "string",
        description: "Filtre par statut. Pour list_tasks : 'todo' ou 'done'. Pour list_dev_items : 'todo', 'in_progress' ou 'done'.",
      },
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

    const { transcript, categories, tasks, devItems, todayISO } = await req.json()

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

    const systemPrompt = `Tu es l'assistant vocal de Jarvis, qui gère deux domaines séparés pour l'utilisateur :
1. Ses tâches personnelles/clients, organisées par catégorie.
2. Le cockpit de développement de Jarvis lui-même (les chantiers/fonctionnalités à coder pour l'assistant) — utilise ce domaine quand l'utilisateur parle explicitement de "chantier", de développer/coder Jarvis, du "cockpit", ou d'une fonctionnalité de l'app elle-même.

Date du jour : ${todayISO}.
Catégories de tâches existantes : ${JSON.stringify(categories)}.
Tâches existantes de l'utilisateur : ${JSON.stringify(tasks)}.
Chantiers de dev Jarvis existants (cockpit) : ${JSON.stringify(devItems)}.

Traduis la commande vocale de l'utilisateur en un appel à l'outil resolve_voice_command.
Pour update_task/delete_task, résous task_id depuis la liste de tâches fournie (par titre approchant). Pour update_dev_item/delete_dev_item, résous item_id depuis la liste de chantiers fournie. Si plusieurs éléments correspondent ou qu'aucun ne correspond clairement, utilise action="clarify" avec une question précise.
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
