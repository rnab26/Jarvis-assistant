import { useTheme } from "next-themes"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { estChoixTheme, THEME_KEY, type ChoixTheme } from "@/lib/theme"

/**
 * Le thème suit le réglage PARTOUT, pas seulement quand Paramètres est
 * ouvert (chantier 8e1da88b, 23 sept. 2026).
 *
 * next-themes garde son choix en mémoire et ne relit le stockage qu'au
 * démarrage. Cette relecture vivait dans la carte « Thème » de Paramètres :
 * « mets le thème sombre » dit à la voix depuis l'onglet Tâches écrivait donc
 * la valeur… et l'écran restait clair jusqu'au redémarrage. Même chose pour
 * un thème changé sur un autre appareil (réglages en direct, e687f0e2).
 *
 * Monté UNE fois, sous le ThemeProvider (App.tsx) : c'est la seule relecture
 * du thème de l'app — ne la recopie pas dans une carte.
 */
export function ThemeEnDirect() {
  const { theme, setTheme } = useTheme()
  useRelireApresRestauration(() => {
    try {
      const recu = localStorage.getItem(THEME_KEY)
      // Clé absente = remise à zéro des réglages : on retombe sur « comme le
      // téléphone », sinon l'écran garderait le thème choisi avant.
      const cible: ChoixTheme = estChoixTheme(recu) ? recu : "system"
      if (cible !== theme) setTheme(cible)
    } catch {
      // Stockage illisible : on garde le thème en cours.
    }
  })
  return null
}
