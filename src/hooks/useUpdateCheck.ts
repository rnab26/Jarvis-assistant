import { useEffect, useState } from "react"
import { COMMIT_SHA } from "@/lib/version"

type UpdateStatus = "checking" | "up-to-date" | "update-available" | "unknown"

const REPO = "rnab26/Jarvis-assistant"
const BRANCH = "claude/new-session-rn6puh"

/**
 * Compare le commit sur lequel ce build a été fait (injecté par la CI) au
 * dernier commit publié sur la branche, via l'API GitHub publique (pas
 * d'auth nécessaire, lecture seule). Sert à afficher "à jour" ou "nouvelle
 * version disponible" dans Paramètres — l'app ne se met jamais à jour
 * toute seule, c'est juste une indication pour savoir s'il faut retélécharger.
 */
export function useUpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus>(
    COMMIT_SHA === "dev" ? "unknown" : "checking",
  )

  useEffect(() => {
    if (COMMIT_SHA === "dev") return
    let cancelled = false

    fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`)
      .then((res) => {
        if (!res.ok) throw new Error("GitHub API error")
        return res.json()
      })
      .then((data: { sha?: string }) => {
        if (cancelled || !data.sha) return
        setStatus(data.sha === COMMIT_SHA ? "up-to-date" : "update-available")
      })
      .catch(() => {
        if (!cancelled) setStatus("unknown")
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { status }
}
