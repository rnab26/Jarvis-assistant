/**
 * Le serveur ne RANGE PAS une tâche dans une catégorie que l'utilisateur n'a
 * pas prononcée (chantier e945ae83, 28 sept. 2026).
 *
 * MESURÉ sur la fonction DÉPLOYÉE (v127), avec la phrase réelle du 15 sept. à
 * 17:32:57 — « non mets-le dans la catégor », coupée par la reconnaissance
 * vocale, tâche en attente « Rappeler Dan Marciano », `categorie_a_valider` :
 *
 *     corps complet (ce que l'app envoie)   → 3 échecs sur 6
 *     corps minimal (tâches + catégories)   → 0 échec sur 6
 *
 * Même fonction, même consigne, même phrase : ce n'est donc pas la consigne,
 * c'est le CONTEXTE qui l'entoure. Et la consigne ne peut pas y répondre — elle
 * porte déjà « INTERDIT : poser un category_id sur cette tâche tant qu'il n'a
 * pas PRONONCÉ le nom d'une catégorie », en toutes lettres, et trois versions
 * renforcées avaient déjà échoué le 15 sept. (chantier 902bf94b). C'est du
 * code, comme `recuTransmis.ts` pour le find_receipts de trop.
 *
 * Deux modes d'échec observés, la même faute — il AGIT au lieu de DEMANDER :
 *   {"task_id":"t-plombier","changes":{"category_id":"cat-perso"}}
 *   {"task_id":"t-rappel-dan-marciano","changes":{"category_id":"cat-leads"}}
 *
 * Pur, sans dépendance Deno : vérifié par `scripts/verifier-categorie-inventee.ts`.
 */

/** Une catégorie telle que l'app les envoie. */
export interface CategorieConnue {
  id?: unknown
  name?: unknown
}

/**
 * La phrase dite EXACTEMENT comme l'appareil la compare : sans accents, en
 * minuscules, et découpée sur tout ce qui n'est pas une lettre ou un chiffre.
 */
function mots(texte: string): string[] {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * Combien de caractères d'un nom de catégorie suffisent à le reconnaître.
 *
 * Il ne dit pas le nom exact : la consigne elle-même donne « dans
 * l'administratif » pour « Admin » et « dans les leads » pour « Leads ». Un
 * nom de catégorie est donc reconnu par son DÉBUT.
 */
const DEBUT_SUFFISANT = 4

/**
 * A-t-il prononcé le nom d'une de SES catégories ?
 *
 * GÉNÉREUX EXPRÈS, et c'est toute la sûreté de ce garde-fou. L'asymétrie est
 * la même que pour `secondeDemande.ts` : croire à tort qu'il a nommé une
 * catégorie ne change RIEN (on laisse passer ce que le modèle a décidé, c'est
 * l'état d'avant ce correctif) ; croire à tort qu'il n'en a nommé aucune
 * effacerait un rangement JUSTE et lui poserait une question inutile. Dans le
 * doute, on se tait.
 */
export function nommeUneCategorie(transcript: string, categories: unknown): boolean {
  const liste = Array.isArray(categories) ? (categories as CategorieConnue[]) : []
  const dits = mots(String(transcript ?? ""))
  if (dits.length === 0) return false

  for (const c of liste) {
    const nom = mots(String(c?.name ?? ""))
    if (nom.length === 0) continue
    // Chaque MOT du nom compte : « Site de Mélissa » se reconnaît sur
    // « Mélissa » seul, comme il le dit.
    for (const morceau of nom) {
      if (morceau.length < 3) continue
      const debut = morceau.slice(0, Math.min(DEBUT_SUFFISANT, morceau.length))
      // TROIS LETTRES AU MINIMUM DE SON CÔTÉ, et c'est un vrai piège, trouvé en
      // essayant le contrôle : « mets-LE » donne le mot « le », qui est un début
      // de « LEads ». Le garde-fou ne se déclenchait donc JAMAIS sur la phrase
      // même qui l'a motivé. Un mot de deux lettres ne nomme rien.
      if (dits.some((d) => d.length >= 3 && (d.startsWith(debut) || morceau.startsWith(d)))) {
        return true
      }
    }
  }
  return false
}

/** Ce que l'app envoie sur la tâche qui attend une réponse. */
function attendSaCategorie(attente: unknown): string | null {
  if (!attente || typeof attente !== "object") return null
  const a = attente as { titre?: unknown; categorie_a_valider?: unknown }
  if (a.categorie_a_valider !== true) return null
  const titre = typeof a.titre === "string" ? a.titre.trim() : ""
  return titre ? titre : null
}

/**
 * La question posée à la place, MOT POUR MOT celle que l'appareil dit déjà
 * pour le verdict `illisible` (`src/lib/commandeLocale.ts`).
 *
 * Deux formulations pour la même situation lui donneraient l'impression de
 * parler à deux assistants. `verifier-categorie-inventee.ts` refuse qu'elles
 * divergent.
 */
export function questionCategorie(titre: string, categories: unknown): string {
  const liste = Array.isArray(categories) ? (categories as CategorieConnue[]) : []
  const noms = liste.map((c) => String(c?.name ?? "")).filter(Boolean).join(", ")
  return noms
    ? `Dans quelle catégorie je range "${titre}" ? (${noms})`
    : `Dans quelle catégorie je range "${titre}" ?`
}

/**
 * Retire le rangement que le modèle a inventé, et redemande à la place.
 *
 * À appeler APRÈS `normaliserAction` : le schéma accepte `category_id` au
 * premier niveau ET dans `changes`, et c'est elle qui replie les deux en un
 * seul endroit. Avant elle, il faudrait traiter les deux formes — donc en
 * oublier une un jour.
 */
export function sansCategorieInventee<T extends Record<string, unknown>>(
  actions: T[],
  contexte: { transcript?: unknown; categories?: unknown; tacheEnAttente?: unknown },
): T[] {
  const titre = attendSaCategorie(contexte.tacheEnAttente)
  // Aucune tâche n'attend sa catégorie : ce garde-fou n'a rien à voir ici, et
  // un rangement demandé en clair ne doit jamais être touché.
  if (!titre) return actions
  if (nommeUneCategorie(String(contexte.transcript ?? ""), contexte.categories)) return actions

  let touchee = false
  const sorties = actions.map((a) => {
    if (a.action !== "update_task") return a
    const changes = a.changes
    if (!changes || typeof changes !== "object") return a
    const reste = { ...(changes as Record<string, unknown>) }
    if (reste.category_id === undefined || reste.category_id === null) return a
    delete reste.category_id
    touchee = true
    // Il reste autre chose à modifier (une date qu'il vient de dire) : on garde
    // la modification, sans le rangement. Sinon l'action entière n'a plus
    // d'objet et devient la question.
    return Object.keys(reste).length > 0 ? { ...a, changes: reste } : null
  }).filter((a): a is T => a !== null)

  if (!touchee) return actions

  // La question passe DEVANT : c'est elle qu'il doit entendre, et une
  // modification muette derrière ne se remarquerait pas.
  const question = { action: "clarify", message: questionCategorie(titre, contexte.categories) } as unknown as T
  return [question, ...sorties]
}
