import { SpeechRecognition as NativeSpeechRecognition } from "@capacitor-community/speech-recognition"
import { Capacitor } from "@capacitor/core"
import { useCallback, useRef, useState } from "react"
import { MAX_TOUR_MS, PREMIER_MOT_MS, SILENCE_COURT_MS, readDialoguePrefs } from "@/lib/dialoguePrefs"
import {
  cloturerSegment,
  creerTour,
  decider,
  noterTexte,
  texteDuTour,
  type EtatTour,
  type OptionsTour,
} from "@/lib/dialogueTour"
import { extraitEntendu, noterEcoute } from "@/lib/journalEcoute"
import { raisonDepuisCode, type RaisonEcoute } from "@/lib/raisonEcoute"

type SpeechRecognitionCtor = new () => SpeechRecognition

/**
 * Ce que le plugin émet sur `listeningState`, patch compris.
 *
 * Les types du paquet d'origine ne connaissent que « started » et
 * « stopped » : notre patch ajoute « error » avec le code d'Android, que
 * `onError` jetait jusqu'ici (voir patches/ et src/lib/raisonEcoute.ts).
 * Une APK plus ancienne n'émet pas cet événement — d'où les champs
 * optionnels : le code doit rester juste sur les deux versions.
 */
interface EtatEcoute {
  status: "started" | "stopped" | "error"
  code?: number
  message?: string
}

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

/**
 * Cadence à laquelle on demande au plugin s'il écoute encore.
 *
 * LU DANS LE CODE JAVA DU PLUGIN (3 sept.) : sur n'importe quelle erreur du
 * service Android — silence de quelques secondes (SPEECH_TIMEOUT), rien
 * reconnu (NO_MATCH), service occupé, app en arrière-plan — `onError`
 * n'émet AUCUN événement vers nous : il tente de rejeter une promesse déjà
 * résolue (en mode partiels, `start()` se résout tout de suite), et c'est
 * perdu. Le service meurt, nous restons « à l'écoute » d'un micro mort
 * jusqu'au filet — 25 s en veille, jusqu'à 3 min en commande. C'est
 * pourquoi « Jarvis » n'était entendu que dans les secondes qui suivaient
 * une tonalité. `isListening()` est le seul signal qui reste : on le relit.
 */
const POULS_SERVICE_MS = 500

/** Après un démarrage, le temps que le plugin passe `listening` à vrai. */
const GRACE_DEMARRAGE_MS = 1500

/**
 * Après « stopped », le temps laissé au service pour livrer son résultat
 * FINAL. Lu dans le journal d'écoute du téléphone de Raphaël (3 sept.) : un
 * « Jarvis » seul ne produit aucun partiel — le service ferme l'écoute
 * (onEndOfSpeech, donc « stopped »), puis livre le résultat 300 à 1000 ms
 * plus tard. On avait déjà retiré les écouteurs : le mot était perdu, et il
 * fallait enchaîner une phrase pour être entendu. On attend donc ce final,
 * borné, et on part dès qu'il arrive.
 */
const ATTENTE_FINAL_MS = 1000

/** Le service a-t-il lâché sans rien dire ? Borné : un plugin muet n'est
 * pas un service vivant. */
async function serviceEncoreVivant(): Promise<boolean> {
  const r = await borner(NativeSpeechRecognition.isListening(), 400)
  return r?.listening === true
}

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
    const silenceMs = o.silenceMs ?? prefs.pauseMs
    return {
      silenceMs,
      silenceCourtMs: Math.min(SILENCE_COURT_MS, silenceMs),
      premierMotMs: o.premierMotMs ?? PREMIER_MOT_MS,
      maxMs: MAX_TOUR_MS,
    }
  }

  // --- Android natif -------------------------------------------------------

  // Ajouté par notre patch (patches/@capacitor-community+speech-recognition),
  // absent des types du paquet d'origine : le plugin vise maintenant le
  // service de reconnaissance de Google quand il est installé, pour éviter
  // la tonalité et les coupures à chaque respiration du service par défaut
  // d'un Samsung. On lit une fois quel service a été retenu, pour le
  // journal d'écoute — rien ne dépend de cette valeur côté comportement.
  const serviceUtilise = NativeSpeechRecognition as unknown as {
    serviceUtilise?: () => Promise<{ nom: string; disponibles: string }>
  }

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

    const service = await borner(serviceUtilise.serviceUtilise?.() ?? Promise.resolve(null), 400)
    if (service) noterEcoute("service_reconnaissance", { nom: service.nom, disponibles: service.disponibles })
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

      const flux = { texte: "", suffit: false, stoppedRecu: false, finalRecu: false }
      let resoudreStop: (() => void) | undefined
      let resoudreFinal: (() => void) | undefined
      let filet: ReturnType<typeof setTimeout> | null = null
      // Déclarée AVANT les écouteurs qui l'affectent : c'est une fermeture
      // appelée depuis le pont natif, pas du code qu'on relit d'en haut.
      let raison: RaisonEcoute | null = null
      // ET LE CODE BRUT, PAS SEULEMENT SA TRADUCTION. Mesuré le 6 sept. sur
      // son téléphone : `raison=service` est arrivée 51 fois, contre 35
      // « silence » — c'est devenu la première erreur ouverte du registre. Or
      // « service » regroupe ERROR_SERVER (4), ERROR_CLIENT (5),
      // ERROR_SERVER_DISCONNECTED (11) ET tout code inconnu : impossible de
      // savoir laquelle de ces pannes il subit. On garde donc le nombre.
      let codeAndroid: number | null = null

      const partiels = await NativeSpeechRecognition.addListener(
        "partialResults",
        ({ matches }) => {
          const texte = matches?.[0]
          if (typeof texte !== "string" || !texte.trim()) return
          nbPartiels++
          flux.texte = texte
          // Après « stopped », le plugin livre le résultat final par ce même
          // événement : c'est ce qu'on attendait, on peut partir.
          if (flux.stoppedRecu) {
            flux.finalRecu = true
            resoudreFinal?.()
          }
          o.onTexte?.(texte)
          if (!flux.suffit && o.arreterSi?.(texte)) {
            flux.suffit = true
            NativeSpeechRecognition.stop().catch(() => {})
            // Si "stopped" ne vient jamais, on n'attend pas pour autant.
            setTimeout(() => resoudreStop?.(), 800)
          }
        },
      )
      const etats = await NativeSpeechRecognition.addListener("listeningState", (e) => {
        const { status, code } = e as EtatEcoute
        setReady(status === "started")
        if (status === "error") {
          // La raison de l'arrêt, que le plugin jetait avant notre patch.
          // C'est elle qui distingue « personne n'a parlé » d'une vraie
          // panne — voir src/lib/raisonEcoute.ts.
          //
          // On ne pose PAS `stoppedRecu` : après une erreur, Android ne
          // livrera aucun résultat final, et l'attendre coûterait
          // ATTENTE_FINAL_MS pour rien — une seconde de micro sourd à chaque
          // rafale, soit 363 secondes perdues sur la seule journée du
          // 5 sept. C'est exactement la latence dont Raphaël se plaint.
          raison = raisonDepuisCode(code)
          codeAndroid = code ?? null
          resoudreStop?.()
          return
        }
        if (status === "stopped") {
          flux.stoppedRecu = true
          resoudreStop?.()
        }
      })

      let demarrageRefuse = false
      let mortSilencieuse = false
      let nbPartiels = 0
      const debutAt = Date.now()
      let pouls: ReturnType<typeof setInterval> | null = null
      noterEcoute("rafale_debut")
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
        })
          .then((r) => {
            // En mode partiels, `start()` se résout dès que le service est
            // lancé : c'est LE moment où le micro devient vraiment ouvert.
            setReady(true)
            return r
          })
          .catch(() => {
            demarrageRefuse = true
            resoudreStop?.()
            return null
          })

        // Le pouls : si le service est mort sans le dire, on clôt la rafale
        // tout de suite au lieu d'attendre le filet avec un micro mort.
        pouls = setInterval(async () => {
          if (flux.suffit || flux.stoppedRecu || demarrageRefuse) return
          if (Date.now() - debutAt < GRACE_DEMARRAGE_MS) return
          // Le plugin met `listening` à faux aussi à la fin normale d'une
          // prise de parole — mais alors « stopped » arrive. Sans « stopped »,
          // c'est une erreur avalée : le service est mort.
          if (!(await serviceEncoreVivant())) {
            mortSilencieuse = true
            resoudreStop?.()
          }
        }, POULS_SERVICE_MS)

        await arret
        // Fin de parole normale sans le mot-clé déjà reconnu : le final
        // peut encore arriver, on lui laisse ATTENTE_FINAL_MS.
        if (flux.stoppedRecu && !flux.suffit && !flux.finalRecu) {
          await Promise.race([
            new Promise<void>((resolve) => {
              resoudreFinal = resolve
            }),
            attendre(ATTENTE_FINAL_MS),
          ])
        }
        const resultat = await borner(enCours, 600)

        // Le résultat final d'Android est mieux ponctué que le dernier
        // partiel ; on le préfère quand il existe.
        const transcript = (resultat?.matches?.[0] ?? flux.texte).trim()
        noterEcoute("rafale_fin", {
          // « veille » : c'est la boucle qui écoute « Jarvis » toute seule.
          // Sans ce mode, le registre des erreurs ne pouvait pas distinguer
          // une pièce calme (normal, 363 fois le 5 sept.) d'un micro qui
          // lâche pendant que Raphaël parle (vraie perte).
          mode: "veille",
          duree_ms: Date.now() - debutAt,
          partiels: nbPartiels,
          mot_cle: flux.suffit,
          final_attendu: flux.stoppedRecu && !flux.suffit,
          final_recu: flux.finalRecu,
          mort_silencieuse: mortSilencieuse,
          demarrage_refuse: demarrageRefuse,
          raison,
          code: codeAndroid,
          entendu: extraitEntendu(transcript),
        })
        if (!transcript) throw new Error(demarrageRefuse ? MOTEUR_OCCUPE : RIEN_ENTENDU)
        return transcript
      } finally {
        if (filet) clearTimeout(filet)
        if (pouls) clearInterval(pouls)
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
      let nbPartiels = 0
      let nbSessions = 0
      let mortsSilencieuses = 0
      let sessionDebutAt = 0
      let stoppedRecu = false
      let finalApresStop = 0
      let raison: RaisonEcoute | null = null
      // Voir le mode veille : « service » regroupe quatre pannes distinctes,
      // seul le nombre les sépare.
      let codeAndroid: number | null = null

      setListening(true)
      noterEcoute("commande_debut")

      // partialResults:true active le "DICTATION_MODE" natif d'Android, dont
      // la tolérance au silence est plus longue que le mode commande — et
      // c'est aussi ce qui nous donne le texte au fil de l'eau, donc de quoi
      // mesurer nous-mêmes le silence.
      const partiels = await NativeSpeechRecognition.addListener(
        "partialResults",
        ({ matches }) => {
          const texte = matches?.[0]
          if (typeof texte !== "string") return
          nbPartiels++
          if (stoppedRecu) finalApresStop++
          const avant = flux.etat.courant
          flux.etat = noterTexte(flux.etat, texte, Date.now())
          if (flux.etat.courant !== avant) o.onTexte?.(texteDuTour(flux.etat))
        },
      )
      const etats = await NativeSpeechRecognition.addListener("listeningState", (e) => {
        const { status, code } = e as EtatEcoute
        setReady(status === "started")
        if (status === "error") {
          // On garde la DERNIÈRE raison : le tour de parole enchaîne
          // plusieurs sessions, et c'est celle qui a clos la dernière qui
          // explique pourquoi le tour s'est terminé.
          //
          // Pas de `stoppedRecu` non plus ici : après une erreur il n'y a
          // pas de résultat final à attendre, et la boucle doit relancer
          // tout de suite — c'est ce qui fait qu'une coupure en pleine
          // phrase ne se paie plus une seconde de silence.
          raison = raisonDepuisCode(code)
          codeAndroid = code ?? null
          resoudreStop?.()
          return
        }
        if (status === "stopped") {
          stoppedRecu = true
          resoudreStop?.()
        }
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

      // Le pouls (voir POULS_SERVICE_MS) : un service mort sans le dire clôt
      // la session en cours ; la boucle décide ensuite de relancer ou de
      // rendre le texte, comme pour une coupure ordinaire.
      const pouls = setInterval(async () => {
        if (flux.stopDemande || stoppedRecu || !sessionDebutAt) return
        if (Date.now() - sessionDebutAt < GRACE_DEMARRAGE_MS) return
        if (!(await serviceEncoreVivant())) {
          mortsSilencieuses++
          sessionDebutAt = 0
          resoudreStop?.()
        }
      }, POULS_SERVICE_MS)

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
          nbSessions++
          sessionDebutAt = Date.now()
          stoppedRecu = false
          const demarre = await borner(
            NativeSpeechRecognition.start({
              language: "fr-FR",
              maxResults: 1,
              partialResults: true,
              popup: false,
              // BAISSER LA MUSIQUE PENDANT QU'IL PARLE. Ses mots du 6 sept. :
              // « la musique ne se coupe pas, mais il a du mal à entendre une
              // fois que la musique est lancée, car le fond musical est
              // présent. » Le plugin demande alors le focus audio à Android,
              // qui baisse les autres applications puis les remonte tout seul.
              //
              // Ici SEULEMENT, et pas dans l'écoute du mot-clé : la veille
              // relance une rafale toutes les 1 à 8 s, et baisser puis
              // remonter la musique à ce rythme la ferait « pomper » sans
              // arrêt — pire que le défaut qu'on corrige.
              baisserLeSon: true,
            } as Parameters<typeof NativeSpeechRecognition.start>[0]),
            DELAI_PLUGIN_MS,
          )
          // En mode partiels, `start()` se résout dès que le service est
          // lancé : le micro est ouvert, même si personne n'a encore parlé.
          if (demarre) setReady(true)
          await arret
          if (filet) clearTimeout(filet)
          // Le résultat final post-traité par Android arrive APRÈS
          // « stopped » (300 à 1000 ms, lu dans le journal du téléphone) :
          // 250 ms ne suffisaient pas, la fin de phrase se perdait.
          if (stoppedRecu) {
            const avantFinal = finalApresStop
            const debutAttente = Date.now()
            while (finalApresStop === avantFinal && Date.now() - debutAttente < ATTENTE_FINAL_MS) {
              await attendre(50)
            }
          } else {
            await attendre(250)
          }
          flux.etat = cloturerSegment(flux.etat)
          o.onTexte?.(texteDuTour(flux.etat))
          if (flux.stopDemande || arretManuelRef.current) break
          if (decider(flux.etat, Date.now(), opts, true) !== "relancer") break
          // Android refuse un redémarrage immédiat : lui laisser un souffle.
          await attendre(150)
        }

        const transcript = texteDuTour(flux.etat)
        noterEcoute("commande_fin", {
          // « commande » : Raphaël a appuyé et parle. Ici un silence EST une
          // perte — il attendait une réponse.
          mode: "commande",
          raison,
          code: codeAndroid,
          duree_ms: Date.now() - flux.etat.debutAt,
          sessions: nbSessions,
          partiels: nbPartiels,
          morts_silencieuses: mortsSilencieuses,
          finals_apres_stop: finalApresStop,
          arret_manuel: arretManuelRef.current,
          entendu: extraitEntendu(transcript),
        })
        if (!transcript) throw new Error(RIEN_ENTENDU)
        return transcript
      } finally {
        clearInterval(pouls)
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
        // Le minuteur est nettoyé à la sortie : avant, chaque rafale de
        // veille en laissait un vivant plus de trois minutes, et il y en
        // avait des dizaines en attente en permanence.
        let plafond: ReturnType<typeof setTimeout> | null = null
        try {
          return await Promise.race([
            ecoute,
            new Promise<never>((_, rejeter) => {
              plafond = setTimeout(
                () => rejeter(new Error("Le micro ne répond plus. Touche le cœur pour réessayer.")),
                MAX_TOUR_MS + PLAFOND_MARGE_MS,
              )
            }),
          ])
        } finally {
          if (plafond) clearTimeout(plafond)
        }
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
