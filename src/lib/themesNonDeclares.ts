// Relatif avec extension : vérifiable sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite (même contrainte que
// doublonsExistants.ts).
import { cleTheme } from "./themeChantier.ts"
import type { DevItem, DevSection } from "@/types/database"

/**
 * Les thèmes portés par des chantiers, sans section déclarée pour les
 * accueillir (chantier 765af020, 6 sept. 2026).
 *
 * `theme` est du texte libre et c'est lui que tout le projet lit : le hook de
 * démarrage, la commande vocale, les scripts SQL. `dev_sections` porte ce que
 * le texte libre ne sait pas porter — l'ordre et la description. Un thème
 * sans section déclarée ne peut donc être ni réordonné, ni renommé depuis
 * l'app, ni décrit : c'est un rangement à moitié, et rien ne le signalait.
 *
 * MESURÉ, PAS SUPPOSÉ : au 6 sept. 2026, cinq thèmes réels étaient dans ce
 * cas (Site de Mélissa, Le cockpit, Comportement, Intégration IA, Tâches et
 * rappels) — trouvés par la requête que porte la note du chantier, pas
 * devinés. La dérive vient d'un thème écrit librement (voix, SQL d'une
 * session, saisie) sans que rien ne crée la section correspondante.
 */

export interface ThemeNonDeclare {
  theme: string
  chantiers: number
}

/** Les thèmes actifs (chantiers non archivés) qu'aucune section ne porte,
 * les plus fréquents d'abord — celui qui a le plus de chantiers est celui
 * qui coûte le plus cher à laisser sans section. */
export function themesNonDeclares(items: DevItem[], sections: DevSection[]): ThemeNonDeclare[] {
  const clesDeclarees = new Set(sections.map((s) => cleTheme(s.nom)))
  const comptes = new Map<string, ThemeNonDeclare>()

  for (const item of items) {
    if (item.archived_at || !item.theme) continue
    const cle = cleTheme(item.theme)
    if (clesDeclarees.has(cle)) continue
    const existant = comptes.get(cle)
    if (existant) existant.chantiers++
    else comptes.set(cle, { theme: item.theme, chantiers: 1 })
  }

  return [...comptes.values()].sort((a, b) => b.chantiers - a.chantiers)
}
