import { ecrireReglage } from "./reglages.ts"

/**
 * Le mode simplifié du cockpit : une bascule, pas un second écran.
 *
 * Plainte de Raphaël, 17 sept. 2026, deux captures à l'appui : « pourquoi
 * j'ai plein d'informations, pourquoi j'ai pas de questions simples
 * auxquelles je peux répondre […] faut que ce soit plus clair, plus simple,
 * plus synthétisé, questions, réponses et on next. » Activé, ce réglage
 * masque tout le reste du cockpit et ne garde que « Ce qui attend ta
 * décision », une question à la fois (`CeQuiAttendTaDecision`, prop
 * `uneALaFois`). Rien n'est supprimé : c'est un filtre d'affichage, il se
 * désactive aussi facilement qu'il s'active, et les sessions Claude Code qui
 * lisent la base ne le voient jamais.
 */
export const MODE_SIMPLIFIE_KEY = "jarvis_cockpit_simplifie"

export function lireModeSimplifie(): boolean {
  try {
    return localStorage.getItem(MODE_SIMPLIFIE_KEY) === "true"
  } catch {
    return false
  }
}

export function ecrireModeSimplifie(actif: boolean) {
  ecrireReglage(MODE_SIMPLIFIE_KEY, actif ? "true" : "false")
}
