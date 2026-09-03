import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import { chercherMotCle } from "@/lib/motCle"

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
    const w = window as unknown as {
      lancer: () => void
      lancerMotCle: () => void
      lancerParDessus: () => void
      arreter: () => void
    }
    w.arreter = stop
    w.lancer = () => {
      setResultat("")
      listen()
        .then((texte) => setResultat(`OK:${texte}`))
        .catch((e: Error) => setResultat(`ERR:${e.message}`))
    }
    // L'écoute du mot-clé, montée comme dans MicButton : elle doit rendre la
    // main dès que « Jarvis » est reconnu, sans attendre le silence.
    w.lancerMotCle = () => {
      setResultat("")
      ;(window as unknown as { __partiels: string[] }).__partiels = []
      listen("wake", {
        arreterSi: (texte) => chercherMotCle(texte).trouve,
        onTexte: (texte) => (window as unknown as { __partiels: string[] }).__partiels.push(texte),
      })
        .then((texte) => setResultat(`OK:${texte}`))
        .catch((e: Error) => setResultat(`ERR:${e.message}`))
    }
    // Un appui sur le cœur pendant la rafale du mot-clé : la seconde écoute
    // doit RELEVER la première, jamais tourner en même temps qu'elle.
    w.lancerParDessus = () => {
      setResultat("")
      w.lancerMotCle()
      listen("command")
        .then((texte) => setResultat(`OK:${texte}`))
        .catch((e: Error) => setResultat(`ERR:${e.message}`))
    }
  }, [listen, stop])

  return <div id="resultat">{resultat}</div>
}

createRoot(document.getElementById("root")!).render(<BancDEssai />)
