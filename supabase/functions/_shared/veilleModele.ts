// Décider s'il faut changer de modèle — et surtout quand il ne faut pas.
//
// Chantier 66a7a233. PUR : aucun appel réseau, aucun Deno, aucune dépendance.
// C'est ce qui permet de le vérifier hors ligne
// (`scripts/verifier-veille-modele.ts`), et c'est indispensable ici : ce
// fichier peut décider tout seul, la nuit, de changer le cerveau de Jarvis.
//
// LE PIÈGE CONTRE LEQUEL TOUT CECI EST ÉCRIT. Le 4 sept. 2026, les TROIS
// modèles de Jarvis sont morts le même jour, et `ListModels` les annonçait
// encore. Un mécanisme qui adopterait un nom vu dans une liste laisserait
// Raphaël sans Jarvis, tout seul, la nuit. D'où : on ne promeut que ce qui a
// été ESSAYÉ pour de vrai, DEUX JOURS DIFFÉRENTS, et on sait revenir en
// arrière.
//
// SA LIMITE, du 5 sept. : « il ne faut pas changer les voix tout seul, sinon ça
// peut tout déglinguer d'un coup. » Ceci ne concerne QUE le modèle de langue.

/** Ce qu'un essai réel a donné pour un modèle, un jour donné. */
export interface Essai {
  modele: string
  jour: string
  repond: boolean
  appelle_outil: boolean
  controles_reussis: number
  controles_total: number
  ms_median: number | null
  plafond_jour: number | null
  plafond_minute: number | null
}

export interface EnService {
  role: string
  fournisseur: string
  modele: string
  secours: string[]
  promu_at: string
  promu_par: string
}

export interface SantePromotion {
  modele: string
  promu_at: string
  promu_par: string
  a_un_precedent: boolean
  appels: number
  echecs: number
  refus_jour: number
}

export interface EtatVeille {
  /** Le réglage BRUT, tel qu'il est en base. `null` = jamais réglé. */
  reglage: string | null
  derniere_veille: string | null
  veille_en_cours: boolean
  en_service: EnService[] | null
  sante_commande: SantePromotion | null
  essais_recents: Essai[]
  /**
   * Combien d'appels réels ont été observés ces sept derniers jours.
   *
   * Zéro veut dire qu'on ne sait PAS observer — pas que tout va bien. C'est le
   * cas tant que voice-command n'écrit pas dans `appels_modele`. Promouvoir
   * dans cet état, ce serait changer le modèle de Jarvis en ayant désactivé le
   * seul filet qui le rattrape.
   */
  appels_observes: number
}

export type VerdictVeille = "gelee" | "occupee" | "trop_tot" | "veille"

/**
 * Une journée entre deux passes. Assez pour suivre les sorties de modèles,
 * assez peu pour ne pas s'exécuter deux fois dans la même soirée.
 */
export const INTERVALLE_VEILLE_MS = 24 * 60 * 60 * 1000

/**
 * Sept jours entre deux promotions, même si un meilleur candidat se présente.
 *
 * Sans ce frein, une série de modèles « preview » publiés coup sur coup ferait
 * changer le cerveau de Jarvis tous les jours. Chaque changement est un risque,
 * et il ne les verrait passer que sous forme de comportements qui bougent sans
 * raison.
 */
export const REPOS_ENTRE_PROMOTIONS_MS = 7 * 24 * 60 * 60 * 1000

/** Il faut avoir vu au moins autant d'appels réels avant de juger une promotion. */
export const APPELS_AVANT_DE_JUGER = 10

/** Au-delà, le modèle promu est considéré comme mauvais. */
export const TAUX_ECHEC_INTOLERABLE = 0.3

/** Un modèle dont le plafond du jour est sous ce seuil ne peut pas être principal. */
export const PLAFOND_JOUR_MINIMUM = 200

/**
 * Ni un modèle trop étroit à la minute.
 *
 * Mesuré le 6 sept. 2026 : gemini-3-flash-preview est limité à 5 requêtes par
 * minute, et n'en passe qu'UNE sur une rafale de vingt. Un principal doit
 * encaisser une conversation suivie ; à 5 par minute, Raphaël s'en prendrait
 * plein la figure dès qu'il enchaîne. C'est acceptable pour un dernier
 * recours, jamais pour le modèle qui répond d'habitude.
 */
export const PLAFOND_MINUTE_MINIMUM = 10

/** Combien de jours DIFFÉRENTS un candidat doit avoir réussi. */
export const JOURS_DE_PREUVE = 2

/**
 * En dessous, on considère qu'on ne sait pas observer, et on ne promeut pas.
 *
 * Le filet du point 5 (revenir en arrière tout seul) lit `appels_modele`. S'il
 * n'y a rien à lire, promouvoir revient à changer le cerveau de Jarvis en
 * ayant débranché l'alarme.
 */
export const APPELS_OBSERVES_MINIMUM = 20

/**
 * Faut-il lancer une passe maintenant ?
 *
 * `reglage` vaut `"false"` quand Raphaël a gelé le moteur depuis Paramètres.
 * Tout le reste — `"true"`, `null`, une valeur inconnue — veut dire que la
 * veille tourne : c'est ce qu'il a demandé (« sans que forcément je puisse le
 * demander à chaque fois manuellement »), et un réglage jamais posé ne doit pas
 * se lire comme un refus.
 */
export function doitVeiller(etat: EtatVeille, maintenant: Date): VerdictVeille {
  if (etat.reglage === "false") return "gelee"
  if (etat.veille_en_cours) return "occupee"
  if (!etat.derniere_veille) return "veille"
  const depuis = maintenant.getTime() - new Date(etat.derniere_veille).getTime()
  return depuis >= INTERVALLE_VEILLE_MS ? "veille" : "trop_tot"
}

export interface Decision {
  /** Ce qu'on fait, et ce qu'on écrit dans le journal. */
  quoi: "rien" | "promouvoir" | "retour_arriere"
  raison: string
  modele?: string
  secours?: string[]
}

/**
 * Le modèle promu se comporte-t-il si mal qu'il faut revenir en arrière ?
 *
 * C'est le point 5 de sa demande. Quatre garde-fous, et il faut les quatre :
 *
 * 1. On ne défait JAMAIS un choix fait à la main. Si Raphaël ou une session a
 *    posé ce modèle, revenir dessus serait prendre le contre-pied d'une
 *    décision humaine — la faute que ce projet évite partout ailleurs.
 * 2. Sans précédent enregistré, il n'y a rien à remettre : revenir « au
 *    modèle d'avant » en le déduisant du code se tromperait dès que le code a
 *    bougé, et ce serait précisément le moment où il ne faut pas se tromper.
 * 3. ZÉRO APPEL NE VEUT PAS DIRE QUE TOUT VA BIEN, ça veut dire qu'on ne sait
 *    rien. C'est le cas tant que voice-command n'écrit pas encore dans
 *    `appels_modele`. Confondre les deux ferait dire « le nouveau modèle se
 *    porte bien » d'un modèle que personne n'a jamais appelé.
 * 4. Un refus JOURNALIER suffit à lui seul : il ne se lève pas avant demain,
 *    et c'est exactement ce qui a laissé Raphaël sans Jarvis le 3 sept.
 */
export function doitRevenirEnArriere(sante: SantePromotion | null): Decision {
  if (!sante) return { quoi: "rien", raison: "Aucun modèle promu à surveiller." }
  if (sante.promu_par !== "veille") {
    return { quoi: "rien", raison: `Le modèle ${sante.modele} a été choisi à la main : on n'y touche pas.` }
  }
  if (!sante.a_un_precedent) {
    return { quoi: "rien", raison: "Rien à remettre : aucun modèle précédent enregistré." }
  }
  if (sante.refus_jour > 0) {
    return {
      quoi: "retour_arriere",
      raison: `${sante.modele} a épuisé son quota du jour (${sante.refus_jour} refus). Ça ne se lève pas avant demain.`,
    }
  }
  if (sante.appels < APPELS_AVANT_DE_JUGER) {
    return {
      quoi: "rien",
      raison:
        sante.appels === 0
          ? `Aucun appel observé depuis la promotion de ${sante.modele} : on ne sait rien, on ne juge pas.`
          : `${sante.appels} appel(s) depuis la promotion : trop peu pour juger.`,
    }
  }
  const taux = sante.echecs / sante.appels
  if (taux > TAUX_ECHEC_INTOLERABLE) {
    return {
      quoi: "retour_arriere",
      raison: `${sante.modele} échoue ${Math.round(taux * 100)} % du temps (${sante.echecs}/${sante.appels}).`,
    }
  }
  return { quoi: "rien", raison: `${sante.modele} se porte bien (${sante.echecs}/${sante.appels} échecs).` }
}

/** Un candidat a-t-il fait ses preuves ce jour-là ? */
export function essaiConcluant(e: Essai): boolean {
  return (
    e.repond &&
    e.appelle_outil &&
    e.controles_total > 0 &&
    e.controles_reussis === e.controles_total &&
    // Un plafond journalier trop bas condamne le modèle comme principal : la
    // mémoire est morte en silence à cause d'un modèle à 20 requêtes par jour.
    (e.plafond_jour === null || e.plafond_jour >= PLAFOND_JOUR_MINIMUM) &&
    (e.plafond_minute === null || e.plafond_minute >= PLAFOND_MINUTE_MINIMUM)
  )
}

/**
 * Le meilleur candidat à promouvoir, ou rien.
 *
 * `interdits` sont les modèles qu'on ne doit pas prendre parce qu'ils servent
 * DÉJÀ ailleurs — au premier chef ceux de la mémoire. Promouvoir un modèle de
 * la mémoire au rang de principal de la commande referait exactement le
 * partage de seau qui a rendu Jarvis muet le 3 sept. 2026 à 21h28.
 */
export function meilleurCandidat(
  essais: Essai[],
  enService: string,
  interdits: string[],
): { modele: string; msMedian: number | null; jours: string[] } | null {
  const parModele = new Map<string, Essai[]>()
  for (const e of essais) {
    if (e.modele === enService || interdits.includes(e.modele)) continue
    const liste = parModele.get(e.modele) ?? []
    liste.push(e)
    parModele.set(e.modele, liste)
  }

  const retenus: Array<{ modele: string; msMedian: number | null; jours: string[] }> = []
  for (const [modele, liste] of parModele) {
    const concluants = liste.filter(essaiConcluant)
    // Des jours DIFFÉRENTS, pas des essais différents : trois essais dans la
    // même soirée ne prouvent rien de plus qu'un seul. Les trois modèles morts
    // du 4 sept. répondaient parfaitement la veille.
    const jours = [...new Set(concluants.map((e) => e.jour))].sort()
    if (jours.length < JOURS_DE_PREUVE) continue
    // Un seul essai raté, même ancien, suffit à écarter : on cherche un modèle
    // sur lequel on peut poser la parole de Jarvis, pas un candidat moyen.
    if (concluants.length !== liste.length) continue

    const latences = concluants.map((e) => e.ms_median).filter((m): m is number => m !== null)
    retenus.push({
      modele,
      msMedian: latences.length ? Math.round(latences.reduce((a, b) => a + b, 0) / latences.length) : null,
      jours,
    })
  }

  if (!retenus.length) return null
  // À preuves égales, le plus rapide : la latence est la gêne que Raphaël
  // signale le plus souvent, et un modèle lent finit par dépasser les 25 s au
  // bout desquelles l'app abandonne.
  retenus.sort((a, b) => (a.msMedian ?? Infinity) - (b.msMedian ?? Infinity))
  return retenus[0]
}

/**
 * La nouvelle chaîne : le promu en tête, l'ancien principal en premier secours.
 *
 * L'ancien redevient secours plutôt que de disparaître (point 4 de sa
 * demande) : c'est le modèle dont on sait le mieux qu'il marche. Trois au
 * total, parce qu'au-delà le budget de 25 s de l'app est dépassé avant d'avoir
 * essayé le dernier.
 */
export function nouvelleChaine(promu: string, ancien: string, secours: string[]): string[] {
  const chaine = [ancien, ...secours].filter((m) => m !== promu)
  return [...new Set(chaine)].slice(0, 3)
}

/**
 * Ce que la passe doit faire, tout compris.
 *
 * Le retour arrière passe AVANT la promotion, et ce n'est pas un détail
 * d'ordre : promouvoir un troisième modèle par-dessus un deuxième qui va mal
 * ferait perdre le seul qui marchait encore.
 */
export function decider(
  etat: EtatVeille,
  essaisDuJour: Essai[],
  /**
   * Ce que le serveur utilise EN CE MOMENT pour la commande.
   *
   * Passé en argument plutôt que lu en base, et c'est nécessaire : à la toute
   * première passe la table est vide, et une décision qui exigerait une ligne
   * ne pourrait jamais en écrire la première. L'appelant donne donc ce que le
   * fournisseur utilise réellement, ligne en base ou valeur du code.
   */
  courant: { modele: string; secours: string[]; promu_at: string },
  maintenant: Date,
): Decision {
  const memoire = etat.en_service?.find((s) => s.role === "memoire") ?? null

  const retour = doitRevenirEnArriere(etat.sante_commande)
  if (retour.quoi === "retour_arriere") return retour

  // On ne change rien tant qu'on ne saurait pas voir que ça s'est mal passé.
  if (etat.appels_observes < APPELS_OBSERVES_MINIMUM) {
    return {
      quoi: "rien",
      raison: `Seulement ${etat.appels_observes} appel(s) observé(s) sur sept jours : le retour arrière automatique serait aveugle, on ne promeut pas.`,
    }
  }

  const commande = courant
  const depuisPromotion = maintenant.getTime() - new Date(commande.promu_at).getTime()
  if (depuisPromotion < REPOS_ENTRE_PROMOTIONS_MS) {
    const jours = Math.ceil((REPOS_ENTRE_PROMOTIONS_MS - depuisPromotion) / (24 * 60 * 60 * 1000))
    return { quoi: "rien", raison: `Dernier changement trop récent : encore ${jours} jour(s) de repos.` }
  }

  const interdits = memoire ? [memoire.modele, ...memoire.secours] : []
  const candidat = meilleurCandidat([...etat.essais_recents, ...essaisDuJour], commande.modele, interdits)
  if (!candidat) {
    return { quoi: "rien", raison: `Rien de mieux que ${commande.modele} n'a fait ses preuves sur ${JOURS_DE_PREUVE} jours.` }
  }

  return {
    quoi: "promouvoir",
    modele: candidat.modele,
    secours: nouvelleChaine(candidat.modele, commande.modele, commande.secours),
    raison: `${candidat.modele} a réussi tous les contrôles les ${candidat.jours.join(" et ")}${
      candidat.msMedian ? `, en ${Math.round(candidat.msMedian)} ms` : ""
    }. ${commande.modele} devient son premier secours.`,
  }
}
