// Relatif avec extension : vérifiable sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { normaliserRecherche } from "./sections.ts"

/**
 * Cette tâche perso n'en est pas une : c'est un chantier de développement
 * atterri dans la mauvaise liste.
 *
 * CE QUI EST MESURÉ, dans sa base le 5 sept. 2026 (28 tâches ouvertes) :
 * quatre de ses tâches sont des chantiers, et l'une d'elles — « connexion
 * entre mon Jarvis et celui de Mélissa » — n'existait NULLE PART ailleurs.
 * Sa demande dormait dans sa liste de courses depuis sa dictée, invisible de
 * toutes les sessions.
 *
 * D'OÙ ÇA VIENT : la commande vocale a compris « ajoute une tâche » là où il
 * disait « ajoute un chantier », et le « C » de « Créer » restait collé au
 * titre (« R un chantier… »). La cause est corrigée ailleurs ; ce module
 * s'occupe de ce qui est DÉJÀ dans la liste, et de ce qui y retombera.
 *
 * Pur, local, aucun appel au modèle : ranger une ligne n'a pas à consommer le
 * quota gratuit. Même famille que `suggestionTheme.ts`.
 *
 * IL SE TAIT PLUTÔT QUE DE SE TROMPER. « Appeler le chantier de la villa Dan »
 * est une vraie tâche : le mot « chantier » y désigne un chantier de
 * maçonnerie, pas un chantier de développement. Seules les tournures qui
 * ANNONCENT une demande faite à Claude sont retenues.
 */

/** Ce qui a fait prendre cette tâche pour un chantier — affiché tel quel,
 * pour qu'il juge sans avoir à me croire sur parole. */
export interface IndiceChantier {
  /** Le morceau de phrase qui a déclenché la reconnaissance. */
  indice: string
  /** Le titre proposé pour le chantier, débarrassé de l'amorce. */
  titre: string
}

/**
 * Les amorces qui annoncent une demande adressée aux sessions, et non une
 * chose à faire soi-même. Chacune vient d'une ligne réelle de sa base ou de
 * sa façon de dicter, relevée le 5 sept. — pas devinée.
 */
const AMORCES: { motif: RegExp; indice: string }[] = [
  // « R un chantier : … », « Un nouveau chantier : … » — le « C » de « Créer »
  // mangé par la commande vocale. Cinq lignes de sa base au 5 sept.
  { motif: /^r?\s*une? (?:nouveau |nouvelle )?chantier\b/, indice: "« un chantier »" },
  {
    motif: /^r?\s*une? (?:nouvelle )?section (?:de chantiers?)?\b/,
    indice: "« une section de chantiers »",
  },
  {
    motif: /^(?:cree|creer|ajoute|ajouter|rajoute|lance|nouveau|nouvelle)\s+(?:un |une )?chantier\b/,
    indice: "« créer un chantier »",
  },
  { motif: /^chantier\s*:/, indice: "« chantier : »" },
  { motif: /^pour claude(?: code)?\b/, indice: "« pour Claude Code »" },
  { motif: /^(?:demande|dis|dire) a claude\b/, indice: "« demande à Claude »" },
]

/** Ce qui suit l'amorce et n'apporte rien au titre du chantier. Retiré en
 * boucle : « de développement non prioritaire : » les enchaîne. */
const RESIDUS =
  /^(?:de developpement|de dev|pour claude code|pour claude|non prioritaire|a traiter|qui s'appelle)\b[\s:,.-]*/i

function nettoyer(texte: string): string {
  let reste = texte.trim()
  let avant = ""
  while (reste && reste !== avant) {
    avant = reste
    reste = reste.replace(RESIDUS, "").replace(/^[\s:,.—-]+/, "").trim()
  }
  if (!reste) return ""
  reste = reste.charAt(0).toUpperCase() + reste.slice(1)
  return reste
}

/**
 * Cette tâche est-elle un chantier déguisé ?
 *
 * `null` quand rien ne le dit — et c'est le cas de l'immense majorité, y
 * compris de tout ce qui parle d'un chantier de maçonnerie.
 */
export function chantierDeguise(titre: string, notes?: string | null): IndiceChantier | null {
  const propre = normaliserRecherche(titre)
  if (!propre) return null

  for (const { motif, indice } of AMORCES) {
    const trouve = propre.match(motif)
    if (!trouve) continue

    // Le titre proposé est tiré du texte D'ORIGINE, accents compris : il
    // servira tel quel de titre de chantier, et « developpement » sans accent
    // ferait une ligne bancale dans le cockpit.
    let propose = nettoyer(titre.slice(retrouverFin(titre, trouve[0])))

    // Le titre ne portait que l'amorce (« R un chantier de développement non
    // prioritaire : ») : le sujet est dans la note. On lui retire la même
    // amorce, sinon le chantier s'appellerait comme la tâche qu'on corrige.
    if (propose.length < 3 && notes) propose = retirerAmorce(notes)

    if (propose.length < 3) return null
    return { indice, titre: propose }
  }
  return null
}

/** Ce qu'il faut d'une tâche pour la juger : son titre et sa note. */
export interface TacheComparable {
  id: string
  title: string
  notes: string | null
  status: string
}

export interface TacheEgaree<T extends TacheComparable> {
  tache: T
  indice: IndiceChantier
}

/**
 * Toutes les tâches encore ouvertes qui sont en fait des demandes à Claude.
 *
 * POURQUOI CETTE LISTE EXISTE, et pas seulement l'étiquette sur la ligne.
 * Le 5 sept., six de ses tâches étaient des chantiers ; chacune portait déjà
 * son signalement. Le 6 sept. au matin, sa réponse tenait en une phrase :
 * « Je ne vois pas de quelles 7 lignes existantes tu parles. » Avec
 * vingt-neuf tâches réparties par catégorie, un signalement sur la ligne ne se
 * trouve que si on tombe dessus. Il faut donc les RASSEMBLER.
 *
 * Une tâche FAITE n'en est plus une : on ne va pas lui proposer de ressortir
 * du cockpit quelque chose qu'il a déjà réglé.
 */
export function chantiersEgares<T extends TacheComparable>(taches: T[]): TacheEgaree<T>[] {
  const trouves: TacheEgaree<T>[] = []
  for (const tache of taches) {
    if (tache.status === "done") continue
    const indice = chantierDeguise(tache.title, tache.notes)
    if (indice) trouves.push({ tache, indice })
  }
  return trouves
}

/** Le texte débarrassé de son amorce, quelle qu'elle soit. */
function retirerAmorce(texte: string): string {
  const propre = normaliserRecherche(texte)
  for (const { motif } of AMORCES) {
    const trouve = propre.match(motif)
    if (trouve) return nettoyer(texte.slice(retrouverFin(texte, trouve[0])))
  }
  return nettoyer(texte)
}

/**
 * Où finit, dans le texte d'origine, ce que la version normalisée a reconnu.
 *
 * La normalisation retire les accents et la ponctuation : les positions ne
 * correspondent donc pas d'un texte à l'autre. On avance mot à mot plutôt que
 * de couper à l'aveugle — couper au mauvais endroit donnerait un titre
 * tronqué en plein milieu d'un mot.
 */
function retrouverFin(origine: string, prefixeNormalise: string): number {
  const motsAttendus = prefixeNormalise.split(/\s+/).filter(Boolean).length
  let vus = 0
  let i = 0
  while (i < origine.length && vus < motsAttendus) {
    while (i < origine.length && /[\s:,.]/.test(origine[i])) i++
    while (i < origine.length && !/[\s:,.]/.test(origine[i])) i++
    vus++
  }
  return i
}
