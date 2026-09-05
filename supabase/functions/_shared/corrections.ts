/**
 * Les corrections que Raphaël a écrites, portées jusqu'au modèle.
 *
 * POURQUOI CE FICHIER EXISTE (chantier 057fbe10). Le registre des erreurs lui
 * fait écrire « ce qu'il aurait fallu faire » sur chaque erreur de Jarvis.
 * Jusqu'ici ces corrections servaient aux SESSIONS Claude Code — elles
 * remontent dans le bloc injecté au démarrage — mais pas à Jarvis lui-même.
 * Autrement dit : il refaisait la même erreur le lendemain, alors que la
 * réponse était écrite en base. C'est exactement ce que font déjà les
 * prononciations, dans l'autre sens.
 *
 * DEUX FAMILLES SEULEMENT, et c'est le cœur du tri : « comprehension » (il a
 * compris autre chose) et « action » (il a compris, mais a fait autre chose).
 * Les erreurs « serveur » et « systeme » — un modèle qui refuse, une écriture
 * qui échoue — n'apprennent RIEN au modèle : les lui envoyer ne ferait que
 * gonfler un contexte déjà à ~45 000 caractères par phrase.
 *
 * DANS `_shared/` parce que les DEUX moteurs en ont besoin — voice-command et
 * live-jeton. Même raison que `environnement.ts` : une consigne écrite à deux
 * endroits finit par dire deux choses différentes. Et sans dépendance à Deno,
 * pour que la mise en forme se vérifie sous Node, hors ligne
 * (`scripts/verifier-corrections.ts`).
 */

export interface ErreurCorrigee {
  categorie: string
  titre: string
  contexte?: string | null
  correction?: string | null
  statut?: string | null
}

/** Les seules familles d'erreur dont une correction apprend quelque chose. */
export const CATEGORIES_UTILES = ["comprehension", "action"]

/**
 * Combien de corrections partent au modèle. Dix : chaque phrase envoie déjà
 * ~45 000 caractères, et une correction utile est courte. Au-delà, on
 * n'apprend plus rien de plus, on paie du quota.
 */
export const MAX_CORRECTIONS = 10

/** Une correction longue est un paragraphe : on garde de quoi agir. */
const CORRECTION_MAX = 300
const CONTEXTE_MAX = 160

function propre(texte: string | null | undefined, max: number): string {
  return (texte ?? "").replace(/\s+/g, " ").trim().slice(0, max)
}

/**
 * Retient les corrections exploitables : une famille utile, un texte de
 * correction réellement écrit, et une erreur que Raphaël n'a pas écartée.
 *
 * « ignore » est le seul statut exclu, et c'est voulu : il veut dire qu'il a
 * regardé l'erreur et décidé qu'elle n'en était pas une. La lui renvoyer
 * comme consigne serait prendre le contre-pied de sa décision. Une erreur
 * « corrigé », en revanche, garde toute sa valeur — le correctif est peut-être
 * dans le code d'une session, mais la consigne reste vraie.
 */
export function correctionsUtiles(erreurs: ErreurCorrigee[]): ErreurCorrigee[] {
  return erreurs
    .filter((e) => CATEGORIES_UTILES.includes(e?.categorie))
    .filter((e) => propre(e?.correction, CORRECTION_MAX).length > 0)
    .filter((e) => e?.statut !== "ignore")
    .slice(0, MAX_CORRECTIONS)
}

/**
 * Le bloc à insérer dans la consigne, ou "" — jamais un titre suivi de rien.
 * Un bloc vide coûterait des jetons à chaque phrase pour ne rien dire, et
 * apprendrait au modèle qu'on lui envoie des sections vides.
 */
export function formaterCorrections(erreurs: ErreurCorrigee[]): string {
  const retenues = correctionsUtiles(erreurs ?? [])
  if (!retenues.length) return ""

  const lignes = retenues.map((e) => {
    const contexte = propre(e.contexte, CONTEXTE_MAX)
    return (
      `- ${propre(e.titre, 200)}${contexte ? ` (ce qui se passait : ${contexte})` : ""}` +
      `\n  → ${propre(e.correction, CORRECTION_MAX)}`
    )
  })

  return (
    `\nCE QUE RAPHAËL T'A DÉJÀ REPRIS. Ce sont ses mots, sur des cas où tu t'es trompé — ` +
    `applique-les sans qu'il ait à te les redire, et sans jamais les commenter à voix haute :\n` +
    `${lignes.join("\n")}`
  )
}

import { signalerPanne } from "./pannes.ts"

/** Le client Supabase, réduit à ce qu'on utilise ici : pas d'import Deno. */
interface ClientLecture {
  from: (table: string) => {
    select: (colonnes: string) => {
      in: (colonne: string, valeurs: string[]) => {
        not: (colonne: string, operateur: string, valeur: null) => {
          order: (colonne: string, options: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown; error: unknown }>
          }
        }
      }
    }
  }
}

/**
 * Va chercher les corrections en base et rend le bloc prêt à insérer.
 *
 * Ne lève jamais et ne bloque jamais : une erreur ici priverait Jarvis de ses
 * corrections, elle ne doit pas le priver de sa réponse.
 */
export async function rappelerCorrections(
  supabase: ClientLecture & Parameters<typeof signalerPanne>[0],
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("jarvis_erreurs")
      .select("categorie, titre, contexte, correction, statut")
      .in("categorie", CATEGORIES_UTILES)
      .not("correction", "is", null)
      .order("last_seen", { ascending: false })
      .limit(MAX_CORRECTIONS * 2)
    if (error) {
      // Même famille que le rappel des souvenirs : sans ce signalement, une
      // lecture cassée se lirait comme « Raphaël ne m'a jamais rien repris »,
      // et il se ferait reprendre deux fois sur la même chose sans comprendre.
      await signalerPanne(supabase, "Jarvis n'a pas pu relire les corrections de Raphaël", error)
      return ""
    }
    if (!Array.isArray(data)) return ""
    return formaterCorrections(data as ErreurCorrigee[])
  } catch (err) {
    await signalerPanne(supabase, "Jarvis n'a pas pu relire les corrections de Raphaël", err)
    return ""
  }
}
