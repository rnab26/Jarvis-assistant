// Un seul chemin vers le modèle, pour les deux appels de Jarvis (la commande
// vocale dans index.ts, l'extraction de souvenirs dans memoire.ts).
//
// POURQUOI GEMINI : décision de Raphaël, 3 sept. 2026. Jarvis tournait sur
// Claude via l'API Anthropic, facturée au jeton ; il l'a découvert en voyant
// sa clé à sec, sans avoir jamais choisi de payer ça. L'offre gratuite de
// l'API Gemini coûte 0. Le compromis, qu'il a accepté en connaissance de
// cause : Google se réserve d'utiliser les contenus soumis à l'offre
// gratuite pour améliorer ses produits, relecture humaine comprise.
//
// Ce module isole tout ce qui est propre à l'API Gemini — forme de la
// requête, forme de la réponse, erreurs, nouveaux essais — pour que le reste
// du code ne parle qu'en termes de « quelle consigne, quel outil, quel
// texte ». Changer encore de moteur un jour ne touchera que ce fichier.
//
// Ce qui est VÉRIFIÉ dans la référence REST officielle (ai.google.dev/api) :
// l'URL, le champ systemInstruction, tools[].functionDeclarations,
// toolConfig.functionCallingConfig {mode: "ANY", allowedFunctionNames},
// generationConfig, la réponse candidates[0].content.parts[].functionCall
// {name, args} et usageMetadata. Ce qui est DÉDUIT et à confirmer au premier
// appel réel : la façon d'écrire « peut être nul » dans un schéma (voir
// `pourGemini`).

const HOTE = "https://generativelanguage.googleapis.com/v1beta"

/** Un outil au sens d'Anthropic, tel que le code existant le déclare. */
export interface OutilDeclare {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface AppelModele {
  /** Identifiant du modèle, ex. "gemini-3.8-flash". */
  modele: string
  /** La consigne, stable d'un appel à l'autre. */
  systeme: string
  /** Ce que l'utilisateur a dit. */
  texte: string
  /** L'outil que le modèle DOIT appeler : sa réponse est le contenu de l'appel. */
  outil: OutilDeclare
  maxTokens: number
  cle: string
}

export interface Consommation {
  entree?: number
  cache_lu?: number
  sortie?: number
  /** Jetons de réflexion : les modèles Gemini 3 pensent avant de répondre. */
  reflexion?: number
}

export interface ResultatModele {
  /** Les arguments de l'appel d'outil, tels que le modèle les a renvoyés. */
  args?: Record<string, unknown>
  consommation?: Consommation
  echec?: Echec
}

export interface Echec {
  statut: number
  texte: string
  /** Vrai si un nouvel essai a une chance d'aboutir (surcharge, quota par minute). */
  passager: boolean
}

/**
 * Statuts pour lesquels un nouvel essai a du sens. 429 est le plus fréquent
 * sur l'offre gratuite : limite par minute atteinte, elle se lève seule.
 * Tout le reste (400, 403…) vient de la requête ou de la clé et se
 * reproduirait à l'identique.
 */
const STATUTS_A_REESSAYER = new Set([408, 409, 429, 500, 502, 503, 504])

/** Trois essais au plus, ~15 s dans le pire des cas : l'app abandonne à 25 s. */
const ESSAIS_MAX = 3

/**
 * Adapte un schéma écrit pour Anthropic au sous-ensemble accepté par Gemini.
 *
 * Le code existant écrit `type: ["string", "null"]` pour un champ facultatif.
 * La référence Gemini décrit un objet Schema à `type` unique, avec un champ
 * `nullable`. On convertit donc — et on ne touche à rien d'autre : enum,
 * items, properties, required, description passent tels quels.
 *
 * `as const` côté TypeScript n'existe plus à l'exécution, rien à faire.
 */
export function pourGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(pourGemini)
  if (!schema || typeof schema !== "object") return schema

  const source = schema as Record<string, unknown>
  const cible: Record<string, unknown> = {}
  for (const [cle, valeur] of Object.entries(source)) {
    if (cle === "type" && Array.isArray(valeur)) {
      const types = valeur.filter((t) => t !== "null")
      cible.type = types[0] ?? "string"
      if (types.length !== valeur.length) cible.nullable = true
      continue
    }
    cible[cle] = pourGemini(valeur)
  }
  return cible
}

/**
 * Appelle le modèle en lui imposant l'outil, et renvoie ses arguments.
 *
 * Réessaie sur les pannes passagères avec une attente croissante ; ne
 * réessaie jamais une requête refusée pour de bon.
 */
export async function appelerGemini(appel: AppelModele): Promise<ResultatModele> {
  const corps = {
    systemInstruction: { parts: [{ text: appel.systeme }] },
    contents: [{ role: "user", parts: [{ text: appel.texte }] }],
    tools: [
      {
        functionDeclarations: [
          {
            name: appel.outil.name,
            description: appel.outil.description,
            parameters: pourGemini(appel.outil.input_schema),
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: [appel.outil.name] },
    },
    generationConfig: {
      maxOutputTokens: appel.maxTokens,
      // Choisir la bonne action parmi trente demande de la constance, pas de
      // la variété : les 25 contrôles de verifier-commande-vocale.mjs doivent
      // donner le même résultat d'une fois sur l'autre.
      temperature: 0,
    },
  }

  let dernier: Echec | undefined

  for (let essai = 1; essai <= ESSAIS_MAX; essai++) {
    let attendreMs: number | null = null

    try {
      const reponse = await fetch(`${HOTE}/models/${appel.modele}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": appel.cle },
        body: JSON.stringify(corps),
      })

      if (reponse.ok) {
        const donnees = await reponse.json()
        const parts: Array<{ functionCall?: { name: string; args: Record<string, unknown> } }> =
          donnees.candidates?.[0]?.content?.parts ?? []
        const appelOutil = parts.find((p) => p.functionCall)?.functionCall
        const u = donnees.usageMetadata ?? {}
        return {
          args: appelOutil?.args,
          consommation: {
            entree: u.promptTokenCount,
            cache_lu: u.cachedContentTokenCount,
            sortie: u.candidatesTokenCount,
            reflexion: u.thoughtsTokenCount,
          },
        }
      }

      const texte = await reponse.text()
      const passager = STATUTS_A_REESSAYER.has(reponse.status)
      dernier = { statut: reponse.status, texte, passager }
      if (!passager) break

      const entete = Number(reponse.headers.get("retry-after"))
      attendreMs = Number.isFinite(entete) && entete > 0 ? entete * 1000 : null
    } catch (err) {
      // Coupure réseau : passagère par nature.
      dernier = { statut: 0, texte: String(err), passager: true }
    }

    if (essai === ESSAIS_MAX) break
    const parDefaut = 2 ** (essai - 1) * 1000 + Math.random() * 300
    await new Promise((r) => setTimeout(r, Math.min(attendreMs ?? parDefaut, 5000)))
  }

  return { echec: dernier }
}

/**
 * La phrase que Jarvis dit quand le modèle n'a pas répondu — la cause ET la
 * sortie, jamais du JSON brut à l'écran.
 *
 * Mêmes formulations que src/lib/erreurServeurVocal.ts, qui rattrape côté
 * app ce que le serveur ne peut pas habiller (fonction plantée, réseau coupé,
 * session expirée). Deux chemins, une seule formulation : si tu en changes
 * une, change l'autre.
 */
export function phrasePourEchec(echec: Echec | undefined): string {
  const detail = echec?.texte ?? ""
  if (/RESOURCE_EXHAUSTED|quota/i.test(detail) || echec?.statut === 429) {
    return "J'ai atteint la limite de l'offre gratuite de Gemini pour le moment. Redis-moi ça dans une minute ; si ça se répète toute la journée, c'est le quota du jour qui est épuisé."
  }
  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(detail) || echec?.statut === 403) {
    return "Ma clé Gemini est refusée par le serveur : elle a dû être changée, révoquée, ou l'API n'est pas activée pour elle."
  }
  if (echec?.passager) {
    return "Le modèle est débordé en ce moment. Redis-moi ça dans quelques secondes."
  }
  return "Je n'arrive pas à joindre le modèle en ce moment. Réessaie, et regarde les journaux de voice-command si ça dure."
}
