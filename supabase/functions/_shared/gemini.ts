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
 * Essayés dans l'ordre quand le principal ne répond pas : le quota gratuit est
 * compté PAR MODÈLE, donc basculer rend la main tout de suite là où attendre
 * coûte plusieurs secondes.
 *
 * MESURÉ LE 6 SEPT. 2026 (chantier 0edec0c4), par de vrais appels
 * `generateContent` avec la clé de TEST — pas d'après ListModels, pas de
 * mémoire, pas de documentation. Ce qui a fait changer les deux secours :
 *
 * - gemini-3.5-flash a répondu en 13,8 s, gemini-3.6-flash en 22,2 s.
 *   **L'app abandonne à 25 s.** Un secours qui met 22 s ne sauve donc rien :
 *   au mieux Raphaël attend une demi-minute, au pire il n'a rien. La note du
 *   4 sept. les donnait à ~3 s ; ce n'est plus vrai.
 * - Ils sont en plus plafonnés à 20 requêtes PAR JOUR chacun (mesuré le
 *   4 sept. sur les journaux réels, `GenerateRequestsPerDayPerProjectPerModel
 *   -FreeTier`, limite 20). Le filet valait donc 40 phrases par jour.
 *
 * Les deux remplaçants, et ce qui a été vérifié sur chacun :
 *
 * - gemini-3.1-flash-lite-preview — 41 appels réussis dans la journée sans
 *   AUCUN 429 journalier, 15 requêtes/minute, latence médiane 0,9 à 2,2 s, et
 *   il APPELLE bien l'outil à chaque fois (répondre n'est pas obéir).
 *   **Son seau est distinct du principal, et c'est prouvé** : après avoir
 *   saturé sa minute (4 refus « PerMinute », limite 15), gemini-3.1-flash-lite
 *   a répondu dans la foulée en 932 ms. Sans cette preuve, un « preview » du
 *   même numéro aurait très bien pu partager le compteur, et le secours
 *   n'aurait servi à rien.
 * - gemini-3-flash-preview — dernier recours, plus étroit : 5 requêtes par
 *   MINUTE seulement (mesuré : 1 réussite sur une rafale de 20). Latence
 *   ~1,6 s, aucun plafond journalier rencontré. Il ne tient pas une rafale,
 *   mais il répond dix fois plus vite que ceux qu'il remplace.
 *
 * ÉCARTÉS, et pourquoi, pour qu'on ne les repropose pas :
 * - gemini-omni-1.1-flash : 429 journalier DÈS LE PREMIER APPEL.
 * - gemini-flash-latest : 503 « high demand » au moment de la mesure.
 * - gemini-flash-lite-latest : il répond en 490 ms, mais c'est un ALIAS, et
 *   d'après la mesure du 4 sept. (pas refaite ici) il pointe sur
 *   gemini-3.5-flash-lite, c'est-à-dire le modèle de la MÉMOIRE : même
 *   compteur, donc un secours qui ne secourt rien. Un alias est de toute
 *   façon écarté par principe — il peut changer de cible du jour au
 *   lendemain, et un changement de modèle doit être un choix.
 * - gemini-2.5-flash / gemini-2.5-flash-lite : annoncés par ListModels, et
 *   refusés en 404 par generateContent. La liste n'est PAS une autorisation.
 *
 * Le secret GEMINI_SECOURS remplace cette liste sans redéployer : un modèle
 * meurt sans prévenir, et attendre un déploiement pendant que Jarvis se tait
 * est précisément ce qu'il ne faut pas avoir à faire.
 */
const COMMANDE_SECOURS = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview"]

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

/**
 * SON SECOURS RESTE gemini-3.7-flash, ET CE N'EST PAS UN OUBLI.
 *
 * Il est plafonné à 20 requêtes par jour (mesuré le 4 sept.), ce qui est peu.
 * On a cherché mieux le 6 sept. : il n'y a plus un seul modèle « lite »
 * disponible qui ne soit pas déjà pris. gemini-2.5-flash-lite est mort (404),
 * gemini-3.1-flash-lite est le principal de la COMMANDE et
 * gemini-3.1-flash-lite-preview son premier secours — les prendre ici
 * refabriquerait le partage de seau du 3 sept. —, et
 * gemini-flash-lite-latest est un alias qui, d'après la mesure du 4 sept.,
 * pointe sur le principal de la mémoire — donc le même compteur.
 *
 * Perdre un souvenir coûte infiniment moins cher que rendre Jarvis muet :
 * c'est la commande qui garde les bons seaux. Vérifié le 6 sept. après avoir
 * saturé plusieurs autres modèles : les deux modèles de la mémoire
 * répondaient toujours, en 503 ms et 1 675 ms.
 */
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
        impose: Deno.env.get("GEMINI_MODELE_MEMOIRE") !== undefined,
      }
    }
    return {
      modele: Deno.env.get("GEMINI_MODELE") || COMMANDE_PAR_DEFAUT,
      secours: listeDepuisSecret("GEMINI_SECOURS", COMMANDE_SECOURS),
      // Un secret posé à la main l'emporte sur la veille automatique.
      impose: Deno.env.get("GEMINI_MODELE") !== undefined,
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
