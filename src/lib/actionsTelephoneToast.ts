import { toast } from "sonner"

/**
 * « Je fais ça — Annuler », pendant quelques secondes, puis on y va.
 *
 * Ce n'est PAS une confirmation : rien n'attend une réponse, l'action part
 * toute seule à la fin du décompte. C'est la moitié visible du compromis
 * décrit dans src/lib/actionsTelephoneFenetre.ts — Raphaël a écarté toute
 * question bloquante, mais une commande mal entendue reste une commande
 * qu'il n'a pas donnée.
 *
 * Le décompte est réaffiché chaque seconde : un bandeau figé ne dit pas
 * combien de temps il reste pour l'arrêter, donc on n'essaie même pas.
 */
export function attendreOuAnnuler(phrase: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `jarvis-fenetre-${Date.now()}`
    let fini = false
    let restant = Math.max(1, Math.round(ms / 1000))
    let tic: ReturnType<typeof setInterval> | null = null
    let minuteur: ReturnType<typeof setTimeout> | null = null

    function terminer(continuer: boolean) {
      if (fini) return
      fini = true
      if (tic) clearInterval(tic)
      if (minuteur) clearTimeout(minuteur)
      toast.dismiss(id)
      resolve(continuer)
    }

    function afficher() {
      toast(phrase, {
        id,
        description: `Annulable pendant ${restant} s`,
        // Un peu plus long que la fenêtre : c'est nous qui fermons, pas
        // sonner — sinon le bandeau disparaîtrait avant la fin du décompte.
        duration: ms + 1000,
        action: { label: "Annuler", onClick: () => terminer(false) },
      })
    }

    afficher()
    tic = setInterval(() => {
      restant -= 1
      if (restant > 0) afficher()
    }, 1000)
    minuteur = setTimeout(() => terminer(true), ms)
  })
}
