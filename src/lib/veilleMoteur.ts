// L'interrupteur de la veille des modèles, et ce qu'on affiche de ses passes.
//
// Import relatif avec extension : ce module est lu par
// `scripts/verifier-veille-modele.ts` sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { ecrireReglage } from "./reglages.ts"

/**
 * La veille tourne par défaut, et c'est SA demande du 5 sept. 2026 : « il faut
 * que nous aussi on fasse les mises à jour automatiques en interne sans que
 * forcément je puisse le demander à chaque fois manuellement. »
 *
 * L'interrupteur sert donc à GELER, pas à activer. Et il gèle vraiment : la
 * valeur voyage jusqu'à la table `reglages` (d'où `ecrireReglage`, jamais
 * `localStorage.setItem`), et c'est LÀ que le serveur la lit — la veille ne
 * tourne pas sur son téléphone. Une écriture locale n'éteindrait rien du tout.
 */
export const VEILLE_KEY = "jarvis_moteur_auto"
export const VEILLE_PAR_DEFAUT = true

export function lireVeille(): boolean {
  try {
    const v = localStorage.getItem(VEILLE_KEY)
    if (v === null || v === "") return VEILLE_PAR_DEFAUT
    return v !== "false"
  } catch {
    return VEILLE_PAR_DEFAUT
  }
}

export function ecrireVeille(actif: boolean) {
  ecrireReglage(VEILLE_KEY, actif ? "true" : "false")
}

export interface PasseVeille {
  id: string
  demarre_at: string
  fini_at: string | null
  verdict: string
  detail: string | null
}

export interface MoteurChoisi {
  role: string
  modele: string
  secours: string[]
  promu_at: string
  promu_par: string
  raison: string | null
}

export const LIBELLE_VERDICT: Record<string, string> = {
  en_cours: "en cours",
  rien_a_faire: "rien à changer",
  promotion: "nouveau modèle",
  retour_arriere: "retour en arrière",
  gelee: "gelée",
  echec: "en échec",
}

export interface EtatVeilleAffiche {
  ton: "ok" | "alerte" | "eteint" | "jamais"
  titre: string
  detail: string
}

/** Au-delà, une veille censée passer tous les jours ne passe manifestement plus. */
export const SILENCE_ANORMAL_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Ce qu'on lui dit en une ligne, sans jamais confondre deux silences.
 *
 * La distinction qui compte, et c'est la même que pour les sessions
 * autonomes : « il n'y avait rien de neuf » et « la veille ne tourne plus
 * depuis trois jours » se ressemblent parfaitement quand on ne regarde que
 * l'absence de changement. Ici la première est normale et la seconde est une
 * panne — il faut donc les écrire différemment.
 */
export function etatDeLaVeille(
  passes: PasseVeille[],
  choix: MoteurChoisi | null,
  actif: boolean,
  maintenant: Date,
): EtatVeilleAffiche {
  const surQuoi = choix
    ? `Jarvis répond avec ${choix.modele}${choix.secours.length ? `, secours ${choix.secours.join(" puis ")}` : ""}.`
    : "Jarvis répond avec le modèle écrit dans son code : la veille n'a encore rien changé."

  if (!actif) {
    return {
      ton: "eteint",
      titre: "Modèle gelé",
      detail: `${surQuoi} Rien ne changera tant que tu n'auras pas rallumé.`,
    }
  }

  const derniere = passes[0]
  if (!derniere) {
    return {
      ton: "jamais",
      titre: "Aucune passe pour l'instant",
      detail: `${surQuoi} La première partira après une de tes phrases.`,
    }
  }

  const silence = maintenant.getTime() - new Date(derniere.demarre_at).getTime()
  if (silence > SILENCE_ANORMAL_MS) {
    const jours = Math.floor(silence / (24 * 60 * 60 * 1000))
    return {
      ton: "alerte",
      titre: `Plus rien ne passe depuis ${jours} jours`,
      detail: `${surQuoi} La veille devrait passer chaque jour : quelque chose l'empêche.`,
    }
  }

  if (derniere.verdict === "echec") {
    return {
      ton: "alerte",
      titre: "La dernière passe a échoué",
      detail: `${surQuoi} ${derniere.detail ?? ""}`.trim(),
    }
  }

  if (derniere.verdict === "retour_arriere") {
    return {
      ton: "alerte",
      titre: "Retour au modèle précédent",
      detail: `${surQuoi} ${derniere.detail ?? ""}`.trim(),
    }
  }

  return {
    ton: "ok",
    titre: derniere.verdict === "promotion" ? "Nouveau modèle adopté" : "Rien à changer",
    detail: `${surQuoi} ${derniere.detail ?? ""}`.trim(),
  }
}
