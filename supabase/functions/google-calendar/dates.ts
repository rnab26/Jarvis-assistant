// Traduire ce que Raphaël dicte en dates que Google accepte. Sorti de
// index.ts pour une seule raison : ce fichier n'importe rien de Deno, donc
// scripts/verifier-agenda-google.mjs peut l'exécuter tel quel sous Node et
// prouver le comportement SANS toucher à son agenda. Une copie de ces règles
// dans le script de contrôle ne prouverait que la copie.
//
// Le déploiement l'embarque automatiquement : deployer-fonction.sh envoie
// tous les .ts du dossier de la fonction.

// Raphaël vit en Israël : un "rendez-vous demain à 14h" dicté sans précision
// est une heure locale, pas une heure UTC. Sans ce fuseau, Google placerait
// l'événement avec trois heures de décalage.
export const FUSEAU = "Asia/Jerusalem"

/** Une chaîne qui porte déjà « Z » ou « +03:00 » désigne un instant précis. */
const A_UN_FUSEAU = /(?:Z|[+-]\d{2}:?\d{2})$/

/**
 * Le décalage du fuseau de Raphaël à un instant donné, en minutes.
 * Calculé, jamais codé en dur : Israël passe à l'heure d'été, et un « +3 »
 * figé décalerait tous ses rendez-vous d'une heure la moitié de l'année.
 */
function decalageMinutes(instantDonne: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSEAU,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instantDonne)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>

  const commeUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return (commeUTC - instantDonne.getTime()) / 60000
}

/**
 * L'instant réel derrière ce que Raphaël a dicté.
 *
 * Le modèle produit des heures LOCALES sans fuseau ("2026-09-04T14:00:00",
 * cf. event_debut dans voice-command) : c'est voulu, il dicte des heures
 * d'Israël. Mais une telle chaîne ne désigne aucun instant tant qu'on ne lui
 * associe pas un fuseau, et trois choses en dépendaient (mesuré le 3 sept.
 * 2026 sur l'API réelle) :
 *   — `new Date("2026-09-04T14:00")` la lit dans le fuseau du serveur, UTC
 *     sur le runtime Supabase : trois heures d'écart en été ;
 *   — Google refuse un timeMin/timeMax sans fuseau par un « 400 Bad
 *     Request », donc « qu'est-ce que j'ai demain ? » ne répondait rien ;
 *   — mêler un début naïf et une fin en « Z » dans le même événement donnait
 *     un rendez-vous de quatre heures là où il en demandait un.
 * Une seule conversion, ici, pour que ces trois-là ne divergent plus.
 */
export function instant(valeur: string): Date {
  if (A_UN_FUSEAU.test(valeur)) return new Date(valeur)
  const naive = valeur.length <= 10 ? `${valeur}T00:00:00` : valeur
  const base = Date.parse(`${naive}Z`)
  if (Number.isNaN(base)) return new Date(NaN)
  // Deux passes : la première donne le bon décalage partout sauf dans l'heure
  // du changement d'heure, la seconde la rattrape.
  const premiere = base - decalageMinutes(new Date(base)) * 60000
  return new Date(base - decalageMinutes(new Date(premiere)) * 60000)
}

/**
 * `null` si la date est illisible — mieux vaut le dire que d'envoyer du
 * n'importe quoi à Google et rendre son « Bad Request » à la voix.
 */
export function instantISO(valeur: string): string | null {
  const d = instant(valeur)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export type Bornes = {
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
}

/** Une date dictée peut arriver en "2026-09-04T14:00" comme en ISO complet. */
export function bornes(
  debut?: string | null,
  fin?: string | null,
  journeeEntiere?: boolean,
): Bornes | null {
  if (!debut) return null

  if (journeeEntiere) {
    const jour = debut.slice(0, 10)
    // `end.date` est EXCLUSIF chez Google : le dernier jour annoncé doit être
    // déclaré au lendemain, sinon « du 12 au 14 » s'arrête le 13.
    const dernier = new Date(`${(fin ?? jour).slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(dernier.getTime())) return null
    dernier.setUTCDate(dernier.getUTCDate() + 1)
    return { start: { date: jour }, end: { date: dernier.toISOString().slice(0, 10) } }
  }

  const debutAbsolu = instant(debut)
  if (Number.isNaN(debutAbsolu.getTime())) return null
  // Une heure sans fin annoncée dure une heure : c'est ce qu'attend
  // quelqu'un qui dicte "rendez-vous à 14h" sans en dire plus.
  const finAbsolue = fin ? instant(fin) : new Date(debutAbsolu.getTime() + 60 * 60 * 1000)
  if (Number.isNaN(finAbsolue.getTime())) return null

  // Les deux bornes dans la même unité — un instant absolu — pour qu'aucune
  // ne puisse être lue dans un fuseau différent de l'autre.
  return {
    start: { dateTime: debutAbsolu.toISOString(), timeZone: FUSEAU },
    end: { dateTime: finAbsolue.toISOString(), timeZone: FUSEAU },
  }
}
