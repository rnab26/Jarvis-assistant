/**
 * Identité de la build en cours d'exécution, injectée à la compilation par
 * la CI. Sert à répondre à une question que Raphaël ne pouvait pas trancher
 * avant : "est-ce que l'APK que je viens d'installer est vraiment la
 * nouvelle ?" — l'app affiche maintenant sa propre version, donc une
 * installation sans effet se voit immédiatement.
 */

/** Hash du commit sur lequel ce build a été fait — "dev" en local. */
export const COMMIT_SHA = import.meta.env.VITE_COMMIT_SHA ?? "dev"

/** Numéro de build (= numéro de run du workflow Android, = versionCode de
 * l'APK). Absent sur le web : seul le workflow Android le renseigne. */
export const BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER ?? null

/** Version lisible de l'APK, identique au versionName Android
 * (ex. "2026.09.03-b33-c42dcc9"). */
export const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION ?? null

/** Date de construction, ISO 8601 UTC. */
export const BUILD_DATE = import.meta.env.VITE_BUILD_DATE ?? null

export const SHORT_SHA = COMMIT_SHA === "dev" ? "dev" : COMMIT_SHA.slice(0, 7)

/** "3 sept. 2026 à 07:15" — la date compte plus que le hash pour Raphaël :
 * c'est ce qui lui dit d'un coup d'œil si son app date d'hier. */
export function formatBuildDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Libellé complet de la version qui tourne, tel qu'affiché dans Paramètres. */
export function versionInstallee(): string {
  if (COMMIT_SHA === "dev") return "développement (build local)"
  const base = BUILD_VERSION ?? SHORT_SHA
  const date = formatBuildDate(BUILD_DATE)
  return date ? `${base} · ${date}` : base
}
