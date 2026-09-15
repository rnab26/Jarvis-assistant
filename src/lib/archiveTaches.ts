/**
 * Les tâches terminées quittent la liste et vont dans l'archive de LEUR
 * catégorie.
 *
 * SA DEMANDE, mot pour mot (chantier 20435f77, repris par 7c37b6b0) :
 * « Lorsque une tache est noté comme terminé plutôt qu'elle reste dans la
 * liste de tâches et que ca pollue visuellement je veux quil y'a une section
 * archives dans les différentes listes de taches et que la tâche terminé
 * bascule dedans apres l'avoir coché. »
 *
 * PUR, donc vérifiable sans navigateur : ce qui peut casser en silence ici,
 * c'est une tâche qui disparaît des DEUX côtés (ni dans la liste, ni dans
 * l'archive). Une tâche perdue de vue ne se retrouve nulle part — il n'y a pas
 * de corbeille pour les tâches.
 *
 * DEUX RÈGLES À NE PAS DÉFAIRE :
 *
 * 1. **Une dictée en attente de réseau n'est JAMAIS archivée**, même si son
 *    `status` dit "done". Elle n'existe pas en base : la ranger dans un
 *    dépliant replié la rendrait invisible alors que c'est précisément la
 *    ligne qu'il doit voir (`useTasks`, file hors ligne).
 * 2. **La dernière cochée est en TÊTE de l'archive.** Elle est la seule qu'on
 *    vient peut-être de cocher par erreur ; la mettre en bas d'une liste de
 *    trente obligerait à défiler pour se rattraper.
 */

/** Le minimum dont on a besoin pour ranger une tâche. */
export interface TacheRangeable {
  status: string
  updated_at?: string | null
  /** Dictée hors ligne, pas encore écrite en base. */
  enAttente?: boolean
}

export interface Repartition<T> {
  /** Ce qui reste à faire, dans l'ordre reçu (déjà trié par échéance). */
  aFaire: T[]
  /** Ce qui est fait, la plus récemment terminée d'abord. */
  archivees: T[]
}

export function repartir<T extends TacheRangeable>(taches: readonly T[]): Repartition<T> {
  const aFaire: T[] = []
  const archivees: T[] = []
  for (const t of taches) {
    if (t.status === "done" && t.enAttente !== true) archivees.push(t)
    else aFaire.push(t)
  }
  archivees.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
  return { aFaire, archivees }
}

/**
 * Le libellé du dépliant. Le NOMBRE y est, parce que c'est la seule chose
 * qu'on veut savoir sans ouvrir : « il y en a, ou il n'y en a pas ».
 */
export function libelleArchive(n: number): string {
  return n === 1 ? "1 terminée" : `${n} terminées`
}

/**
 * Ce qu'on écrit quand une catégorie n'a plus rien à faire.
 *
 * Rendre une carte VIDE serait pire que l'ancien affichage : il verrait un
 * bloc au nom de sa catégorie sans savoir si elle est soldée ou si l'app a
 * raté quelque chose. Le cas « ni tâche ni archive » ne rend rien : la carte
 * n'a alors aucune raison d'exister et n'est pas montée.
 */
export function phraseCategorieSoldee(archivees: number): string | null {
  if (archivees === 0) return null
  return "Tout est fait ici."
}

/**
 * Ce que le toast dit après une coche, et son bouton de retour arrière.
 *
 * La tâche QUITTE la liste au moment où il la coche : sans ce mot, un appui
 * de travers sur un écran de téléphone efface une ligne de sa vue sans rien
 * dire, et il faut déplier l'archive pour comprendre où elle est passée.
 */
export function phraseArchivee(titre: string): string {
  return `« ${titre} » rangée dans les terminées`
}

/** Et le chemin inverse, pour qu'une décoche dise aussi ce qu'elle a fait. */
export function phraseRemiseAFaire(titre: string): string {
  return `« ${titre} » est de nouveau à faire`
}

// ── Le réglage ────────────────────────────────────────────────────────────

/**
 * Les terminées dépliées d'entrée, ou repliées.
 *
 * Sa règle du 3 sept. : toute fonctionnalité qui introduit une préférence
 * livre son réglage AVEC elle. « Replié » est le comportement qu'il a demandé
 * (« ça pollue visuellement ») — mais quelqu'un qui coche beaucoup et veut
 * garder ses terminées sous les yeux ne doit pas avoir à demander qu'on code
 * l'inverse. Déclaré dans `REGLAGES` (`src/lib/reglages.ts`), réglable dans
 * Paramètres › Tâches et organisation.
 */
export const CLE_ARCHIVES_OUVERTES = "jarvis_taches_archives_ouvertes"

/** Absent = jamais choisi = replié, ce qu'il a demandé. */
export function archivesOuvertes(valeurBrute: string | null): boolean {
  return valeurBrute === "1"
}
