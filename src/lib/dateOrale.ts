/**
 * Lire une date et une heure dans une phrase dictée en français.
 *
 * « demain à 14h », « mardi prochain », « le 12 à 9h30 », « ce soir ».
 * Aucun modèle de langage là-dedans : ce sont des formulations en nombre
 * fini, et les reconnaître coûte zéro appel réseau, zéro centime, zéro
 * attente. C'est la moitié du travail que faisait Claude sur une commande
 * du type « ajoute un rendez-vous demain à 14h ».
 *
 * Ce module ne devine pas : quand la phrase ne contient rien de reconnu, il
 * renvoie null et l'appelant décide quoi faire. Mieux vaut ne pas dater une
 * tâche que la dater au mauvais jour.
 */

const JOURS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
]

const MOIS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
]

export function sansAccents(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function iso(d: Date): string {
  const mois = String(d.getMonth() + 1).padStart(2, "0")
  const jour = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mois}-${jour}`
}

export interface Quand {
  /** Date au format YYYY-MM-DD, si la phrase en désigne une. */
  date: string | null
  /** Heure au format HH:MM, si la phrase en donne une. */
  heure: string | null
  /** Les mots consommés par la date et l'heure, à retirer du titre. */
  motsRetires: string[]
}

/** « à 14h », « à 14h30 », « à 9 heures », « à midi », « à 8h du soir ». */
/** Heure seule, sans date — pour une alarme ou un minuteur, qui n'ont pas
 * besoin de jour. Même lecture que celle utilisée pour un rendez-vous. */
export function lireHeure(texte: string): { heure: string; extrait: string } | null {
  if (/\bmidi\b/.test(texte)) return { heure: "12:00", extrait: "midi" }
  if (/\bminuit\b/.test(texte)) return { heure: "00:00", extrait: "minuit" }

  const m = texte.match(
    /\b(?:a |vers )?(\d{1,2})\s*(?:h|heures?)\s*(\d{1,2})?\b(\s*(?:du matin|du soir|de l'apres-midi))?/,
  )
  if (!m) return null

  let heures = Number(m[1])
  const minutes = Number(m[2] ?? 0)
  if (heures > 23 || minutes > 59) return null

  const moment = m[3]?.trim()
  // « 8h du soir » = 20 h. Sans précision, une heure inférieure à 8 dite
  // pour un rendez-vous est presque toujours l'après-midi — mais on ne
  // devine pas : sans « du soir », on prend l'heure telle quelle.
  if (moment && /soir|apres-midi/.test(moment) && heures < 12) heures += 12
  if (moment && /matin/.test(moment) && heures === 12) heures = 0

  return {
    heure: `${String(heures).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    extrait: m[0].trim(),
  }
}

/**
 * Cherche une date et une heure dans la phrase.
 *
 * `maintenant` est injecté plutôt que lu de l'horloge : c'est ce qui rend le
 * module vérifiable sans dépendre du jour où tourne le test.
 */
export function lireQuand(phrase: string, maintenant = new Date()): Quand {
  const texte = sansAccents(phrase)
  const motsRetires: string[] = []
  let date: string | null = null

  const base = new Date(maintenant)
  base.setHours(0, 0, 0, 0)

  const ajouterJours = (n: number) => {
    const d = new Date(base)
    d.setDate(d.getDate() + n)
    return iso(d)
  }

  if (/\bapres-demain\b/.test(texte)) {
    date = ajouterJours(2)
    motsRetires.push("apres-demain")
  } else if (/\bdemain\b/.test(texte)) {
    date = ajouterJours(1)
    motsRetires.push("demain")
  } else if (/\baujourd'?hui\b/.test(texte) || /\bce soir\b/.test(texte) || /\bce matin\b/.test(texte)) {
    date = ajouterJours(0)
    motsRetires.push(/ce soir/.test(texte) ? "ce soir" : /ce matin/.test(texte) ? "ce matin" : "aujourd'hui")
  } else {
    // « mardi », « mardi prochain » : le prochain jour de ce nom.
    const jour = JOURS.findIndex((j) => new RegExp(`\\b${j}\\b`).test(texte))
    if (jour !== -1) {
      const prochain = /\bprochain\b/.test(texte)
      let ecart = (jour - base.getDay() + 7) % 7
      // « mardi » dit un mardi veut dire le mardi suivant, pas aujourd'hui.
      if (ecart === 0) ecart = 7
      if (prochain && ecart < 7) ecart += 0
      date = ajouterJours(ecart)
      motsRetires.push(JOURS[jour])
      if (prochain) motsRetires.push("prochain")
    } else {
      // « le 12 », « le 12 mars ».
      const m = texte.match(/\ble (\d{1,2})(?:er)?\s*([a-z]+)?\b/)
      if (m) {
        const jourDuMois = Number(m[1])
        const nomMois = m[2] ? MOIS.indexOf(m[2]) : -1
        if (jourDuMois >= 1 && jourDuMois <= 31) {
          const d = new Date(base)
          if (nomMois !== -1) {
            d.setMonth(nomMois, jourDuMois)
            if (d < base) d.setFullYear(d.getFullYear() + 1)
          } else {
            d.setDate(jourDuMois)
            // Un quantième déjà passé désigne le mois suivant.
            if (d < base) d.setMonth(d.getMonth() + 1)
          }
          date = iso(d)
          motsRetires.push(m[0].trim())
        }
      }
    }
  }

  const h = lireHeure(texte)
  if (h) {
    motsRetires.push(h.extrait)
    // Une heure sans jour dit implicitement « aujourd'hui », sauf si elle
    // est déjà passée — auquel cas c'est demain.
    if (!date) {
      const [hh, mm] = h.heure.split(":").map(Number)
      const cible = new Date(maintenant)
      cible.setHours(hh, mm, 0, 0)
      date = cible <= maintenant ? ajouterJours(1) : ajouterJours(0)
    }
  }

  // « ce soir » sans heure : 19 h, c'est ce que veut dire quelqu'un qui
  // fixe un rendez-vous.
  const heure = h?.heure ?? (/\bce soir\b/.test(texte) ? "19:00" : null)

  return { date, heure, motsRetires }
}

/** Retire de la phrase les mots consommés par la date, pour garder le titre. */
export function retirerMots(phrase: string, mots: string[]): string {
  let reste = phrase
  for (const mot of mots) {
    const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const motif = new RegExp(`\\s*\\b${echappe}\\b`, "i")
    reste = reste.replace(motif, " ")
  }
  return reste.replace(/\s+/g, " ").replace(/^[,;:.\s]+|[,;:.\s]+$/g, "").trim()
}
