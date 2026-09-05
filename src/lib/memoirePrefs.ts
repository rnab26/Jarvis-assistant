// Import relatif avec extension : ce module doit rester chargeable par
// `node --experimental-strip-types` pour `scripts/verifier-retention.ts`, qui
// ne connaît pas l'alias « @/ » de Vite.
import { ecrireReglage } from "./reglages.ts"

/**
 * Combien de temps Jarvis garde le MOT-À-MOT de vos conversations.
 *
 * Ce réglage commande une SUPPRESSION en base : `purger_echanges()` (migration
 * 0023) lit cette même clé dans la table `reglages` et efface tout ce qui la
 * dépasse, à chaque phrase. Les deux moitiés doivent donc dire la même chose —
 * la valeur écrite ici est celle que lit `retention_jours()` en SQL, à la
 * chaîne près.
 *
 * LE DÉFAUT EST « SANS LIMITE », et ce n'est pas un goût. Deux fiches lui ont
 * posé la même question le même soir : « Sans limite » d'un côté (« illimité
 * mais ultra compacter pour comprendre le nécessaire »), « 30 jours au
 * départ » de l'autre. Ce qui les départage : supprimer est irréversible,
 * garder ne l'est pas. Un défaut à 30 jours effacerait ses conversations
 * d'août sans que personne s'en aperçoive ; un défaut sans limite ne coûte
 * rien et il descend d'un appui.
 *
 * Et c'est bien un changement de comportement : jusqu'au 5 sept. 2026, la
 * purge à sept jours était écrite en dur dans la fonction SQL et personne ne
 * pouvait ni la voir ni la changer.
 */
export const RETENTION_KEY = "jarvis_memoire_retention"

/** « illimite » plutôt qu'une absence de valeur : un choix explicite se
 * distingue d'un réglage jamais touché, et se recopie en base comme les
 * autres. Les autres valeurs sont un nombre de jours, en clair, parce que
 * c'est ce que le SQL lit. */
export const RETENTION_PAR_DEFAUT = "illimite"

export const RETENTIONS: { valeur: string; libelle: string; jours: number | null; aide: string }[] =
  [
    {
      valeur: "illimite",
      libelle: "Sans limite",
      jours: null,
      aide: "Rien n'est jamais effacé. Tu peux toujours effacer une conversation, ou toutes, depuis l'onglet Mémoire.",
    },
    {
      valeur: "90",
      libelle: "90 jours",
      jours: 90,
      aide: "Un trimestre glissant. Au-delà, le mot-à-mot est effacé définitivement.",
    },
    {
      valeur: "30",
      libelle: "30 jours",
      jours: 30,
      aide: "Un mois glissant. Au-delà, le mot-à-mot est effacé définitivement.",
    },
    {
      valeur: "7",
      libelle: "7 jours",
      jours: 7,
      aide: "Une semaine glissante — ce que faisait l'app avant que ce réglage existe.",
    },
  ]

export function lireRetention(): string {
  try {
    const v = localStorage.getItem(RETENTION_KEY)
    return RETENTIONS.some((r) => r.valeur === v) ? v! : RETENTION_PAR_DEFAUT
  } catch {
    return RETENTION_PAR_DEFAUT
  }
}

export function ecrireRetention(valeur: string) {
  ecrireReglage(RETENTION_KEY, valeur)
}

/** Ce que ce choix effacerait, à la seconde où il est fait. */
export function combienSeraientEffaces(dates: string[], jours: number | null, maintenant = Date.now()): number {
  if (jours === null) return 0
  const limite = maintenant - jours * 24 * 3600_000
  return dates.filter((d) => {
    const t = new Date(d).getTime()
    // Une date illisible ne compte pas comme « à effacer » : mieux vaut
    // annoncer un chiffre trop bas que faire croire à une purge qui n'aura
    // pas lieu.
    return !Number.isNaN(t) && t < limite
  }).length
}
