import { registerPlugin } from "@capacitor/core"

/**
 * Déléguer le clic à l'écran à Tasker + son greffon AutoInput, au lieu du
 * service d'accessibilité maison — pour le CLIC seulement.
 *
 * D'OÙ ÇA VIENT. Décision de Raphaël, 18 sept. 2026 (chantier d9ffb735),
 * confirmée après recherche (rapport 77051ba6, pas devinée) : sur les
 * formulaires dynamiques et les IDs générés à l'exécution, AutoInput
 * relocalise l'élément AU MOMENT DU CLIC par son texte, plutôt que par un
 * rang figé à la lecture — exactement le cas où
 * `JarvisAccessibiliteService.cliquer()` refuse en « ecran_change » parce
 * que le libellé attendu n'est plus au même rang. Paiement unique, déjà
 * installés et configurés côté téléphone (dev_log, 18 sept. 2026).
 *
 * CE QUE ÇA NE TOUCHE PAS. Le « reviens en arrière » reste
 * `JarvisAccessibiliteService.retour()`, inchangé : le rapport de recherche
 * cite une source (forum officiel Tasker) documentant qu'AutoInput CASSE les
 * boutons Retour/Accueil/Récents sur Samsung One UI 7 — ne l'y ajoute pas.
 * Ni la lecture d'écran, ni le défilement, ni la liste noire (appliquée AVANT
 * cette décision, dans `controleEcran.ts`, quel que soit le chemin choisi
 * ensuite).
 *
 * LE RÉGLAGE ET L'ÉTAT NE SE CONFONDENT JAMAIS. `delegationVoulue()` est ce
 * que Raphaël a choisi ; `EtatDelegationTasker` est ce qui est RÉELLEMENT
 * installé, lu du système à chaque fois — un réglage resté activé après
 * avoir désinstallé Tasker ne doit jamais faire croire que la délégation
 * marche encore. `delegationActive()` combine les deux, et c'est SEULEMENT
 * son résultat qui doit être transmis au plugin natif.
 *
 * REPLI OBLIGATOIRE, ASSURÉ CÔTÉ NATIF (TaskerDelegation.java) : si Tasker ou
 * AutoInput est absent, pas configuré, ou ne répond pas dans le délai,
 * `AccessibilitePlugin.cliquer()` retombe sur `JarvisAccessibiliteService`
 * sans que rien ne casse — exactement comme avant ce chantier.
 */

export interface EtatDelegationTasker {
  taskerInstalle: boolean
  autoInputInstalle: boolean
}

interface DelegationTaskerPlugin {
  etat(): Promise<EtatDelegationTasker>
}

/** Pont vers android/.../DelegationTaskerPlugin.java. N'existe que dans
 * l'app empaquetée. */
export const DelegationTasker = registerPlugin<DelegationTaskerPlugin>("DelegationTasker")

export const CLE_DELEGATION_TASKER = "jarvis_delegation_tasker"

/** Le nom de tâche et la variable que la recette affichée dans Paramètres
 * (DelegationTasker.tsx) demande à Raphaël de créer dans l'app Tasker —
 * IDENTIQUES, caractère pour caractère, à `TaskerDelegation.NOM_TACHE` et
 * `TaskerDelegation.NOM_VARIABLE_CIBLE` côté Android. Une seule source ne
 * peut pas exister entre TypeScript et Java : `scripts/verifier-ecran.ts`
 * relit les deux fichiers et refuse qu'ils divergent. */
export const NOM_TACHE_TASKER = "JarvisClic"
export const NOM_VARIABLE_CIBLE_TASKER = "%cible"

/** Défaut à faux, comme tout interrupteur de ce genre dans le projet
 * (la bulle, les sessions autonomes…) : une capacité nouvelle ne s'active
 * pas toute seule, Raphaël l'allume depuis Paramètres une fois qu'il a
 * vérifié que Tasker et AutoInput répondent bien chez lui. */
export function delegationVoulue(): boolean {
  try {
    return localStorage.getItem(CLE_DELEGATION_TASKER) === "1"
  } catch {
    return false
  }
}

/** Les deux applications sont nécessaires : l'une sans l'autre ne clique
 * pas (Tasker seul n'a pas la vue de l'écran, AutoInput ne se déclenche pas
 * tout seul par intent). */
export function delegationDisponible(etat: EtatDelegationTasker | null): boolean {
  return !!etat && etat.taskerInstalle && etat.autoInputInstalle
}

/** Ce qui doit VRAIMENT partir vers Tasker pour le prochain clic : le
 * réglage ET la disponibilité réelle, jamais l'un sans l'autre. */
export function delegationActive(etat: EtatDelegationTasker | null, voulue: boolean): boolean {
  return voulue && delegationDisponible(etat)
}

export type SituationDelegationTasker =
  | "hors_app"
  | "non_installe"
  | "installe_desactive"
  | "active"

export function situationDelegationTasker(
  disponible: boolean,
  etat: EtatDelegationTasker | null,
  voulue: boolean,
): SituationDelegationTasker {
  if (!disponible || !etat) return "hors_app"
  if (!delegationDisponible(etat)) return "non_installe"
  return voulue ? "active" : "installe_desactive"
}

/** Ce qu'on dit sous l'interrupteur, selon la situation. */
export function phraseDelegationTasker(
  situation: SituationDelegationTasker,
  etat: EtatDelegationTasker | null,
): string {
  switch (situation) {
    case "hors_app":
      return "Cette délégation n'existe que dans l'application installée sur le téléphone."
    case "non_installe": {
      const manque = [
        !etat?.taskerInstalle ? "Tasker" : null,
        !etat?.autoInputInstalle ? "son greffon AutoInput" : null,
      ].filter((m): m is string => m !== null)
      return `Il manque ${manque.join(" et ")} sur ce téléphone — les deux sont des applications payantes (paiement unique), à installer avant de pouvoir activer cette délégation.`
    }
    case "installe_desactive":
      return "Tasker et AutoInput sont installés. Active l'interrupteur pour que Jarvis leur délègue le clic sur l'écran des autres applications."
    case "active":
      return "Activée : pour cliquer sur l'écran d'une autre application, Jarvis passe d'abord par Tasker et AutoInput — plus fiables sur les écrans qui changent — et revient à son propre service si Tasker ne répond pas."
  }
}

/** L'état RÉEL, lu du système. Jamais un réglage : ce sont deux applications
 * tierces, désinstallables à tout moment sans que Jarvis en soit prévenu. */
export async function etatDelegationTasker(): Promise<EtatDelegationTasker | null> {
  try {
    return await DelegationTasker.etat()
  } catch {
    return null
  }
}
