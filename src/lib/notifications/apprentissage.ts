import type { CanalNotif } from "./plan"

/**
 * Ce que Jarvis apprend de ses propres notifications (chantier 05241cc7).
 *
 * Sa réponse, 6 sept. 2026 : « Oui, qu'il apprenne. » Question posée avec ce
 * qu'elle implique — Jarvis enregistre ce qu'il ouvre, ignore ou balaie, et
 * ajuste ce qui mérite de le déranger. Cohérent avec le questionnaire :
 * « au fur et à mesure qu'il fait ça il va s'entraîner et comprendre ce qui
 * m'intéresse ou pas et mon ordre de priorité, car ce qu'il juge mériter mon
 * attention n'est peut-être pas le cas pour moi. »
 *
 * Pur, comme plan.ts et annonceVocale.ts : aucun appel à Android, à la base ni
 * à React. Le pont (lecture/écriture Supabase) est dans
 * src/hooks/useNotifications.ts, comme pour tout le reste des notifications.
 * Vérifié par scripts/verifier-apprentissage-notifications.ts.
 *
 * CE QUE ÇA NE FAIT PAS, et c'est écrit dans sa réponse même (point 3 de la
 * note du chantier) : « l'apprentissage ne décide pas seul de se taire. Il
 * ajuste l'ordre et l'insistance ; il ne supprime jamais une notification que
 * Raphaël a activée. » L'échéance d'une tâche (canal "taches") n'est donc
 * JAMAIS ajustable ici — manquer un rendez-vous parce qu'un modèle a « appris »
 * qu'il ne l'intéressait pas serait pire que le bruit qu'on essaie d'éviter.
 * Seule l'ANNONCE VOCALE (déjà optionnelle par nature, voir annonceVocale.ts)
 * peut être rendue moins insistante pour un canal secondaire et peu suivi — la
 * notification elle-même continue de s'afficher et de sonner selon son canal
 * Android, inchangé.
 */

/** Une ligne de `notifications_journal`, telle que lue de la base. */
export interface EntreeJournalNotif {
  canal: string
  envoyee_at: string
  ouverte_at: string | null
}

export interface StatsCanal {
  canal: CanalNotif
  /** Combien envoyées, dans la fenêtre observée. */
  envoyees: number
  /** Combien ouvertes (appui dessus). */
  ouvertes: number
  /**
   * Combien peuvent être JUGÉES : ouvertes, ou envoyées il y a assez
   * longtemps pour qu'une absence d'ouverture vaille comme un signal plutôt
   * que comme « il n'a pas encore eu le temps de regarder ».
   */
  jugees: number
  /** ouvertes / jugees, ou null si rien n'est encore jugeable. */
  taux: number | null
}

/**
 * Au-delà de ce délai sans ouverture, une notification envoyée compte comme
 * « jugée » (ignorée si toujours pas ouverte). En-deçà, elle est encore
 * susceptible d'être ouverte plus tard : la compter maintenant confondrait
 * « pas encore regardé » et « pas intéressé ».
 */
export const DELAI_JUGEMENT_MS = 48 * 60 * 60 * 1000

/**
 * En dessous de ce taux d'ouverture, un canal est « peu suivi » — encore
 * faut-il un échantillon assez grand pour que ce ne soit pas trois refus au
 * hasard. Pas de mesure réelle disponible au moment d'écrire ceci (le canal
 * vient d'être créé) : valeurs prudentes, à resserrer une fois qu'il y aura de
 * quoi les vérifier sur ses vrais chiffres, comme pour SEUIL_DOUBLON.
 */
export const SEUIL_PEU_SUIVI = 0.15
export const ECHANTILLON_MIN = 5

/**
 * Les seuls canaux dont l'insistance peut être ajustée. Ni "taches"
 * (échéance — critique, jamais assourdie), ni "nuit" (déjà la version
 * silencieuse de "taches"), ni "app" (rare, une fois par version, pas assez
 * de signal pour juger).
 */
export const CANAUX_AJUSTABLES: readonly CanalNotif[] = ["matin", "livraisons", "blocages"]

/** Les noms lisibles des canaux ajustables — les seuls que la carte
 * Paramètres affiche. Les autres (taches, nuit, app) n'ont pas leur mot à
 * dire ici : rien n'y est jamais ajusté, rien n'a besoin d'un nom pour ça. */
export const NOMS_CANAUX: Partial<Record<CanalNotif, string>> = {
  matin: "Point du matin",
  livraisons: "Chantiers livrés",
  blocages: "Sessions bloquées",
}

function canalConnu(c: string): c is CanalNotif {
  return (
    c === "taches" ||
    c === "matin" ||
    c === "nuit" ||
    c === "app" ||
    c === "livraisons" ||
    c === "blocages"
  )
}

/** Stats par canal, sur les entrées données. Un canal jamais envoyé n'a pas
 * d'entrée dans le résultat plutôt qu'une ligne à zéro : la carte n'affiche
 * que ce qui s'est vraiment passé. */
export function statsParCanal(
  journal: EntreeJournalNotif[],
  maintenant: Date,
): Partial<Record<CanalNotif, StatsCanal>> {
  const parCanal = new Map<CanalNotif, EntreeJournalNotif[]>()
  for (const entree of journal) {
    if (!canalConnu(entree.canal)) continue
    const liste = parCanal.get(entree.canal) ?? []
    liste.push(entree)
    parCanal.set(entree.canal, liste)
  }

  const resultat: Partial<Record<CanalNotif, StatsCanal>> = {}
  for (const [canal, entrees] of parCanal) {
    let ouvertes = 0
    let jugees = 0
    for (const e of entrees) {
      const ouverte = e.ouverte_at !== null
      if (ouverte) ouvertes++
      const envoyeeDepuis = maintenant.getTime() - new Date(e.envoyee_at).getTime()
      if (ouverte || envoyeeDepuis >= DELAI_JUGEMENT_MS) jugees++
    }
    resultat[canal] = {
      canal,
      envoyees: entrees.length,
      ouvertes,
      jugees,
      taux: jugees > 0 ? ouvertes / jugees : null,
    }
  }
  return resultat
}

/** Ce canal est-il peu suivi — assez d'échantillon, et un taux bas ? */
export function peuSuivi(stats: StatsCanal | undefined): boolean {
  if (!stats || stats.jugees < ECHANTILLON_MIN || stats.taux === null) return false
  return stats.taux < SEUIL_PEU_SUIVI
}

/**
 * Doit-on, pour CE canal, réduire l'insistance vocale ? Faux pour tout canal
 * non ajustable — la porte d'entrée qui garantit qu'« échéance » n'est jamais
 * concerné, même si peuSuivi() venait un jour à être mal appelée ailleurs.
 */
export function insistanceReduite(
  canal: CanalNotif,
  stats: Partial<Record<CanalNotif, StatsCanal>>,
): boolean {
  if (!CANAUX_AJUSTABLES.includes(canal)) return false
  return peuSuivi(stats[canal])
}
