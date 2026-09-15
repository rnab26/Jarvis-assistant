import { toast } from "sonner"

/**
 * « Annuler », après une action qui a déplacé, archivé ou reclassé des
 * chantiers.
 *
 * Pourquoi ça compte ici : le cockpit se manipule au pouce, sur un écran où
 * les boutons font quatre millimètres, et une action groupée touche dix
 * chantiers d'un coup. Sans retour en arrière, une erreur de visée se répare
 * en rouvrant chaque chantier — à condition de se souvenir lesquels. C'est ce
 * que tous les outils de suivi proposent depuis longtemps.
 *
 * Huit secondes plutôt que les quatre par défaut : le temps de lire, de
 * comprendre que ce n'est pas ce qu'on voulait, et de viser le bouton.
 *
 * GÉNÉRIQUE depuis le 15 sept. 2026, et pas par goût de l'abstraction :
 * cocher une tâche la fait maintenant QUITTER la liste pour l'archive de sa
 * catégorie, donc elle disparaît de sa vue exactement comme un chantier
 * archivé. Écrire un second « Annuler » à côté de celui-ci, c'est accepter
 * qu'ils finissent par ne plus durer le même temps ni se comporter pareil.
 */
export function proposerAnnulation<T>(
  message: string,
  etats: T[],
  restaurer: (etats: T[]) => Promise<void>,
) {
  toast.success(message, {
    duration: 8000,
    action: {
      label: "Annuler",
      onClick: () => {
        // L'échec est déjà signalé par son propre toast : on évite seulement
        // la promesse rejetée non gérée.
        restaurer(etats).catch(() => {})
      },
    },
  })
}
