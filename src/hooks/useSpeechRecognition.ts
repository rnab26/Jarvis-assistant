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

/** Le service de reconnaissance a refusé de démarrer (encore occupé par la
 * session précédente, ou app passée en arrière-plan). Distinct du silence :
 * l'appelant doit reculer un peu avant de réessayer, pas repartir aussitôt. */
export const MOTEUR_OCCUPE = "Le moteur d'écoute est occupé."

/** Temps laissé à une écoute en cours pour se clore quand une nouvelle la
 * remplace. Au-delà on part sans elle : deux reconnaissances en même temps
 * est pire qu'un arrêt un peu brutal. */
const DELAI_RELEVE_MS = 1500

function attendre(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Borne un appel au plugin natif dans le temps.
 *
 * Un plugin Capacitor ne garantit pas de résoudre sa promesse : `stop()` sur
 * un recognizer déjà arrêté, `start()` sur un service occupé, peuvent rester
 * en attente pour toujours. Un seul de ces appels bloqué suffit à figer tout
 * le tour de parole — c'est exactement ce qui laissait Jarvis sur
 * « Préparation du micro… » avec la phrase déjà entendue à l'écran, sans rien
 * faire. Rien de ce que fait le plugin ne mérite qu'on attende sans fin.
 */
function borner<T>(appel: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    appel.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/** Au-delà, le service de reconnaissance d'Android est considéré muet. */
const DELAI_PLUGIN_MS = 8000

/** Marge du filet de dernier recours, au-delà de la durée max d'un tour. */
const PLAFOND_MARGE_MS = 15000

// Dans l'app Android empaquetée (Capacitor), la webview native ne supporte
// pas l'API Web Speech (SpeechRecognition) — on passe alors par le plugin
// natif @capacitor-community/speech-recognition, qui utilise directement le
// service de reconnaissance vocale d'Android. Dans un navigateur normal
// (Chrome mobile, où le micro a déjà été validé), on garde l'API Web.
const isNative = Capacitor.isNativePlatform()

/**
 * Durée d'une rafale d'écoute du mot-clé.
 *
 * Elle était de 8 s, mais surtout : entre deux rafales, l'app redemandait la
 * disponibilité et la permission du micro (deux allers-retours avec Android),
 * attendait 500 ms, puis relançait le moteur — qui met lui-même une bonne
 * demi-seconde à devenir sourd-muet. Le micro passait ainsi une part énorme
 * du temps à ne PAS écouter, et un « Jarvis » tombé dans un de ces trous
 * n'était jamais entendu. C'est la cause racine du réveil qui ne marchait
 * qu'une fois sur deux.
 *
 * Maintenant la rafale dure plus longtemps, la préparation n'a lieu qu'une
 * fois, et la détection se fait sur les résultats partiels : la longueur ne
 * retarde plus la réaction.
 */
const WAKE_LISTEN_MS = 25000

export interface OptionsEcoute {
  /** Silence toléré en pleine phrase. Défaut : le réglage de l'utilisateur. */
  silenceMs?: number
  /** Temps laissé pour commencer à parler avant d'abandonner le tour. */
  premierMotMs?: number
  /** Appelé chaque fois que le texte entendu change (affichage en direct). */
  onTexte?: (texte: string) => void
  /**
   * Clôt le tour dès que ce qui est entendu suffit, sans attendre le silence
   * ni la fin de la rafale. C'est ce qui rend le réveil vocal instantané :
   * on reconnaît « Jarvis » dans un résultat PARTIEL, pendant que la personne
   * finit sa phrase, au lieu d'attendre qu'Android rende son résultat final.
   */
  arreterSi?: (texte: string) => boolean
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
  // Permission micro déjà accordée : évite de la redemander à chaque rafale.
  const microPretRef = useRef(false)
  // UN SEUL PROPRIÉTAIRE DU MICRO. L'écoute en cours, et de quoi la clore
  // depuis l'extérieur. Deux `listen()` qui se chevauchaient (rafale du
  // mot-clé + appui sur le cœur) lançaient deux reconnaissances Android en
  // même temps : micro qui clignote, tour de parole écrasé. Maintenant une
  // nouvelle écoute relève l'ancienne, et attend qu'elle soit close.
  const enCoursRef = useRef<Promise<unknown> | null>(null)
  const clorePresenteRef = useRef<(() => void) | null>(null)

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
    // Une fois la permission accordée, ces deux allers-retours avec Android
    // ne changent plus rien — mais ils coûtent des centaines de millisecondes
    // À CHAQUE rafale d'écoute du mot-clé, pendant lesquelles le micro est
    // sourd. On ne les refait donc plus une fois qu'ils ont dit oui.
    if (microPretRef.current) return

    const dispo = await borner(NativeSpeechRecognition.available(), DELAI_PLUGIN_MS)
    if (!dispo?.available) throw new Error("Reconnaissance vocale indisponible sur cet appareil.")

    // Pas de borne ici : la fenêtre de permission d'Android attend une
    // réponse de l'utilisateur, elle peut légitimement durer.
    const permission = await NativeSpeechRecognition.requestPermissions()
    if (permission.speechRecognition !== "granted") {
      throw new Error("Micro refusé. Autorise l'accès au micro dans les paramètres de l'app.")
    }
    microPretRef.current = true
  }, [])

  /**
   * Écoute du mot-clé : une longue rafale en mode dictée, analysée au vol.
   *
   * L'ancienne version demandait un résultat FINAL à Android (partialResults
   * à false) : il fallait attendre qu'il décide que la phrase était finie
   * avant de savoir si « Jarvis » avait été dit. Avec les partiels, on le
   * reconnaît pendant que Raphaël parle encore, et on rend la main tout de
   * suite — la demande qui suit le mot-clé est déjà dans le texte.
   */
  const ecouterWakeNatif = useCallback(
    async (o: OptionsEcoute): Promise<string> => {
      await preparerNatif()
      setListening(true)

      const flux = { texte: "", suffit: false }
      let resoudreStop: (() => void) | undefined
      let filet: ReturnType<typeof setTimeout> | null = null

      const partiels = await NativeSpeechRecognition.addListener(
        "partialResults",
        ({ matches }) => {
          const texte = matches?.[0]
          if (typeof texte !== "string" || !texte.trim()) return
          flux.texte = texte
          o.onTexte?.(texte)
          if (!flux.suffit && o.arreterSi?.(texte)) {
            flux.suffit = true
            NativeSpeechRecognition.stop().catch(() => {})
            // Si "stopped" ne vient jamais, on n'attend pas pour autant.
            setTimeout(() => resoudreStop?.(), 800)
          }
        },
      )
      const etats = await NativeSpeechRecognition.addListener("listeningState", ({ status }) => {
        setReady(status === "started")
        if (status === "stopped") resoudreStop?.()
      })

      let demarrageRefuse = false
      try {
        const arret = new Promise<void>((resolve) => {
          resoudreStop = resolve
          clorePresenteRef.current = resolve
          filet = setTimeout(() => {
            NativeSpeechRecognition.stop().catch(() => {})
            resolve()
          }, WAKE_LISTEN_MS)
        })

        // La promesse de `start` ne se résout qu'à la fin de l'écoute, au
        // rythme d'Android. On ne l'attend donc PAS directement : on attend
        // notre propre signal d'arrêt (mot-clé reconnu, "stopped", ou filet),
        // et on ne laisse ensuite qu'un court instant au plugin pour rendre
        // son résultat final. Sans ça, reconnaître « Jarvis » à la troisième
        // seconde ne servait à rien : on restait suspendu au plugin.
        //
        // Un REJET, lui, arrive tout de suite : service encore occupé, app
        // en arrière-plan. Avant, il était avalé et on attendait la fin de
        // la rafale — 25 s de micro « allumé » pour rien, puis relance
        // immédiate, puis nouveau refus : le clignotement signalé.
        const enCours = NativeSpeechRecognition.start({
          language: "fr-FR",
          maxResults: 1,
          partialResults: true,
          popup: false,
        }).catch(() => {
          demarrageRefuse = true
          resoudreStop?.()
          return null
        })
        await arret
        const resultat = await borner(enCours, 600)

        // Le résultat final d'Android est mieux ponctué que le dernier
        // partiel ; on le préfère quand il existe.
        const transcript = (resultat?.matches?.[0] ?? flux.texte).trim()
        if (!transcript) throw new Error(demarrageRefuse ? MOTEUR_OCCUPE : RIEN_ENTENDU)
        return transcript
      } finally {
        if (filet) clearTimeout(filet)
        clorePresenteRef.current = null
        // L'interface d'abord, sans rien attendre (voir le mode commande).
        setListening(false)
        setReady(false)
        partiels.remove().catch(() => {})
        etats.remove().catch(() => {})
        // Puis un arrêt BORNÉ, attendu : repartir avant que le service ait
        // lâché le micro, c'est le prochain start() refusé.
        await borner(NativeSpeechRecognition.stop(), 800)
      }
    },
    [preparerNatif],
  )

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
            // Relevé par une autre écoute : on clôt pour de bon, pas
            // seulement cette session — sinon la boucle pourrait la relancer.
            clorePresenteRef.current = () => {
              flux.stopDemande = true
              resolve()
            }
            const restant = opts.maxMs - (Date.now() - flux.etat.debutAt)
            filet = setTimeout(resolve, Math.max(2000, restant + 2000))
          })
          await borner(
            NativeSpeechRecognition.start({
              language: "fr-FR",
              maxResults: 1,
              partialResults: true,
              popup: false,
            }),
            DELAI_PLUGIN_MS,
          )
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
        // L'interface d'abord, et sans rien attendre. Mettre un
        // `await NativeSpeechRecognition.stop()` avant ces deux lignes
        // suffisait à figer le micro pour de bon quand le plugin ne
        // résolvait pas : le texte était entendu, le tour ne se terminait
        // jamais, et Jarvis restait muet en écoute.
        clearInterval(battement)
        clorePresenteRef.current = null
        setListening(false)
        setReady(false)
        partiels.remove().catch(() => {})
        etats.remove().catch(() => {})
        await borner(NativeSpeechRecognition.stop(), 800)
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
      const opts = optionsTour(isWake ? { silenceMs: 1200, premierMotMs: WAKE_LISTEN_MS } : o)
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
        // Ce qui a été entendu suffit déjà (le mot-clé, par exemple) : on
        // clôt sans attendre le silence.
        if (!flux.stopDemande && texte && o.arreterSi?.(texte)) {
          flux.stopDemande = true
          courante.reco?.stop()
        }
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
          //
          // Le mode mot-clé les active AUSSI depuis la correction du réveil
          // vocal : sans eux, Chrome coupait à la première pause et il fallait
          // relancer une session — le micro était sourd pendant ce temps, et
          // « Jarvis » dit à cet instant se perdait.
          reco.continuous = true
          reco.interimResults = true
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

          // Une exception synchrone ici (moteur déjà démarré, micro refusé)
          // rejette la promesse d'elle-même : l'appelant la reçoit, le
          // `finally` nettoie. Vérifié par scripts/verifier-ecoute-web.mjs.
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
      clorePresenteRef.current = () => {
        flux.stopDemande = true
        courante.reco?.stop()
      }

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
        clorePresenteRef.current = null
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

      // Relève : une écoute est déjà en cours (typiquement la rafale du
      // mot-clé quand on touche le cœur). On la clôt et on attend qu'elle
      // ait rendu la main — bornée — avant d'ouvrir la nôtre. Jamais deux
      // reconnaissances à la fois.
      const precedente = enCoursRef.current
      if (precedente) {
        arretManuelRef.current = true
        clorePresenteRef.current?.()
        if (isNative) NativeSpeechRecognition.stop().catch(() => {})
        else recognitionRef.current?.stop()
        await borner(precedente, DELAI_RELEVE_MS)
      }

      arretManuelRef.current = false
      try {
        const ecoute = isNative
          ? mode === "wake"
            ? ecouterWakeNatif(options)
            : ecouterCommandeNative(options)
          : ecouterWeb(mode, options)
        const suivi = ecoute.catch(() => null)
        enCoursRef.current = suivi
        suivi.finally(() => {
          if (enCoursRef.current === suivi) enCoursRef.current = null
        })

        // Filet de dernier recours. Chaque attente du moteur est déjà bornée
        // une par une ; celui-ci garantit la propriété qui compte vraiment :
        // un tour de parole finit TOUJOURS par rendre la main, même si une
        // brique en dessous ne répond jamais. Un micro figé sans un mot est
        // le pire des cas — mieux vaut une erreur affichée.
        return await Promise.race([
          ecoute,
          new Promise<never>((_, rejeter) =>
            setTimeout(
              () => rejeter(new Error("Le micro ne répond plus. Touche le cœur pour réessayer.")),
              MAX_TOUR_MS + PLAFOND_MARGE_MS,
            ),
          ),
        ])
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
    clorePresenteRef.current?.()
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
