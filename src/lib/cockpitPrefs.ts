import { estFenetreBilan, FENETRE_PAR_DEFAUT, type FenetreBilan } from "@/lib/ouJenSuis"
import { ecrireReglage } from "@/lib/reglages"

/**
 * Depuis quand « Où j'en suis » compte ce qui a été livré.
 *
 * Pourquoi c'est un réglage et pas une constante : « aujourd'hui » veut dire
 * « depuis minuit », et Raphaël travaille la nuit. À une heure du matin, dix
 * chantiers livrés dans la soirée tombent d'un coup à zéro, et le cockpit
 * annonce qu'il ne s'est rien passé au moment précis où il vient voir ce qui
 * s'est passé. « 24 h glissantes » règle ça, mais c'est un compromis
 * (« aujourd'hui » est plus net dans la tête), donc c'est à lui de choisir.
 *
 * Défaut « aujourd'hui », comme demandé dans le chantier ; le rattrapage est
 * à un appui dans Paramètres › Le cockpit.
 */
export const FENETRE_BILAN_KEY = "jarvis_cockpit_fenetre"

export function lireFenetreBilan(): FenetreBilan {
  try {
    const v = localStorage.getItem(FENETRE_BILAN_KEY)
    return estFenetreBilan(v) ? v : FENETRE_PAR_DEFAUT
  } catch {
    return FENETRE_PAR_DEFAUT
  }
}

export function ecrireFenetreBilan(valeur: FenetreBilan) {
  ecrireReglage(FENETRE_BILAN_KEY, valeur)
}
