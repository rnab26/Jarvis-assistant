import { Mic } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { constructeurDictee, messageErreurDictee } from "@/lib/dicteeChamp"

/**
 * Le micro du champ de commentaire. Un appui, une écoute, un résultat ajouté
 * au texte — l'API navigateur directement, en one-shot : pas le moteur
 * d'écoute de Jarvis (veille, mot-clé, session Capacitor), démesuré pour
 * dicter dans un champ.
 */
export function BoutonDictee({
  cible,
  onResultat,
}: {
  cible: string
  onResultat: (segment: string) => void
}) {
  const [enEcoute, setEnEcoute] = useState(false)
  const recoRef = useRef<SpeechRecognition | null>(null)

  // Coupe le micro si la question disparaît (répondue, ou la carte se
  // referme) pendant qu'on dicte encore.
  useEffect(() => {
    return () => {
      recoRef.current?.abort()
      recoRef.current = null
    }
  }, [])

  function demarrer() {
    const Ctor = constructeurDictee()
    if (!Ctor) {
      toast.error("La dictée n'est pas disponible sur ce navigateur.", {
        description: "Écris ton commentaire directement dans le champ.",
      })
      return
    }
    const reco = new Ctor()
    reco.lang = "fr-FR"
    reco.continuous = false
    reco.interimResults = false
    reco.maxAlternatives = 1

    reco.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) onResultat(transcript)
    }
    reco.onerror = (event) => {
      const message = messageErreurDictee(event.error)
      if (message) toast.error(message)
    }
    reco.onend = () => {
      setEnEcoute(false)
      recoRef.current = null
    }

    try {
      reco.start()
      recoRef.current = reco
      setEnEcoute(true)
    } catch {
      toast.error("Impossible de démarrer le micro, réessaie.")
    }
  }

  function arreter() {
    recoRef.current?.stop()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="absolute right-1 top-1"
      aria-pressed={enEcoute}
      aria-label={
        enEcoute
          ? "En écoute… appuie pour arrêter"
          : `Dicter ton commentaire sur : ${cible.slice(0, 60)}`
      }
      onClick={enEcoute ? arreter : demarrer}
    >
      <Mic className={`size-4 ${enEcoute ? "animate-pulse text-destructive" : "text-muted-foreground"}`} />
    </Button>
  )
}
