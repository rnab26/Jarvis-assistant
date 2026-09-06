/**
 * « Combien il me reste, et à combien de temps de discussion ça équivaut. »
 *
 * Chantier 5ac4d12c, dicté le 5 sept. 2026 à 17h59 : « savoir combien il me
 * reste de crédit et à combien de temps de discussion ça équivaut, et le noter
 * constamment ».
 *
 * PUR : aucun appel réseau, aucun React. Ce qui se décide ici peut être faux
 * EN SILENCE — un chiffre rassurant devant un quota vide, ou l'inverse —, donc
 * ça se vérifie hors ligne (`scripts/verifier-consommation.ts`). Les données
 * viennent de `etat_consommation()` (migration 0025) ; l'affichage est ailleurs.
 *
 * LA CHOSE À NE PAS FAIRE ICI : inventer un plafond. Jarvis tourne sur l'offre
 * GRATUITE de Gemini, dont les limites ne sont publiées NULLE PART — ni dans
 * la documentation, ni dans ListModels, ni dans une réponse qui réussit. Elles
 * ne se lisent que dans le corps d'un 429, c'est-à-dire une fois qu'on les a
 * dépassées. Un pourcentage inventé serait pire que pas de chiffre du tout :
 * il se lit comme une mesure, et il l'a déjà payé deux fois en se retrouvant
 * sans Jarvis alors que tout avait l'air normal.
 *
 * D'où deux sources, et deux seulement :
 *  - `PLAFONDS_MESURES`, ce qu'on a vraiment vu, avec sa date ;
 *  - son usage réel du jour, qui est la meilleure preuve qui soit — 300 phrases
 *    passées aujourd'hui sans un seul refus valent mieux que n'importe quelle
 *    limite annoncée.
 */

/** Une ligne de `etat_consommation()`, regroupée par rôle et par modèle. */
export interface LigneConsommation {
  role: "commande" | "memoire"
  modele: string
  fournisseur: string
  appels: number
  reussis: number
  refus_minute: number
  refus_jour: number
  jetons_entree: number
  jetons_sortie: number
  jetons_reflexion: number
  ms_median: number | null
  dernier_at: string | null
  /**
   * Le rang du modèle dans la chaîne : 0 = le principal, 1 = premier secours…
   *
   * Il vient du SERVEUR, et c'est important : le modèle principal se règle par
   * le secret GEMINI_MODELE, que l'app ne peut pas lire. Deviner ici quel nom
   * est le principal donnerait une page silencieusement fausse le jour où le
   * secret change — c'est-à-dire le jour où il faut savoir qu'on est sur un
   * secours. `null` sur les lignes écrites avant la migration 0025.
   */
  rang: number | null
}

/** Un plafond qu'on a RÉELLEMENT constaté, avec de quoi le dater. */
export interface Plafond {
  /** Requêtes par minute, lues dans le `quotaValue` d'un vrai 429. */
  parMinute?: number
  /**
   * Le plus grand nombre d'appels passés dans une journée SANS jamais voir de
   * refus journalier. Ce n'est pas le plafond : c'est un plancher prouvé.
   */
  auMoinsParJour?: number
  /** Un plafond journalier réellement rencontré. */
  parJour?: number
  mesureLe: string
}

/**
 * Ce qui a été mesuré, et rien d'autre. Un modèle absent d'ici n'a pas de
 * plafond connu — et on l'écrit, on ne le devine pas.
 *
 * Mesures du 6 sept. 2026 (chantier 0edec0c4), par de vrais appels
 * `generateContent` avec la clé de test. `scripts/verifier-moteur.ts` vérifie
 * que ces noms de modèles sont bien ceux que le serveur utilise : une entrée
 * qui parlerait d'un modèle abandonné afficherait un chiffre sans rapport.
 */
export const PLAFONDS_MESURES: Record<string, Plafond> = {
  "gemini-3.1-flash-lite": { auMoinsParJour: 100, mesureLe: "2026-09-04" },
  "gemini-3.1-flash-lite-preview": { parMinute: 15, auMoinsParJour: 41, mesureLe: "2026-09-06" },
  "gemini-3-flash-preview": { parMinute: 5, mesureLe: "2026-09-06" },
  "gemini-3.5-flash-lite": { auMoinsParJour: 20, mesureLe: "2026-09-06" },
  "gemini-3.7-flash": { parJour: 20, mesureLe: "2026-09-04" },
}

export interface Alerte {
  niveau: "rouge" | "orange"
  texte: string
}

export interface Consommation {
  /** Ses phrases à lui : le rôle « commande », réussies. La mémoire n'en est pas. */
  phrases: number
  /** Tous les jetons envoyés, mémoire comprise — c'est ce qui remplit les seaux. */
  jetons: number
  /** Le modèle qui a répondu le plus souvent à ses phrases. */
  modele: string | null
  /** Vrai si ses phrases sont passées par un secours : le principal flanche. */
  surSecours: boolean
  refusMinute: number
  refusJour: number
  /** Ce qu'on peut dire honnêtement de la marge restante. */
  marge: string
  /** Ce qui mérite qu'il le voie tout de suite, ou rien. */
  alerte: Alerte | null
  /** Le temps de réponse médian, en millisecondes — sa gêne la plus fréquente. */
  msMedian: number | null
}

/** Le total des jetons d'une ligne, réflexion comprise : elle compte au plafond. */
function jetonsDe(l: LigneConsommation): number {
  return l.jetons_entree + l.jetons_sortie + l.jetons_reflexion
}

/**
 * Ce que ces lignes disent de sa journée.
 *
 * Rien à lui passer : tout ce qu'il faut savoir est dans les lignes, le rang
 * du modèle compris. C'est voulu — la seule autre façon de savoir si l'on
 * tourne sur un secours serait de comparer des noms de modèles, et l'app ne
 * peut pas connaître celui que le secret désigne côté serveur.
 */
export function resumerConsommation(lignes: LigneConsommation[]): Consommation {
  const commandes = lignes.filter((l) => l.role === "commande")

  const phrases = commandes.reduce((n, l) => n + l.reussis, 0)
  const jetons = lignes.reduce((n, l) => n + jetonsDe(l), 0)
  const refusMinute = lignes.reduce((n, l) => n + l.refus_minute, 0)
  const refusJour = lignes.reduce((n, l) => n + l.refus_jour, 0)

  // Le modèle qui a le plus répondu à ses phrases, pas celui qui a le plus été
  // essayé : un modèle mort peut avoir été tenté cent fois sans jamais parler.
  const gagnant = commandes
    .filter((l) => l.reussis > 0)
    .sort((a, b) => b.reussis - a.reussis)[0]
  const modele = gagnant?.modele ?? null

  const msMedian = gagnant?.ms_median ?? null
  // `rang > 0` = ce n'est pas le principal qui a répondu. Une ligne d'avant la
  // migration 0025 n'a pas de rang : on ne prétend rien plutôt que d'alerter à
  // tort sur un historique qu'on ne sait pas lire.
  const surSecours = (gagnant?.rang ?? 0) > 0

  return {
    phrases,
    jetons,
    modele,
    surSecours,
    refusMinute,
    refusJour,
    msMedian,
    marge: margeDe(modele, phrases, refusJour),
    alerte: alerteDe({ modele, surSecours, refusJour, refusMinute, msMedian }),
  }
}

/**
 * La réponse à « à combien de temps de discussion ça équivaut », en n'affirmant
 * que ce qu'on sait.
 *
 * Sur l'offre gratuite il n'y a pas de solde : il y a un nombre de phrases par
 * jour, qu'on ne connaît que si on l'a touché. Trois cas, trois phrases — et
 * jamais de pourcentage d'un plafond supposé.
 */
export function margeDe(
  modele: string | null,
  phrases: number,
  refusJour: number,
): string {
  if (!modele) return "Aucune phrase aujourd'hui."

  if (refusJour > 0) {
    return "Le quota du jour est épuisé sur au moins un modèle : Jarvis bascule sur ses secours, et repartira à zéro demain."
  }

  const p = PLAFONDS_MESURES[modele]
  if (p?.parJour) {
    const reste = Math.max(0, p.parJour - phrases)
    return `${reste} phrase${reste > 1 ? "s" : ""} avant le plafond du jour (${p.parJour}, mesuré).`
  }
  if (p?.auMoinsParJour) {
    const plancher = Math.max(p.auMoinsParJour, phrases)
    return `Aucun plafond journalier connu sur ce modèle : au moins ${plancher} phrases passent dans une journée, mesuré, et tu en es à ${phrases}.`
  }
  return `Plafond journalier jamais mesuré sur ce modèle. ${phrases} phrase${phrases > 1 ? "s" : ""} aujourd'hui, sans refus.`
}

/**
 * Ce qui mérite de le déranger — et surtout ce qui ne le mérite pas.
 *
 * Un bandeau qui s'allume tous les jours n'est plus lu, et c'est la panne qu'on
 * ne verra pas. Un refus « par minute » isolé, par exemple, est le
 * fonctionnement NORMAL quand il enchaîne vite : il se lève tout seul en
 * soixante secondes et ne se signale pas.
 */
export function alerteDe(e: {
  modele: string | null
  surSecours: boolean
  refusJour: number
  refusMinute: number
  msMedian: number | null
}): Alerte | null {
  if (e.refusJour > 0) {
    return {
      niveau: "rouge",
      texte:
        "Un quota du JOUR est vide. C'est ce qui t'a laissé sans Jarvis le 3 septembre : ça ne se lève pas tout seul avant demain.",
    }
  }
  if (e.surSecours) {
    return {
      niveau: "orange",
      texte: `Tes phrases passent par un secours (${e.modele}) : le modèle principal ne répond pas.`,
    }
  }
  // L'app abandonne à 25 s. Au-delà de 8 s de médiane, la conversation n'en est
  // déjà plus une — et c'est la gêne qu'il signale le plus souvent.
  if (e.msMedian !== null && e.msMedian > 8000) {
    return {
      niveau: "orange",
      texte: `Jarvis met ${(e.msMedian / 1000).toFixed(1)} s à répondre en moyenne. Au-delà de 25 s, l'app abandonne.`,
    }
  }
  return null
}
