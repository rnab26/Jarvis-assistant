import { toast } from "sonner"
import type { EtatChantier } from "@/hooks/useDevItems"

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
 */
export function proposerAnnulation(
  message: string,
  etats: EtatChantier[],
  restaurer: (etats: EtatChantier[]) => Promise<void>,
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
