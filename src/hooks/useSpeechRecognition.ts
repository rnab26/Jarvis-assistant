import { SpeechRecognition as NativeSpeechRecognition } from "@capacitor-community/speech-recognition"
import { Capacitor } from "@capacitor/core"
import { useCallback, useRef, useState } from "react"
import { MAX_TOUR_MS, PREMIER_MOT_MS, readDialoguePrefs } from "@/lib/dialoguePrefs"
import {
  cloturerSegment,
  creerTour,
  decider,
  noterTexte,
  texteDuTour,
  type EtatTour,
  type OptionsTour,
} from "@/lib/dialogueTour"

type SpeechRecognitionCtor = new () => SpeechRecognition

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function friendlyErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Micro refusé. Autorise l'accès au micro dans les paramètres du navigateur."
    case "no-speech":
      return "Je n'ai rien entendu, réessaie."
    case "audio-capture":
      return "Aucun micro détecté sur cet appareil."
    case "network":
      return "Problème réseau pendant l'écoute, réessaie."
    default:
      return `Erreur de reconnaissance vocale : ${code}`
  }
}

const RIEN_ENTENDU = "Je n'ai rien entendu, réessaie."

function attendre(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// Dans l'app Android empaquetée (Capacitor), la webview native ne supporte
// pas l'API Web Speech (SpeechRecognition) — on passe alors par le plugin
// natif @capacitor-community/speech-recognition, qui utilise directement le
// service de reconnaissance vocale d'Android. Dans un navigateur normal
// (Chrome mobile, où le micro a déjà été validé), on garde l'API Web.
const isNative = Capacitor.isNativePlatform()

/** Écoute passive du mot-clé "Jarvis" : une phrase courte, pas une dictée. */
const WAKE_LISTEN_MS = 8000

export interface OptionsEcoute {
  /** Silence toléré en pleine phrase. Défaut : le réglage de l'utilisateur. */
  silenceMs?: number
  /** Temps laissé pour commencer à parler avant d'abandonner le tour. */
  premierMotMs?: number
  /** Appelé chaque fois que le texte entendu change (affichage en direct). */
  onTexte?: (texte: string) => void
}

/** État mutable d'un tour, dans un objet plutôt qu'en variables libres : il
 * est modifié depuis les écouteurs du moteur et relu dans la boucle. */
interface FluxEcoute {
  etat: EtatTour
  stopDemande: boolean
  erreur: string | null
}

/**
 * Écoute vocale.
 *
 * Le mode "command" ne laisse plus le moteur décider de la fin de la prise de
 * parole : il relance l'écoute tant que la personne n'a pas vraiment fait
 * silence, et accumule ce qui a été dit d'une session à l'autre. Voir
 * `src/lib/dialogueTour.ts` pour le pourquoi et la logique de décision.
 *
 * Le mode "wake" (écoute passive du mot-clé) reste une rafale courte : on
 * n'attend qu'un mot, pas une phrase dictée.
 */
export function useSpeechRecognition() {
  const [listening, setListening] = useState(false)
  // "ready" distingue la phase de démarrage du moteur natif (encore sourd
  // aux premiers mots) de l'écoute effective. Corrige le bug où le premier
  // clic sur le micro ratait le début de la phrase.
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // Un appui volontaire sur le micro pendant l'écoute vaut « j'ai fini » :
  // on clôt le tour avec ce qui a déjà été entendu, sans attendre le silence.
  const arretManuelRef = useRef(false)

  const isSupported = isNative || getSpeechRecognitionCtor() !== null

  function optionsTour(o: OptionsEcoute): OptionsTour {
    const prefs = readDialoguePrefs()
    return {
      silenceMs: o.silenceMs ?? prefs.pauseMs,
      premierMotMs: o.premierMotMs ?? PREMIER_MOT_MS,
      maxMs: MAX_TOUR_MS,
    }
  }

  // --- Android natif -------------------------------------------------------

  const preparerNatif = useCallback(async () => {
    const { available } = await NativeSpeechRecognition.available()
    if (!available) throw new Error("Reconnaissance vocale indisponible sur cet appareil.")

    const permission = await NativeSpeechRecognition.requestPermissions()
    if (permission.speechRecognition !== "granted") {
      throw new Error("Micro refusé. Autorise l'accès au micro dans les paramètres de l'app.")
    }
  }, [])

  /** Rafale courte pour le mot-clé : mode commande natif, coupe sur un silence court. */
  const ecouterWakeNatif = useCallback(async (): Promise<string> => {
    await preparerNatif()
    setListening(true)
    let filet: ReturnType<typeof setTimeout> | null = null
    const etats = await NativeSpeechRecognition.addListener("listeningState", ({ status }) =>
      setReady(status === "started"),
    )
    try {
      filet = setTimeout(() => {
        NativeSpeechRecognition.stop().catch(() => {})
      }, WAKE_LISTEN_MS)
      const resultat = await NativeSpeechRecognition.start({
        language: "fr-FR",
        maxResults: 1,
        partialResults: false,
        popup: false,
      })
      const transcript = (resultat?.matches?.[0] ?? "").trim()
      if (!transcript) throw new Error(RIEN_ENTENDU)
      return transcript
    } finally {
      if (filet) clearTimeout(filet)
      setListening(false)
      setReady(false)
      await etats.remove()
    }
  }, [preparerNatif])

  const ecouterCommandeNative = useCallback(
    async (o: OptionsEcoute): Promise<string> => {
      await preparerNatif()
      const opts = optionsTour(o)
      const flux: FluxEcoute = { etat: creerTour(Date.now()), stopDemande: false, erreur: null }
      let resoudreStop: (() => void) | undefined

      setListening(true)

      // partialResults:true active le "DICTATION_MODE" natif d'Android, dont
      // la tolérance au silence est plus longue que le mode commande — et
      // c'est aussi ce qui nous donne le texte au fil de l'eau, donc de quoi
      // mesurer nous-mêmes le silence.
      const partiels = await NativeSpeechRecognition.addListener(
        "partialResults",
        ({ matches }) => {
          const texte = matches?.[0]
          if (typeof texte !== "string") return
          const avant = flux.etat.courant
          flux.etat = noterTexte(flux.etat, texte, Date.now())
          if (flux.etat.courant !== avant) o.onTexte?.(texteDuTour(flux.etat))
        },
      )
      const etats = await NativeSpeechRecognition.addListener("listeningState", ({ status }) => {
        setReady(status === "started")
        if (status === "stopped") resoudreStop?.()
      })

      // C'est ce battement — pas Android — qui décide que la prise de parole
      // est finie.
      const battement = setInterval(() => {
        if (flux.stopDemande) return
        const decision = arretManuelRef.current
          ? "terminer"
          : decider(flux.etat, Date.now(), opts, false)
        if (decision === "terminer" || decision === "abandonner") {
          flux.stopDemande = true
          NativeSpeechRecognition.stop().catch(() => {})
          // Filet si l'événement "stopped" ne vient jamais.
          setTimeout(() => resoudreStop?.(), 1500)
        }
      }, 250)

      try {
        for (;;) {
          let filet: ReturnType<typeof setTimeout> | null = null
          const arret = new Promise<void>((resolve) => {
            resoudreStop = resolve
            const restant = opts.maxMs - (Date.now() - flux.etat.debutAt)
            filet = setTimeout(resolve, Math.max(2000, restant + 2000))
          })
          await NativeSpeechRecognition.start({
            language: "fr-FR",
            maxResults: 1,
            partialResults: true,
            popup: false,
          })
          await arret
          if (filet) clearTimeout(filet)
          // Le résultat final post-traité par Android arrive parfois juste
          // après l'événement "stopped".
          await attendre(250)
          flux.etat = cloturerSegment(flux.etat)
          o.onTexte?.(texteDuTour(flux.etat))
          if (flux.stopDemande || arretManuelRef.current) break
          if (decider(flux.etat, Date.now(), opts, true) !== "relancer") break
          // Android refuse un redémarrage immédiat : lui laisser un souffle.
          await attendre(150)
        }

        const transcript = texteDuTour(flux.etat)
        if (!transcript) throw new Error(RIEN_ENTENDU)
        return transcript
      } finally {
        clearInterval(battement)
        await NativeSpeechRecognition.stop().catch(() => {})
        setListening(false)
        setReady(false)
        await partiels.remove()
        await etats.remove()
      }
    },
    [preparerNatif],
  )

  // --- Navigateur ----------------------------------------------------------

  const ecouterWeb = useCallback(
    async (mode: "command" | "wake", o: OptionsEcoute): Promise<string> => {
      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) {
        throw new Error(
          "La reconnaissance vocale n'est pas supportée par ce navigateur (utilise Chrome sur Android).",
        )
      }

      const isWake = mode === "wake"
      const opts = optionsTour(isWake ? { silenceMs: 800, premierMotMs: WAKE_LISTEN_MS } : o)
      const flux: FluxEcoute = { etat: creerTour(Date.now()), stopDemande: false, erreur: null }
      // Le web rend un flux cumulatif : on garde nous-mêmes les résultats
      // finaux pour qu'ils survivent au redémarrage du moteur.
      const finaux: string[] = []
      const courante: { reco: SpeechRecognition | null } = { reco: null }

      function noterWeb(interim: string) {
        const texte = [...finaux, interim]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ")
        const avant = flux.etat.courant
        flux.etat = noterTexte(flux.etat, texte, Date.now())
        if (flux.etat.courant !== avant) o.onTexte?.(texteDuTour(flux.etat))
      }

      function session(): Promise<void> {
        return new Promise((resolve) => {
          const reco = new Ctor!()
          courante.reco = reco
          recognitionRef.current = reco
          reco.lang = "fr-FR"
          // continuous : le moteur ne rend pas la main à la première pause.
          // interimResults : les mots en cours de reconnaissance remettent le
          // minuteur de silence à zéro pendant qu'on parle.
          reco.continuous = !isWake
          reco.interimResults = !isWake
          reco.maxAlternatives = 1

          let interim = ""

          reco.onstart = () => setReady(true)

          reco.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const resultat = event.results[i]
              if (resultat.isFinal) {
                finaux.push(resultat[0].transcript)
                interim = ""
              } else {
                interim = resultat[0].transcript
              }
            }
            noterWeb(interim)
          }

          reco.onerror = (event) => {
            // "no-speech" et "aborted" ne sont pas des erreurs ici : le
            // moteur s'arrête sur un silence ou sur notre propre stop(), et
            // c'est nous qui décidons si le tour est fini.
            if (event.error !== "no-speech" && event.error !== "aborted") {
              flux.erreur = friendlyErrorMessage(event.error)
              flux.stopDemande = true
            }
          }

          reco.onend = () => {
            setReady(false)
            resolve()
          }

          reco.start()
        })
      }

      const battement = setInterval(() => {
        if (flux.stopDemande) return
        const decision = arretManuelRef.current
          ? "terminer"
          : decider(flux.etat, Date.now(), opts, false)
        if (decision === "terminer" || decision === "abandonner") {
          flux.stopDemande = true
          courante.reco?.stop()
        }
      }, 250)

      setListening(true)
      try {
        for (;;) {
          await session()
          if (flux.erreur) throw new Error(flux.erreur)
          if (flux.stopDemande || isWake || arretManuelRef.current) break
          if (decider(flux.etat, Date.now(), opts, true) !== "relancer") break
        }
        const transcript = texteDuTour(flux.etat)
        if (!transcript) throw new Error(RIEN_ENTENDU)
        return transcript
      } finally {
        clearInterval(battement)
        courante.reco = null
        recognitionRef.current = null
        setListening(false)
        setReady(false)
      }
    },
    [],
  )

  const listen = useCallback(
    async (mode: "command" | "wake" = "command", options: OptionsEcoute = {}): Promise<string> => {
      setError(null)
      arretManuelRef.current = false
      try {
        if (isNative) {
          return mode === "wake" ? await ecouterWakeNatif() : await ecouterCommandeNative(options)
        }
        return await ecouterWeb(mode, options)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur de reconnaissance vocale."
        setError(message)
        throw new Error(message)
      }
    },
    [ecouterCommandeNative, ecouterWakeNatif, ecouterWeb],
  )

  /** Clôt le tour en cours avec ce qui a déjà été entendu. */
  const stop = useCallback(() => {
    arretManuelRef.current = true
    if (isNative) {
      NativeSpeechRecognition.stop().catch(() => {})
    } else {
      recognitionRef.current?.stop()
    }
  }, [])

  return {
    listen,
    stop,
    listening,
    ready,
    error,
    isSupported,
  }
}
