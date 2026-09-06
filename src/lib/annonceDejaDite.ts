/**
 * Coordonne l'annonce parlée pendant la fenêtre d'annulation
 * (executerActionTelephone, src/lib/actionsTelephoneVocales.ts) avec la
 * lecture de la réponse finale que fait MicButton : la même phrase ne doit
 * pas être dite deux fois (chantier f44c6673, 6 sept. 2026).
 *
 * Une variable de module suffit : il n'y a jamais deux commandes du
 * téléphone en vol en même temps sur un seul appareil.
 */

let derniere: string | null = null

/** À appeler juste après avoir fait parler l'annonce. */
export function marquerAnnonceParlee(phrase: string): void {
  derniere = phrase.trim()
}

/**
 * Vrai si `reponse` est exactement l'annonce qui vient d'être dite — auquel
 * cas MicButton doit l'AFFICHER mais ne pas la relire à voix haute. Ne sert
 * qu'une fois : une deuxième réponse identique, plus tard, est une coïncidence
 * ordinaire (« J'ouvre Waze. » redemandé), pas un doublon à taire.
 */
export function estDejaAnnoncee(reponse: string): boolean {
  const dite = derniere
  derniere = null
  return dite !== null && dite === reponse.trim()
}
