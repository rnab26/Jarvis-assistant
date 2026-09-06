// Le moteur Gemini, une implémentation de `Fournisseur` parmi d'autres.
//
// POURQUOI GEMINI : décision de Raphaël, 3 sept. 2026. Jarvis tournait sur
// Claude via l'API Anthropic, facturée au jeton ; il l'a découvert en voyant
// sa clé à sec, sans avoir jamais choisi de payer ça. L'offre gratuite de
// l'API Gemini coûte 0. Le compromis, qu'il a accepté en connaissance de
// cause : Google se réserve d'utiliser les contenus soumis à l'offre
// gratuite pour améliorer ses produits, relecture humaine comprise.
//
// Ce module isole tout ce qui est propre à l'API Gemini — forme de la
// requête, forme de la réponse, lecture du quota, noms de modèles. La
// décision de réessayer ou de changer de modèle, elle, est commune et vit
// dans `modele.ts` : deux moteurs qui la prendraient chacun de leur côté
// finiraient par ne plus se comporter pareil.
//
// Ce qui est VÉRIFIÉ dans la référence REST officielle (ai.google.dev/api) :
// l'URL, le champ systemInstruction, tools[].functionDeclarations,
// toolConfig.functionCallingConfig {mode: "ANY", allowedFunctionNames},
// generationConfig, la réponse candidates[0].content.parts[].functionCall
// {name, args} et usageMetadata.

import {
  type AppelResolu,
  type Fournisseur,
  type ReponseFournisseur,
  type Role,
  listeDepuisSecret,
} from "./modele.ts"

const HOTE = "https://generativelanguage.googleapis.com/v1beta"

/**
 * Le modèle de la COMMANDE VOCALE.
 *
 * gemini-3.5-flash-lite a tenu ce rôle jusqu'au 4 sept. 2026, où il a commencé
 * à répondre 503 « This model is currently experiencing high demand » en
 * continu, sur les DEUX clés du projet — donc Jarvis muet chez Raphaël.
 * gemini-3.1-flash-lite est de la même famille (Lite = ~640 ms, la latence ne
 * s'entend pas) et répond, mesuré le jour même par un appel réel sur les deux
 * clés.
 *
 * Mesures du 3 sept. 2026, sur la vraie API :
 * - gemini-3.8-flash est plafonné à 20 requêtes PAR JOUR et renvoie 429 dès le
 *   premier appel : le nommer en tête laissait Jarvis muet.
 * - gemini-3.5-flash répond en ~3 s : la latence s'entend, et Raphaël la
 *   signale déjà comme une gêne.
 *
 * Pas d'alias « latest » en tête, justement : un changement de modèle doit
 * être un choix, pas une surprise un matin.
 */
const COMMANDE_PAR_DEFAUT = "gemini-3.1-flash-lite"

/**
 * Essayés dans l'ordre si la minute du premier est saturée : le quota gratuit
 * est compté PAR MODÈLE, donc basculer rend la main tout de suite là où
 * attendre coûte plusieurs secondes.
 *
 * Des seaux RÉELLEMENT distincts, ce qui n'était pas le cas avant :
 * « gemini-flash-lite-latest » est un ALIAS de gemini-3.5-flash-lite, donc le
 * même compteur — le premier secours ne servait à rien. Et
 * gemini-3.1-flash-lite était en même temps le modèle de la mémoire, qui
 * vidait le seau de son côté. Le 3 sept. les 500 requêtes du jour sont
 * parties, et Jarvis est resté muet.
 *
 * PIÈGE VÉRIFIÉ LE 4 SEPT. 2026 : la liste rendue par ListModels n'est PAS une
 * autorisation. Les deux clés annoncent gemini-2.5-flash et
 * gemini-2.5-flash-lite, et generateContent les refuse toutes les deux en 404
 * « no longer available to new users ». Un secours écrit d'après la liste, ou
 * de mémoire, ne se voit donc qu'en production. Les modèles ci-dessous ont été
 * essayés pour de vrai, avec chaque clé, avant d'être écrits ici.
 *
 * LIMITE CONNUE, MESURÉE LE 4 SEPT. (chantier 0edec0c4) : ces deux secours
 * sont plafonnés à 20 requêtes PAR JOUR chacun
 * (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Le filet vaut donc
 * 40 phrases, après quoi il n'existe plus. D'où le secret GEMINI_SECOURS : de
 * meilleurs secours se posent sans redéployer, dès qu'ils sont mesurés.
 */
const COMMANDE_SECOURS = ["gemini-3.5-flash", "gemini-3.6-flash"]

/**
 * Le modèle de la MÉMOIRE. Il ne partage JAMAIS un seau avec la commande.
 *
 * gemini-2.5-flash-lite est mort le 4 sept. 2026 : 404 « no longer available
 * to new users ». Son remplaçant gemini-3.7-flash s'est révélé pire le même
 * jour — plafonné à 20 requêtes par jour, donc une mémoire morte en silence
 * après vingt phrases. gemini-3.5-flash-lite répond (essayé pour de vrai avec
 * la clé de test) et n'est plus le modèle de la commande, qui est passée à
 * gemini-3.1-flash-lite.
 */
const MEMOIRE_PAR_DEFAUT = "gemini-3.5-flash-lite"
const MEMOIRE_SECOURS = ["gemini-3.7-flash"]

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

/** Extrait le quotaId et la limite du corps d'un 429. Silencieux : un format
 * inattendu ne doit pas faire échouer davantage un appel déjà en échec. */
function lireQuota(texte: string): { id?: string; limite?: string } | undefined {
  try {
    const violation = JSON.parse(texte)?.error?.details
      ?.find((d: { violations?: unknown[] }) => Array.isArray(d.violations))
      ?.violations?.[0]
    if (!violation) return undefined
    return { id: violation.quotaId, limite: violation.quotaValue }
  } catch {
    return undefined
  }
}

export const gemini: Fournisseur = {
  nom: "gemini",
  gratuit: true,
  secretCle: "GEMINI_API_KEY",
  secretCleEssai: "GEMINI_API_KEY_TEST",

  modeles(role: Role) {
    // Réglables par secret, sans redéployer : les quotas de l'offre gratuite
    // ne sont publiés nulle part (visibles seulement dans AI Studio), ils
    // diffèrent par modèle, et un modèle meurt sans prévenir. Devoir
    // redéployer pour changer un nom, c'est laisser Jarvis muet en attendant.
    if (role === "memoire") {
      return {
        modele: Deno.env.get("GEMINI_MODELE_MEMOIRE") || MEMOIRE_PAR_DEFAUT,
        secours: listeDepuisSecret("GEMINI_SECOURS_MEMOIRE", MEMOIRE_SECOURS),
      }
    }
    return {
      modele: Deno.env.get("GEMINI_MODELE") || COMMANDE_PAR_DEFAUT,
      secours: listeDepuisSecret("GEMINI_SECOURS", COMMANDE_SECOURS),
    }
  },

  async unEssai(appel: AppelResolu): Promise<ReponseFournisseur> {
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
        // la variété : les contrôles de verifier-commande-vocale.mjs doivent
        // donner le même résultat d'une fois sur l'autre.
        temperature: 0,
      },
    }

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
      const entete = Number(reponse.headers.get("retry-after"))
      return {
        echec: {
          statut: reponse.status,
          texte,
          quota: reponse.status === 429 ? lireQuota(texte) : undefined,
          attendreMs: Number.isFinite(entete) && entete > 0 ? entete * 1000 : undefined,
        },
      }
    } catch (err) {
      // Coupure réseau : passagère par nature. `modele.ts` classe le 0 comme
      // tel et rejouera.
      return { echec: { statut: 0, texte: String(err) } }
    }
  },
}
