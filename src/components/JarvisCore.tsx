import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { CORE_PAR_DEFAUT, lireCoreImage } from "@/lib/coreImage"

/** Les états du micro, auxquels le cœur réagit. */
export type CoreEtat =
  | "idle"
  | "wake-listening"
  | "listening"
  | "processing"
  | "speaking"
  | "error"

/** Événement émis quand l'image est changée depuis les Paramètres, pour que
 * le cœur affiché ailleurs (sous le micro) se mette à jour sans rechargement. */
export const CORE_IMAGE_CHANGEE = "jarvis:core-image"

const ONDES: CoreEtat[] = ["listening", "speaking"]

interface JarvisCoreProps {
  etat?: CoreEtat
  /** Diamètre en pixels. */
  taille?: number
  className?: string
}

/**
 * Le réacteur de Jarvis : il respire en permanence, s'emballe quand Jarvis
 * écoute, envoie des ondes quand il parle, et tourne pendant qu'il réfléchit.
 */
export function JarvisCore({ etat = "idle", taille = 56, className }: JarvisCoreProps) {
  const [source, setSource] = useState(() => lireCoreImage() ?? CORE_PAR_DEFAUT)

  useEffect(() => {
    function relire() {
      setSource(lireCoreImage() ?? CORE_PAR_DEFAUT)
    }
    window.addEventListener(CORE_IMAGE_CHANGEE, relire)
    return () => window.removeEventListener(CORE_IMAGE_CHANGEE, relire)
  }, [])

  return (
    <span
      className={cn("jarvis-core", className)}
      data-etat={etat}
      style={{ width: taille, height: taille }}
      aria-hidden="true"
    >
      {etat === "processing" && <span className="jarvis-core-balayage" />}
      {ONDES.includes(etat) && (
        <>
          <span className="jarvis-core-onde" />
          <span className="jarvis-core-onde" />
          <span className="jarvis-core-onde" />
        </>
      )}
      <img
        src={source}
        alt=""
        draggable={false}
        onError={() => setSource(CORE_PAR_DEFAUT)}
      />
    </span>
  )
}
