// Le moteur Anthropic (API Messages), le second fournisseur derrière la même
// interface que Gemini.
//
// À QUOI IL SERT, ET CE QU'IL NE FAIT PAS TOUT SEUL. Raphaël a QUITTÉ l'API
// Anthropic le 3 sept. 2026 : elle est facturée au jeton, et il l'a découvert
// en voyant sa clé à sec sans avoir jamais choisi de payer ça. Ce fichier ne
// revient pas sur cette décision — il existe pour qu'un moteur de secours
// EXISTE le jour où Gemini le laisse tomber, ce qui est déjà arrivé trois fois
// en une journée le 4 sept.
//
// Trois verrous, et il faut les trois :
//   1. `gratuit: false`. Rien dans `modele.ts` ne bascule tout seul vers un
//      moteur payant — ni un secours, ni la promotion automatique du chantier
//      66a7a233. Il faut que Raphaël pose FOURNISSEUR=anthropic lui-même.
//   2. Sans le secret ANTHROPIC_API_KEY, ce fournisseur refuse de démarrer et
//      le dit en nommant le secret manquant. Il ne se rabat jamais en silence.
//   3. Chaque appel écrit « moteur payant » dans les journaux de la fonction
//      (dans `modele.ts`), pour que ça se voie dès la première phrase et pas
//      à la fin du mois.
//
// POURQUOI DU `fetch` ET PAS LE SDK `@anthropic-ai/sdk` : la décision de
// réessayer et de changer de modèle est commune aux deux moteurs et vit dans
// `modele.ts` ; le SDK rejouerait de son côté, donc deux boucles de reprise
// superposées, et le budget de 25 s de l'app y passerait. On a aussi besoin du
// statut HTTP brut, que la boucle commune classe. C'est la forme demandée par
// le chantier 2c54c62f, « sur le modèle de gemini.ts ».
//
// Ce qui est VÉRIFIÉ dans la référence officielle et non déduit : l'URL, les
// en-têtes `x-api-key` et `anthropic-version: 2023-06-01`, la forme
// tools[].{name, description, input_schema} — identique à ce que notre code
// déclare déjà —, `tool_choice: {type: "tool", name}`, la réponse
// content[].{type: "tool_use", name, input}, `usage.{input_tokens,
// output_tokens, cache_read_input_tokens}`, le 429 avec en-tête `retry-after`
// en secondes et le 529 `overloaded_error`.

import {
  type AppelResolu,
  type Fournisseur,
  type ReponseFournisseur,
  type Role,
  listeDepuisSecret,
} from "./modele.ts"

const HOTE = "https://api.anthropic.com/v1/messages"
const VERSION = "2023-06-01"

/**
 * Haiku 4.5 pour la commande vocale : c'est le moins cher du catalogue et le
 * plus rapide, et le travail demandé — choisir la bonne action parmi trente et
 * remplir son schéma — ne demande pas davantage. C'était déjà l'option la
 * moins chère écartée le 3 sept. au profit du gratuit ; si on repasse au
 * payant un jour, c'est par là qu'on commence, pas par un modèle de pointe.
 *
 * Pas de secours par défaut : chez Anthropic un modèle indisponible est une
 * panne de service, pas un seau vide, et le suivant serait dans le même état.
 * Rejouer le même modèle (ce que fait `modele.ts` sur un 429 ou un 529) est la
 * bonne réponse ici.
 */
const COMMANDE_PAR_DEFAUT = "claude-haiku-4-5"
const MEMOIRE_PAR_DEFAUT = "claude-haiku-4-5"

export const anthropic: Fournisseur = {
  nom: "anthropic",
  gratuit: false,
  secretCle: "ANTHROPIC_API_KEY",
  secretCleEssai: "ANTHROPIC_API_KEY_TEST",

  modeles(role: Role) {
    if (role === "memoire") {
      return {
        modele: Deno.env.get("ANTHROPIC_MODELE_MEMOIRE") || MEMOIRE_PAR_DEFAUT,
        secours: listeDepuisSecret("ANTHROPIC_SECOURS_MEMOIRE", []),
      }
    }
    return {
      modele: Deno.env.get("ANTHROPIC_MODELE") || COMMANDE_PAR_DEFAUT,
      secours: listeDepuisSecret("ANTHROPIC_SECOURS", []),
    }
  },

  async unEssai(appel: AppelResolu): Promise<ReponseFournisseur> {
    // Le schéma d'outil de Jarvis est DÉJÀ écrit au format Anthropic (c'est de
    // là qu'il vient, et `pourGemini()` le traduit dans l'autre sens) : il part
    // donc tel quel, sans conversion et sans risque d'en perdre un morceau.
    const corps = {
      model: appel.modele,
      max_tokens: appel.maxTokens,
      system: appel.systeme,
      messages: [{ role: "user", content: appel.texte }],
      tools: [
        {
          name: appel.outil.name,
          description: appel.outil.description,
          input_schema: appel.outil.input_schema,
        },
      ],
      // Sa réponse EST l'appel d'outil : on ne veut pas d'une phrase à côté.
      tool_choice: { type: "tool", name: appel.outil.name },
      // Même raison que côté Gemini : de la constance, pas de la variété.
      temperature: 0,
    }

    try {
      const reponse = await fetch(HOTE, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": appel.cle,
          "anthropic-version": VERSION,
        },
        body: JSON.stringify(corps),
      })

      if (reponse.ok) {
        const donnees = await reponse.json()
        const blocs: Array<{ type?: string; name?: string; input?: Record<string, unknown> }> =
          donnees.content ?? []
        const appelOutil = blocs.find((b) => b.type === "tool_use")
        const u = donnees.usage ?? {}
        return {
          args: appelOutil?.input,
          consommation: {
            entree: u.input_tokens,
            cache_lu: u.cache_read_input_tokens,
            sortie: u.output_tokens,
          },
        }
      }

      const texte = await reponse.text()
      const entete = Number(reponse.headers.get("retry-after"))
      return {
        echec: {
          statut: reponse.status,
          texte,
          // Anthropic ne publie pas le seau touché dans le corps du 429 comme
          // le fait Google : on rapporte le type d'erreur, qui est ce qu'on a.
          quota: reponse.status === 429 ? { id: typeErreur(texte) } : undefined,
          attendreMs: Number.isFinite(entete) && entete > 0 ? entete * 1000 : undefined,
        },
      }
    } catch (err) {
      return { echec: { statut: 0, texte: String(err) } }
    }
  },
}

/** `{"type":"error","error":{"type":"rate_limit_error",…}}` → « rate_limit_error ». */
function typeErreur(texte: string): string | undefined {
  try {
    return JSON.parse(texte)?.error?.type
  } catch {
    return undefined
  }
}
