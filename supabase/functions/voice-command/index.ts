import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { memoriser, rappelerSouvenirs } from "./memoire.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/**
 * Champs qu'une action de modification attend dans "changes" — et qui
 * existent AUSSI comme paramètres de premier niveau parce que les actions
 * de création (add_task, add_dev_item, add_contact) les utilisent.
 *
 * C'est précisément ce doublon qui cassait la modification de priorité à
 * l'oral : "monte ce chantier en priorité haute" produisait
 * { action: "update_dev_item", item_id: "...", priority: "high" } — le
 * champ était rempli, mais au premier niveau, donc "changes" restait vide,
 * l'app faisait une mise à jour sans aucun champ, et Jarvis annonçait
 * quand même "mis à jour". Le modèle est maintenant guidé par le schéma,
 * et on replie ici ce qui atterrit au mauvais endroit : une seule source
 * de vérité côté app, "changes".
 */
const CHAMPS_MODIFIABLES: Record<string, string[]> = {
  update_task: ["title", "notes", "status", "category_id", "due_date", "due_time"],
  update_dev_item: ["title", "notes", "status", "priority"],
  update_contact: ["name", "notes"],
}

function normaliserAction(input: Record<string, unknown>): Record<string, unknown> {
  const champs = CHAMPS_MODIFIABLES[String(input.action)]
  if (!champs) return input

  const changes: Record<string, unknown> = {
    ...(typeof input.changes === "object" && input.changes !== null
      ? (input.changes as Record<string, unknown>)
      : {}),
  }
  const normalise = { ...input }
  for (const champ of champs) {
    if (!(champ in normalise)) continue
    // Ce qui est déjà dans "changes" fait foi : c'est la place prévue.
    if (!(champ in changes)) changes[champ] = normalise[champ]
    delete normalise[champ]
  }
  // Les tâches n'ont que deux statuts en base ("todo"/"done") ; les chantiers
  // en ont trois. Le modèle, qui voit un seul champ "status", renvoie parfois
  // "in_progress" sur une tâche : la base refusait la ligne et l'utilisateur
  // n'avait qu'un message d'erreur générique. Une tâche "en cours" reste une
  // tâche à faire.
  if (input.action === "update_task" && changes.status === "in_progress") {
    changes.status = "todo"
  }

  normalise.changes = changes
  return normalise
}

/**
 * Le schéma d'UNE action. Le modèle en renvoie une liste : une phrase dictée
 * contient souvent plusieurs demandes ("ajoute une tâche pour le plombier et
 * rappelle-moi d'appeler Yoni"), et n'en traiter qu'une en perdait l'autre
 * sans le dire.
 */
const ACTION_SCHEMA = {
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
        "list_documents",
        "save_document",
        "configure_widget",
        "list_contacts",
        "add_contact",
        "update_contact",
        "delete_contact",
        "list_place_reminders",
        "add_place_reminder",
        "delete_place_reminder",
        "list_pronunciations",
        "add_pronunciation",
        "delete_pronunciation",
        "chat",
        "clarify",
        "unknown",
      ],
      description:
        "Tâches perso/clients : list_tasks, add_task, update_task (task_id + changes), delete_task (task_id). Chantiers de dev Jarvis (cockpit) : list_dev_items, add_dev_item, update_dev_item (item_id + changes), delete_dev_item (item_id), archive_dev_item (item_id) — marque le chantier comme fait et l'archive, utilisé quand l'utilisateur dit qu'un chantier est terminé/traité et veut l'archiver — utilisés quand l'utilisateur parle explicitement de 'chantier', de développement de Jarvis, du cockpit, ou d'une fonctionnalité à coder pour l'assistant lui-même. Documents : list_documents, save_document (filename + content) — utilisé quand l'utilisateur demande explicitement d'enregistrer/noter/sauvegarder un document ou un texte. configure_widget (max_tasks, urgent_only, category_id) — utilisé quand l'utilisateur parle du widget d'écran d'accueil (ex: 'montre-moi 5 tâches sur le widget', 'affiche que les urgentes sur le widget', 'widget catégorie perso'). Contacts : list_contacts, add_contact (name + notes), update_contact (contact_id + changes), delete_contact (contact_id) — utilisé quand l'utilisateur présente quelqu'un ou donne une consigne à son sujet (ex: 'Dylan c'est le client de Melissa', 'pour Yoni toujours confirmer avant d'envoyer un message'). Rappels de lieu : list_place_reminders, add_place_reminder (place + reminder), delete_place_reminder (reminder_id) — utilisé quand l'utilisateur demande de lui rappeler quelque chose la prochaine fois qu'il parle d'un lieu précis (ex: 'quand je parle du chantier Dan, rappelle-moi de commander les carreaux'). Prononciations : list_pronunciations, add_pronunciation (entendu + veut_dire), delete_pronunciation (pronunciation_id) — utilisé quand l'utilisateur corrige la façon dont la dictée a écrit un mot ou un nom (ex: 'ce n'est pas Avirail, c'est Avihail, le h est muet', 'quand je dis Melissa tu écris Mélissa'). chat: toute question ou discussion qui ne concerne ni les tâches ni le cockpit ni les documents ni le widget ni les contacts ni les rappels de lieu (culture générale, conseil, actualité, calcul, etc.) — répondre directement et utilement via `message`. clarify: commande ambiguë (plusieurs éléments possibles, ou infos manquantes) — poser une question via `message`. unknown: audio incompréhensible/inaudible, pas une question hors-sujet (ça, c'est 'chat').",
    },
    title: {
      type: "string",
      description:
        "Titre court (add_task ou add_dev_item), quelques mots, synthétisé à partir de la phrase dictée par l'utilisateur — jamais la phrase brute complète si elle est longue.",
    },
    name: {
      type: "string",
      description: "add_contact uniquement : nom de la personne.",
    },
    place: {
      type: "string",
      description: "add_place_reminder uniquement : le lieu (ou mot-clé) qui doit déclencher le rappel quand l'utilisateur le mentionne en parlant à Jarvis.",
    },
    reminder: {
      type: "string",
      description: "add_place_reminder uniquement : ce que Jarvis doit rappeler à l'utilisateur, reformulé comme une phrase courte à dire.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "add_task ou add_dev_item : si la phrase dictée par l'utilisateur contient des détails au-delà du simple titre (contexte, raison, précisions), reformule-les ici en note complète. null si le titre résume déjà tout. add_contact : la relation/le contexte et toute consigne donnée par l'utilisateur à son sujet (ex: 'client de Melissa, chantier villa Dan'), reformulés proprement. null si rien de plus que le nom.",
    },
    category_id: {
      type: ["string", "null"],
      description: "add_task : id de catégorie existant correspondant le mieux, ou null si aucune/pas de correspondance claire. configure_widget : id de catégorie pour filtrer le widget, ou null pour toutes les catégories — n'inclure que si l'utilisateur a précisé une catégorie.",
    },
    max_tasks: {
      type: "number",
      description: "configure_widget uniquement : nombre de tâches à afficher sur le widget (1 à 5), n'inclure que si précisé.",
    },
    urgent_only: {
      type: "boolean",
      description: "configure_widget uniquement : true pour n'afficher que les tâches en retard/dues aujourd'hui, n'inclure que si précisé.",
    },
    due_date: {
      type: ["string", "null"],
      description: "add_task uniquement : échéance au format YYYY-MM-DD, déduite si l'utilisateur dit 'demain', 'vendredi', etc. null si non précisée.",
    },
    due_time: {
      type: ["string", "null"],
      description: "add_task uniquement : heure du rappel au format HH:MM (24h), déduite si l'utilisateur dit 'à 14h', 'ce midi', 'à 9h30', etc. null si aucune heure n'est précisée (seule la date compte alors).",
    },
    priority: {
      type: "string",
      enum: ["low", "normal", "high"],
      description: "add_dev_item UNIQUEMENT : priorité du chantier à créer, 'normal' par défaut si non précisée. Pour MODIFIER la priorité d'un chantier existant, ne pas utiliser ce champ : mettre { \"priority\": ... } dans \"changes\" avec action=update_dev_item.",
    },
    status: {
      type: "string",
      enum: ["todo", "in_progress", "done"],
      description: "add_dev_item UNIQUEMENT : statut initial du chantier à créer, 'todo' par défaut. Pour MODIFIER le statut d'un chantier existant, ne pas utiliser ce champ : mettre { \"status\": ... } dans \"changes\" avec action=update_dev_item.",
    },
    task_id: {
      type: "string",
      description: "id de la tâche existante ciblée (update_task, delete_task), résolu depuis la liste de tâches fournie.",
    },
    item_id: {
      type: "string",
      description: "id du chantier existant ciblé (update_dev_item, delete_dev_item, archive_dev_item), résolu depuis la liste de chantiers fournie.",
    },
    contact_id: {
      type: "string",
      description: "id du contact existant ciblé (update_contact, delete_contact), résolu depuis la liste de contacts fournie (par nom approchant).",
    },
    entendu: {
      type: "string",
      description: "add_pronunciation uniquement : le mot tel que la dictée vocale l'a écrit à tort, exactement comme il apparaît dans le transcript.",
    },
    veut_dire: {
      type: "string",
      description: "add_pronunciation uniquement : le mot réellement dit par l'utilisateur, correctement orthographié.",
    },
    pronunciation_id: {
      type: "string",
      description: "id de la prononciation existante ciblée (delete_pronunciation), résolu depuis la liste fournie.",
    },
    reminder_id: {
      type: "string",
      description: "id du rappel de lieu existant ciblé (delete_place_reminder), résolu depuis la liste de rappels de lieu fournie.",
    },
    changes: {
      type: "object",
      description: "OBLIGATOIRE et NON VIDE pour update_task, update_dev_item et update_contact : les champs à modifier, et eux seuls. update_task : title, notes, status ('todo'/'done'), category_id, due_date, due_time. update_dev_item : title, notes, status ('todo'/'in_progress'/'done'), priority ('low'/'normal'/'high'). update_contact : name, notes. Exemples : { \"priority\": \"high\" } pour monter un chantier en priorité, { \"status\": \"in_progress\" } pour le passer en cours.",
      properties: {
        title: { type: "string" },
        notes: { type: ["string", "null"] },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "string", enum: ["low", "normal", "high"] },
        category_id: { type: ["string", "null"] },
        due_date: { type: ["string", "null"] },
        due_time: { type: ["string", "null"] },
        name: { type: "string" },
      },
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
    filename: {
      type: "string",
      description: "save_document uniquement : nom court du document (sans extension, '.txt' est ajouté automatiquement), synthétisé à partir de la demande.",
    },
    content: {
      type: "string",
      description: "save_document uniquement : contenu complet du document, reformulé proprement à partir de ce que l'utilisateur a dicté.",
    },
  },
  required: ["action"],
}

const VOICE_ACTION_TOOL = {
  name: "resolve_voice_command",
  description:
    "Résout une commande vocale en français en une ou plusieurs actions structurées. Sept domaines : les tâches perso/clients (avec catégories), les chantiers de développement de Jarvis lui-même (cockpit, avec statut à 3 valeurs + priorité, pas de catégories), les documents texte enregistrés par l'utilisateur ou dictés à Jarvis, la config du widget d'écran d'accueil, les contacts (qui est qui, et les consignes associées), les rappels liés à un lieu (déclenchés par la conversation), et la discussion généraliste (n'importe quel sujet, comme un assistant conversationnel classique).",
  input_schema: {
    type: "object" as const,
    properties: {
      actions: {
        type: "array",
        description:
          "Les actions à exécuter, dans l'ordre où l'utilisateur les a dites. UNE SEULE dans la plupart des cas. PLUSIEURS quand une même phrase contient plusieurs demandes distinctes : \"ajoute une tâche pour le plombier et marque la facture comme payée\" en donne deux, \"note que Dylan est le client de Melissa et rappelle-moi de l'appeler demain\" aussi. Ne découpe jamais une demande unique en plusieurs actions, et n'invente pas d'action que l'utilisateur n'a pas demandée. Si une demande dépend du résultat d'une autre (modifier une tâche qu'on vient à peine de créer dans la même phrase), n'en fais qu'une seule action et traite le reste dans son contenu. Si l'ensemble est ambigu, renvoie une seule action clarify.",
        items: ACTION_SCHEMA,
        minItems: 1,
      },
    },
    required: ["actions"],
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

    const {
      transcript,
      categories,
      tasks,
      devItems,
      documents,
      contacts,
      placeReminders,
      pronunciations,
      widgetConfig,
      todayISO,
    } = await req.json()

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

    const systemPrompt = `Tu es l'assistant vocal de Jarvis, qui gère sept domaines pour l'utilisateur :
1. Ses tâches personnelles/clients, organisées par catégorie.
2. Le cockpit de développement de Jarvis lui-même (les chantiers/fonctionnalités à coder pour l'assistant) — utilise ce domaine quand l'utilisateur parle explicitement de "chantier", de développer/coder Jarvis, du "cockpit", ou d'une fonctionnalité de l'app elle-même.
3. Ses documents texte — utilise ce domaine quand l'utilisateur demande explicitement d'enregistrer, noter ou sauvegarder un document/texte (ex: "enregistre un document avec...", "note ça dans un fichier...").
4. La config du widget d'écran d'accueil Android (nombre de tâches affichées, urgentes uniquement, filtre catégorie) — utilise ce domaine quand l'utilisateur parle explicitement du widget.
5. Ses contacts : qui est qui, et ce qu'il attend pour chacun — utilise ce domaine quand l'utilisateur présente quelqu'un ou donne une consigne à son sujet (ex: "Dylan c'est le client de Melissa", "retiens que pour Yoni il faut toujours confirmer avant d'envoyer un message").
6. Ses rappels liés à un lieu — utilise ce domaine quand l'utilisateur demande explicitement d'être rappelé de quelque chose la prochaine fois qu'il mentionnera un lieu précis en lui parlant (ex: "quand je parle du chantier Dan, rappelle-moi de commander les carreaux"). Ce n'est PAS de la géolocalisation : le rappel se déclenche uniquement quand l'utilisateur reparle du lieu à voix haute.
7. La discussion généraliste : toute question ou échange qui ne concerne ni les tâches, ni le cockpit, ni les documents, ni le widget, ni les contacts, ni les rappels de lieu — culture générale, conseil, actualité, calcul, définition, etc. Réponds comme le ferait un assistant conversationnel normal (Claude), avec tes connaissances, sans te limiter aux tâches/chantiers.

Date du jour : ${todayISO}.
Catégories de tâches existantes : ${JSON.stringify(categories)}.
Tâches existantes de l'utilisateur : ${JSON.stringify(tasks)}.
Chantiers de dev Jarvis existants (cockpit) : ${JSON.stringify(devItems)}.
Documents existants de l'utilisateur : ${JSON.stringify(documents)}.
Contacts existants de l'utilisateur : ${JSON.stringify(contacts)}.
Rappels de lieu existants de l'utilisateur : ${JSON.stringify(placeReminders)}.
Corrections de transcription déjà apprises : ${JSON.stringify(pronunciations ?? [])}.
Config actuelle du widget : ${JSON.stringify(widgetConfig)}.

AVANT TOUT : la phrase vient d'une dictée vocale. Si un mot du transcript correspond à une correction déjà apprise ci-dessus (champ "entendu"), lis-le comme le mot corrigé ("veut_dire") pour toute la suite du raisonnement — c'est ce que l'utilisateur a réellement dit. N'en parle pas, corrige silencieusement.
Quand l'utilisateur te reprend sur un mot mal transcrit ("ce n'est pas X, c'est Y", "quand je dis Y tu écris X"), enregistre-le avec add_pronunciation : "entendu" est la forme fausse telle qu'elle sort de la dictée, "veut_dire" la bonne. Fais-le en plus de la demande d'origine s'il y en avait une, et n'enregistre rien si la correction porte sur le fond plutôt que sur l'orthographe d'un mot.

Traduis la commande vocale de l'utilisateur en un appel à l'outil resolve_voice_command.
Pour update_task/delete_task, résous task_id depuis la liste de tâches fournie (par titre approchant). Pour update_dev_item/delete_dev_item, résous item_id depuis la liste de chantiers fournie. Pour update_contact/delete_contact, résous contact_id depuis la liste de contacts fournie (par nom approchant). Pour delete_place_reminder, résous reminder_id depuis la liste de rappels de lieu fournie (par lieu approchant). Si plusieurs éléments correspondent ou qu'aucun ne correspond clairement, utilise action="clarify" avec une question précise.
Pour update_task/update_dev_item/update_contact, tout ce qui change va dans "changes", jamais dans les champs de premier niveau : "passe ce chantier en priorité haute" donne changes={"priority":"high"}, "marque-le en cours" donne changes={"status":"in_progress"}. Ne renvoie jamais une action de modification avec un "changes" vide.
Pour add_task/add_dev_item : si l'utilisateur dicte une phrase longue avec des détails (contexte, raison, précisions), ne mets pas toute la phrase dans "title" — synthétise un titre court (quelques mots) et reformule le reste dans "notes". Si la phrase est déjà courte et ne contient rien de plus que le titre, laisse "notes" à null.
Pour add_task : si l'utilisateur précise une heure ("à 14h", "ce midi", "à 9h30 demain"), déduis-la dans "due_time" (HH:MM) en plus de "due_date" — jamais d'heure sans date. Sans heure précisée, laisse "due_time" à null.
Pour save_document : synthétise un nom de fichier court dans "filename", et reformule proprement tout ce que l'utilisateur a dicté comme contenu dans "content".
Pour configure_widget : ne renvoie que les champs (max_tasks, urgent_only, category_id) que l'utilisateur a explicitement mentionnés — laisse les autres absents plutôt que de les redéfinir à une valeur par défaut.
Pour add_contact : si le contact existe déjà dans la liste fournie (même nom ou très proche), utilise update_contact à la place pour ajouter l'information à ses notes existantes plutôt que de créer un doublon.
Pour add_place_reminder : "place" doit être un mot-clé court et probable à être redit tel quel (nom de lieu, de chantier, de client) — pas une phrase entière. "reminder" est la phrase que Jarvis doit dire, reformulée proprement.
Une seule phrase peut contenir PLUSIEURS demandes ("ajoute une tâche pour le plombier et marque la facture comme payée") : renvoie alors autant d'actions que de demandes, dans l'ordre où elles ont été dites. N'en invente aucune, et ne découpe pas une demande unique.
Reprendre quelque chose d'existant : la liste fournie contient AUSSI les tâches déjà faites (status "done") et les chantiers terminés. Si l'utilisateur veut revenir sur une tâche déjà faite ("remets la tâche du plombier à faire", "finalement je dois refaire les carreaux", "rouvre celle que j'ai terminée hier"), n'en crée pas une nouvelle : utilise update_task sur la tâche existante avec changes={"status":"todo"} plus ce qu'il change d'autre. Une tâche n'a que deux statuts, "todo" et "done" — "en cours" pour une tâche vaut "todo".
Pour retrouver la bonne tâche ou le bon chantier, appuie-toi sur les notes autant que sur le titre : l'utilisateur redit souvent un détail de la note plutôt que le titre exact. À égalité de correspondance, préfère ce qui est encore à faire, sauf si l'utilisateur parle explicitement de quelque chose de terminé ou d'archivé.
Pour chat : réponds directement et utilement dans "message", de façon concise (c'est lu à voix haute) — ne renvoie jamais "unknown" juste parce que la question sort des tâches/chantiers/documents/contacts/rappels, "unknown" est réservé à l'audio vraiment incompréhensible.
Réponds toujours en français dans le champ message.${await rappelerSouvenirs(supabase, transcript)}`

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

    // Le modèle renvoie une liste. On tolère l'ancienne forme (une action à
    // plat) pour ne rien casser si le schéma n'est pas suivi.
    const brutes: Record<string, unknown>[] = Array.isArray(toolUse?.input?.actions)
      ? toolUse.input.actions
      : toolUse?.input?.action
        ? [toolUse.input]
        : []
    const actions = brutes
      .filter((a) => a && typeof a.action === "string")
      .map((a) => normaliserAction(a))

    if (actions.length === 0) {
      return new Response(
        JSON.stringify({
          action: { action: "unknown", message: "Je n'ai pas compris." },
          actions: [{ action: "unknown", message: "Je n'ai pas compris." }],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Mémorisation silencieuse, après coup : la réponse part sans l'attendre.
    // waitUntil garde la fonction en vie le temps de finir, sans retarder
    // l'utilisateur — sans lui, l'Edge Function s'arrête dès la réponse rendue.
    const rangement = memoriser(
      supabase,
      user.id,
      transcript,
      (actions.find((a) => typeof a.message === "string")?.message as string) ?? null,
      anthropicKey,
    )
    const runtime = globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }
    if (runtime.EdgeRuntime?.waitUntil) runtime.EdgeRuntime.waitUntil(rangement)
    else await rangement

    // "action" reste renseignée : l'app Android installée sur le téléphone
    // n'est pas mise à jour au même rythme que le web, et elle ne lit que ce
    // champ. Elle continue donc de traiter la première demande.
    return new Response(JSON.stringify({ action: actions[0], actions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
