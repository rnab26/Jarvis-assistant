/**
 * Clair, sombre, ou comme le téléphone.
 *
 * La palette sombre était écrite depuis le début dans `src/index.css`
 * (bloc `.dark`, une quarantaine de couleurs), et absolument rien ne
 * pouvait l'activer : aucun composant n'a jamais posé la classe `dark`.
 * Jarvis restait donc blanc en pleine nuit, alors que le travail était déjà
 * fait.
 *
 * On passe par next-themes, déjà installé et déjà lu par les messages
 * (`components/ui/sonner.tsx`) : sans lui, un toast serait resté clair
 * au-dessus d'un écran sombre.
 *
 * La clé de stockage est la nôtre, et pas celle par défaut de la
 * bibliothèque : c'est ce qui la fait entrer dans les réglages recopiés en
 * base (src/lib/reglages.ts), donc survivre à une réinstallation et suivre
 * Raphaël entre le web et le téléphone.
 */
export const THEME_KEY = "jarvis_theme"

export type ChoixTheme = "light" | "dark" | "system"

export const CHOIX_THEME: { valeur: ChoixTheme; label: string; aide: string }[] = [
  { valeur: "light", label: "Clair", aide: "Toujours clair." },
  { valeur: "dark", label: "Sombre", aide: "Toujours sombre." },
  {
    valeur: "system",
    label: "Comme le téléphone",
    aide: "Suit le réglage d'Android, y compris son passage automatique le soir.",
  },
]

export function estChoixTheme(valeur: unknown): valeur is ChoixTheme {
  return valeur === "light" || valeur === "dark" || valeur === "system"
}
