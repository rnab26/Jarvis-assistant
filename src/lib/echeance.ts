/**
 * L'échéance d'une tâche, telle qu'elle s'affiche sur une ligne.
 *
 * La liste montrait « 2026-09-05 ». C'est juste, et c'est illisible : personne
 * ne lit une date ISO d'un coup d'œil, et l'année occupe la moitié de la ligne
 * sur un téléphone pour ne rien apprendre. Raphaël l'a résumé en « moins
 * brut » (chantier e90bb0ff).
 *
 * Ce fichier ne sert PAS à faire parler Jarvis : `direQuand()` dans
 * voiceActions.ts s'en charge, et vise l'inverse — une phrase complète, dite à
 * voix haute (« jeudi 4 septembre à 14 h »). Ici on écrit sur une étiquette de
 * deux centimètres. Deux besoins opposés, deux fonctions ; les fusionner
 * donnerait un texte mauvais des deux côtés.
 */

/**
 * Parse « 2026-09-05 » dans le fuseau de l'appareil.
 *
 * `new Date("2026-09-05")` serait interprété en UTC : à l'ouest de Greenwich,
 * la date affichée reculerait d'un jour, et « aujourd'hui » deviendrait
 * « hier ». On construit donc la date à partir de ses composants.
 */
function jourLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null

  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(annee, mois - 1, jour)

  // Le constructeur ne rejette rien : `new Date(2026, 12, 45)` ne rend pas
  // NaN, il déborde en silence sur février 2027. Une date invalide
  // s'afficherait donc comme une date valide, mais fausse. On vérifie que la
  // date obtenue est bien celle qu'on a demandée.
  if (
    d.getFullYear() !== annee ||
    d.getMonth() !== mois - 1 ||
    d.getDate() !== jour
  ) {
    return null
  }
  return d
}

/** Minuit, aujourd'hui, heure locale — le point de comparaison. */
function minuit(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())
}

const MS_PAR_JOUR = 86_400_000

export interface Echeance {
  /** Ce qui s'affiche sur l'étiquette. */
  texte: string
  /** Vrai quand la date est passée : l'étiquette doit se voir. */
  enRetard: boolean
}

/**
 * @param dateIso  « 2026-09-05 », tel que stocké dans `tasks.due_date`.
 * @param heureIso « 20:00:00 » ou « 20:00 », facultatif.
 * @param maintenant  injecté pour que les contrôles ne dépendent pas du jour.
 */
export function lireEcheance(
  dateIso: string | null,
  heureIso?: string | null,
  maintenant: Date = new Date(),
): Echeance | null {
  if (!dateIso) return null
  const jour = jourLocal(dateIso)
  if (!jour) return null

  const ecart = Math.round((jour.getTime() - minuit(maintenant).getTime()) / MS_PAR_JOUR)
  const heure = heureIso ? heureIso.slice(0, 5) : ""

  let texte: string
  if (ecart === 0) texte = "aujourd'hui"
  else if (ecart === 1) texte = "demain"
  else if (ecart === -1) texte = "hier"
  else if (ecart > 1 && ecart < 7) {
    // Dans la semaine, le nom du jour situe mieux qu'un quantième.
    texte = jour.toLocaleDateString("fr-FR", { weekday: "long" })
  } else {
    // L'année n'apparaît que si elle n'est pas l'année en cours : le reste du
    // temps, elle ne fait qu'occuper la place du titre.
    texte = jour.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      ...(jour.getFullYear() === maintenant.getFullYear() ? {} : { year: "numeric" }),
    })
  }

  return {
    texte: heure ? `${texte} ${heure}` : texte,
    // Une tâche datée d'hier est en retard. Une tâche datée d'aujourd'hui ne
    // l'est pas, même s'il est 23 h : elle a encore sa journée.
    enRetard: ecart < 0,
  }
}
