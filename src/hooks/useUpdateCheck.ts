import { useCallback, useEffect, useState } from "react"
import { BUILD_NUMBER, COMMIT_SHA } from "@/lib/version"

export type UpdateStatus = "checking" | "up-to-date" | "update-available" | "unknown"

/** Ce que la CI a réellement publié comme dernière APK. */
export type PublishedBuild = {
  commit: string | null
  version: string | null
  buildNumber: number | null
  date: string | null
}

const REPO = "rnab26/Jarvis-assistant"
const RELEASE_TAG = "latest-debug"

/** Le workflow Android écrit ces lignes dans le corps de la release
 * (cf. .github/workflows/android-build.yml). On les relit ici : c'est la
 * seule source qui décrit l'APK VRAIMENT téléchargeable. */
function lireChamp(body: string, champ: string): string | null {
  const m = body.match(new RegExp(`^\\s*${champ}:\\s*(.+?)\\s*$`, "im"))
  return m ? m[1] : null
}

/**
 * Compare la build en cours d'exécution à la dernière APK RÉELLEMENT
 * PUBLIÉE (release "latest-debug"), via l'API GitHub publique (lecture
 * seule, pas d'auth).
 *
 * Avant, la comparaison se faisait avec le dernier commit de la branche.
 * C'était faux dès qu'un commit ne produisait pas d'APK (le workflow avait
 * un filtre "paths") ou qu'un build échouait : l'app annonçait une
 * nouvelle version qui n'existait pas, Raphaël retéléchargeait exactement
 * le même fichier et ne voyait évidemment aucun changement. Le filtre a
 * été retiré du workflow, et on compare désormais à la release elle-même —
 * les deux corrections attaquent la même cause.
 */
export function useUpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus>(
    COMMIT_SHA === "dev" ? "unknown" : "checking",
  )
  const [published, setPublished] = useState<PublishedBuild | null>(null)
  const [verifieA, setVerifieA] = useState<Date | null>(null)

  const check = useCallback(async () => {
    if (COMMIT_SHA === "dev") {
      setStatus("unknown")
      setVerifieA(new Date())
      return
    }
    setStatus("checking")
    // Quand la réponse arrive en 200 ms et que le verdict ne change pas
    // (le cas normal : on est déjà à jour), l'écran reste strictement
    // identique et le bouton passe pour mort — signalé comme cassé alors
    // qu'il fonctionnait. On garde donc l'état "Vérification" assez
    // longtemps pour qu'il se voie, et on horodate le résultat.
    const debut = Date.now()
    const rendreVisible = async () => {
      const reste = 600 - (Date.now() - debut)
      if (reste > 0) await new Promise((r) => setTimeout(r, reste))
      setVerifieA(new Date())
    }
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`,
      )
      if (!res.ok) throw new Error("GitHub API error")
      const data: { body?: string; assets?: { updated_at?: string }[] } = await res.json()
      const body = data.body ?? ""

      const commit = lireChamp(body, "commit")
      const buildTexte = lireChamp(body, "build")
      const buildNumber = buildTexte && /^\d+$/.test(buildTexte) ? Number(buildTexte) : null
      const infos: PublishedBuild = {
        commit,
        version: lireChamp(body, "version"),
        buildNumber,
        // La date d'upload de l'APK reste juste même si le corps de la
        // release n'a pas encore le nouveau format.
        date: lireChamp(body, "date") ?? data.assets?.[0]?.updated_at ?? null,
      }
      setPublished(infos)

      if (!commit) {
        // Release publiée par l'ancienne version du workflow : rien de
        // fiable à comparer, ne pas inventer un verdict.
        setStatus("unknown")
      } else if (commit === COMMIT_SHA) {
        setStatus("up-to-date")
      } else {
        const installe = BUILD_NUMBER ? Number(BUILD_NUMBER) : null
        setStatus(
          installe !== null && buildNumber !== null && installe >= buildNumber
            ? "up-to-date"
            : "update-available",
        )
      }
    } catch {
      setStatus("unknown")
    }
    await rendreVisible()
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  return { status, published, verifieA, recheck: check }
}
