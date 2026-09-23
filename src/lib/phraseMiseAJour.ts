/**
 * Ce que Jarvis dit après avoir MODIFIÉ une tâche : ce qui a changé, avec la
 * NOUVELLE valeur — jamais « "<ancien titre>" mise à jour ».
 *
 * Chantier 8b8b6d36, ouvert tout seul par Jarvis (« Raphaël a dû redemander
 * la même chose : update_task »). MESURÉ dans journal_ecoute le 22 sept.
 * 2026, 22h22-22h24 : SEPT « modifie la tâche… » d'affilée en deux minutes.
 * Chaque modification avait bien eu lieu — mais la confirmation nommait la
 * tâche par son titre D'AVANT :
 *
 *     « modifie la tâche Rappeler Ilan Régnier en "appeler la compagnie elal" »
 *       → « "Rappeler Ilan Régnier" mise à jour. »
 *     « Modifier la tâche : … récupérer mes points »
 *       → « "Appeler la compagnie El Al pour récupérer mes fonds" mise à jour. »
 *
 * Il entendait l'ANCIEN nom, concluait que rien n'avait changé, et
 * recommençait — la dictée alternant « fonds » et « points », chaque tour
 * annulait le précédent. Le défaut n'était ni la compréhension ni l'écriture :
 * c'était la phrase de confirmation.
 *
 * Pur, sans réseau : `scripts/verifier-phrase-mise-a-jour.ts`.
 */

export interface TacheAvant {
  title: string
  notes?: string | null
  due_date?: string | null
  due_time?: string | null
  category_id?: string | null
  status?: string
}

export interface ChangementsTache {
  title?: string
  notes?: string | null
  due_date?: string | null
  due_time?: string | null
  category_id?: string | null
  status?: string
}

function pareil(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim().toLowerCase()
  return n(a) === n(b)
}

/** « vendredi 26 septembre » — dit à voix haute, jamais au format ISO. */
export function dateDite(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
}

/** « 10 h », « 10 h 30 ». */
export function heureDite(hhmm: string): string {
  const [h, m] = hhmm.split(":")
  if (!h) return hhmm
  const heures = String(Number(h))
  return !m || m === "00" ? `${heures} h` : `${heures} h ${m}`
}

export function phraseMiseAJourTache(
  avant: TacheAvant,
  changes: ChangementsTache,
  nomCategorie: (id: string | null | undefined) => string | undefined,
): string {
  const titreApres =
    changes.title !== undefined && changes.title.trim() ? changes.title.trim() : avant.title
  const renommee = changes.title !== undefined && !pareil(changes.title, avant.title)

  if (changes.status === "done" && avant.status !== "done") {
    return `"${titreApres}" marquée comme faite.`
  }

  const dits: string[] = []
  if (renommee) dits.push(`renommée en "${titreApres}"`)

  const dateChange = changes.due_date !== undefined && changes.due_date !== avant.due_date
  const heureChange = changes.due_time !== undefined && changes.due_time !== avant.due_time
  if (dateChange || heureChange) {
    const date = changes.due_date !== undefined ? changes.due_date : avant.due_date
    const heure = changes.due_time !== undefined ? changes.due_time : avant.due_time
    if (!date && !heure) dits.push("sans échéance")
    else dits.push(`pour ${date ? dateDite(date) : "aujourd'hui"}${heure ? ` à ${heureDite(heure)}` : ""}`)
  }

  if (changes.category_id !== undefined && changes.category_id !== avant.category_id) {
    const nom = nomCategorie(changes.category_id)
    dits.push(nom ? `rangée dans ${nom}` : "sortie de sa catégorie")
  }

  if (changes.notes !== undefined && !pareil(changes.notes, avant.notes)) dits.push("notes mises à jour")

  if (changes.status && changes.status !== avant.status && changes.status !== "done") {
    dits.push("remise à faire")
  }

  if (dits.length === 0) {
    // Rien n'a VRAIMENT changé : le lui dire, plutôt qu'un « mise à jour »
    // qui le laisserait croire que sa demande a été ignorée — ou prise.
    return `"${titreApres}" était déjà comme ça : je n'ai rien eu à changer.`
  }
  // Le sujet de la phrase est la tâche telle qu'il la connaissait : c'est elle
  // qu'il cherche des yeux dans sa liste.
  return `"${avant.title}" ${dits.join(", ")}.`
}

export interface ChantierAvant {
  title: string
  status?: string
  priority?: string
  theme?: string | null
  notes?: string | null
}

const STATUT_DIT: Record<string, string> = { todo: "à faire", in_progress: "en cours", done: "terminé" }
const PRIORITE_DITE: Record<string, string> = {
  low: "priorité basse",
  normal: "priorité normale",
  high: "priorité haute",
}

/** Même règle pour un chantier : dire la NOUVELLE valeur, le titre compris. */
export function phraseMiseAJourChantier(
  avant: ChantierAvant,
  changes: { title?: string; status?: string; priority?: string; theme?: string | null; notes?: string | null },
): string {
  const dits: string[] = []
  if (changes.title !== undefined && changes.title.trim() && !pareil(changes.title, avant.title)) {
    dits.push(`renommé en "${changes.title.trim()}"`)
  }
  if (changes.status && changes.status !== avant.status) dits.push(`passé en ${STATUT_DIT[changes.status] ?? changes.status}`)
  if (changes.priority && changes.priority !== avant.priority) {
    dits.push(`passé en ${PRIORITE_DITE[changes.priority] ?? changes.priority}`)
  }
  if (changes.theme !== undefined && !pareil(changes.theme, avant.theme)) {
    dits.push(changes.theme ? `rangé dans ${changes.theme}` : "sorti de sa section")
  }
  if (changes.notes !== undefined && !pareil(changes.notes, avant.notes)) dits.push("notes mises à jour")
  if (dits.length === 0) return `"${avant.title}" était déjà comme ça : je n'ai rien eu à changer.`
  return `"${avant.title}" ${dits.join(", ")}.`
}
