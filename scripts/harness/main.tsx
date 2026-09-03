import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"

/**
 * Banc d'essai du moteur d'écoute — pas une page de l'app.
 *
 * Le micro est la partie de Jarvis la plus difficile à vérifier : il faut un
 * appareil, une voix, du silence chronométré. Cette page monte le hook seul
 * et expose deux commandes au test, qui remplace le moteur de reconnaissance
 * par un faux qu'il pilote au millième de seconde
 * (`node scripts/verifier-ecoute-web.mjs`).
 */
function BancDEssai() {
  const { listen, stop } = useSpeechRecognition()
  const [resultat, setResultat] = useState("")

  useEffect(() => {
    const w = window as unknown as { lancer: () => void; arreter: () => void }
    w.arreter = stop
    w.lancer = () => {
      setResultat("")
      listen()
        .then((texte) => setResultat(`OK:${texte}`))
        .catch((e: Error) => setResultat(`ERR:${e.message}`))
    }
  }, [listen, stop])

  return <div id="resultat">{resultat}</div>
}

createRoot(document.getElementById("root")!).render(<BancDEssai />)
