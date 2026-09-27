import { lireEcheance } from "./echeance.ts"
import type { Task } from "@/types/database"

/**
 * Ce que le widget d'écran d'accueil porte, et dans quel ordre.
 *
 * POURQUOI CE MODULE EXISTE (chantier 562f1475, 27 sept. 2026). Sa demande :
 * « Peux tu faire en sorte quon puisse défiler les taches dans les widgets
 * creer de jarvis ». La liste était UN SEUL TextView tronqué à quatre lignes :
 * rien ne pouvait défiler, par construction. Elle est devenue une vraie
 * ListView côté Android, et une liste qui défile change ce qu'il faut lui
 * envoyer — plus « les trois premiers titres », mais des LIGNES, chacune avec
 * son échéance.
 *
 * MESURÉ le jour même, avant d'écrire une ligne : 43 tâches à faire, 14
 * urgentes, 26 sans date, et son réglage au PLAFOND de l'ancien sélecteur
 * (`maxTasks: 5`, modifié huit minutes avant sa demande). Le widget lui cachait
 * 9 urgentes sur 14.
 *
 * Pur : aucun accès au stockage natif, aucun appel Capacitor. `widgetSnapshot`
 * s'occupe de l'écriture, ce fichier de la décision — c'est elle qui peut être
 * fausse en silence (une tâche faite qui reste affichée, un plafond qui coupe
 * les urgentes). Vérifié par `scripts/verifier-widget-taches.ts`.
 */

/** « Toutes », dans le réglage `maxTasks`. */
export const TOUTES = 0

/**
 * Le plafond technique, et il n'est pas un réglage.
 *
 * Une mise à jour de RemoteViews traverse un canal dont la charge utile est
 * plafonnée (~1 Mo pour l'ensemble) — même contrainte que l'image du cœur, dont
 * `CoeurJarvis` porte déjà la note. Ce n'est pas une préférence d'affichage :
 * au-delà, la mise à jour ENTIÈRE échoue et le widget reste vide. Une liste qui
 * défile n'a de toute façon aucune raison d'aller plus loin — cinquante lignes
 * font déjà plusieurs écrans de téléphone.
 */
export const PLAFOND_WIDGET = 50

/** Une ligne de la liste, telle que la ListView l'affiche. */
export interface LigneWidget {
  titre: string
  /** « hier », « aujourd'hui », « mardi », « 14 oct. » — vide si sans date. */
  echeance: string
  /** En retard OU due aujourd'hui : la ligne se colore. */
  urgent: boolean
}

export interface ConfigWidget {
  maxTasks: number
  urgentOnly: boolean
  categoryId: string | null
}

/**
 * Urgente = en retard OU due aujourd'hui.
 *
 * Ce n'est PAS `lireEcheance().enRetard`, qui exclut aujourd'hui (« elle a
 * encore sa journée ») : c'est le bon choix pour une étiquette dans la liste
 * des tâches, et le mauvais ici. Le réglage s'appelle « Urgentes uniquement »
 * et sa description dit « en retard ou dues aujourd'hui » — la définition
 * suit ce qui lui est écrit à l'écran, pas l'inverse.
 */
export function estUrgente(task: Task, aujourdhuiISO: string): boolean {
  return !!task.due_date && task.due_date <= aujourdhuiISO
}

/** Les tâches que le widget prend en compte : à faire, dans sa catégorie. */
export function tachesDuWidget(taches: Task[], config: ConfigWidget): Task[] {
  return taches.filter(
    (t) => t.status === "todo" && (!config.categoryId || t.category_id === config.categoryId),
  )
}

/** Combien de lignes partent au plus. `TOUTES` et toute valeur trop grande
 * retombent sur le plafond technique ; une valeur absurde (0 négatif, NaN)
 * n'affame jamais la liste. */
export function nombrePorte(maxTasks: number): number {
  if (!Number.isFinite(maxTasks) || maxTasks <= 0) return PLAFOND_WIDGET
  return Math.min(Math.floor(maxTasks), PLAFOND_WIDGET)
}

/**
 * Les lignes du widget.
 *
 * L'ORDRE REÇU EST CONSERVÉ, ET C'EST VOULU. `useTasks` trie déjà en SQL
 * (`due_date asc nulls last, created_at desc`) : les tâches en retard
 * arrivent donc en tête, puis aujourd'hui, puis à venir, puis les sans date —
 * exactement ce qu'un plafond doit garder si jamais il coupe. Retrier ici
 * poserait une SECONDE règle d'ordre, et le widget finirait par ne plus dire
 * la même chose que l'onglet Tâches.
 */
export function lignesDuWidget(
  taches: Task[],
  config: ConfigWidget,
  maintenant: Date = new Date(),
): LigneWidget[] {
  const aujourdhuiISO = isoLocal(maintenant)
  const retenues = tachesDuWidget(taches, config)
  const listees = config.urgentOnly
    ? retenues.filter((t) => estUrgente(t, aujourdhuiISO))
    : retenues

  return listees.slice(0, nombrePorte(config.maxTasks)).map((t) => ({
    titre: t.title,
    echeance: lireEcheance(t.due_date, t.due_time, maintenant)?.texte ?? "",
    urgent: estUrgente(t, aujourdhuiISO),
  }))
}

/**
 * Le jour, dans le fuseau de l'appareil.
 *
 * `toISOString().slice(0, 10)` serait en UTC : à l'est de Greenwich — Israël,
 * où il vit — une tâche due aujourd'hui cesserait d'être urgente dès 21 h,
 * parce qu'UTC serait encore la veille. Le widget lui cacherait donc ses
 * urgentes précisément le soir où il les regarde.
 */
export function isoLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const j = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${j}`
}
