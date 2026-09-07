import { useCallback, useEffect, useRef, useState } from "react"
import { combinerStatuts, type StatutDirect } from "@/lib/etatDirect"

type Canal = { statut: StatutDirect; rebrancher: () => void }

/**
 * Le geste « Actualiser », partagé par tous les écrans qui affichent une
 * liste tenue à jour en direct.
 *
 * Chantier ce69489b, ses mots : « Les taches ne s'affichent pas en live et il
 * n'y a aucun moyen d'actualiser ».
 *
 * DEUX CHOSES, ET IL FAUT LES DEUX. Recharger la liste ne sert à rien si le
 * canal reste mort : il devrait réappuyer indéfiniment. Alors quand le direct
 * est coupé, l'appui RECONNECTE aussi. C'est ce qui distingue ce bouton d'un
 * simple rechargement.
 */
export function useActualisation(refresh: () => Promise<void> | void, canaux: readonly Canal[]) {
  const [enCours, setEnCours] = useState(false)
  const statut = combinerStatuts(canaux.map((c) => c.statut))

  // L'ÉTAT DU CANAL AU MOMENT DE L'APPUI, pas celui du rendu où la fonction a
  // été créée. `canaux` est un tableau neuf à chaque rendu : le mettre en
  // dépendance de `useCallback` referait la fonction en boucle, et l'en sortir
  // sans ref la figerait sur un état périmé — elle rebrancherait un canal déjà
  // revenu, ou pire, laisserait mort celui qui vient de tomber.
  const canauxRef = useRef(canaux)
  useEffect(() => {
    canauxRef.current = canaux
  })

  const actualiser = useCallback(async () => {
    setEnCours(true)
    try {
      // On rebranche AVANT de recharger : si le canal revient, il rejoindra
      // pendant que la requête est en vol, et tout ce qui arrive ensuite est
      // couvert. L'inverse laisserait un trou entre la fin du chargement et
      // la reconnexion.
      for (const c of canauxRef.current) if (c.statut === "coupe") c.rebrancher()
      await refresh()
    } finally {
      setEnCours(false)
    }
  }, [refresh])

  return { statut, enCours, actualiser }
}
