import { TextToSpeech, type SpeechSynthesisVoice } from "@capacitor-community/text-to-speech"
import { Capacitor } from "@capacitor/core"
import { errorMessage } from "@/lib/errorMessage"
import { readVoicePrefs } from "@/lib/voicePrefs"

/**
 * Le seul moteur de synthèse vocale de Jarvis. Extrait de useSpeechSynthesis.ts
 * (chantier f44c6673, 6 sept. 2026) pour que ce qui doit parler en dehors d'un
 * composant React — l'annonce d'une action du téléphone pendant la fenêtre
 * d'annulation, src/lib/actionsTelephoneVocales.ts — utilise le même moteur
 * que l'écran. Deux chemins de synthèse auraient fini par ne plus dire pareil
 * (voix, langue, cache des voix, coupure) ; décision de session du 6 sept.
 * (dev_log, réponse à claude/telephone-actions-0509).
 *
 * useSpeechSynthesis.ts reste la façade React (état `speaking`/`erreur` pour
 * l'écran) et appelle les fonctions d'ici — ne duplique pas cette logique.
 */

export type { SpeechSynthesisVoice }

const isNative = Capacitor.isNativePlatform()

// La langue de lecture suit la voix choisie. La forcer à "fr-FR" quand
// l'utilisateur a sélectionné une voix d'une autre langue faisait échouer la
// lecture sans un mot d'explication (bouton "Tester" muet dans Paramètres).
const LANGUE_PAR_DEFAUT = "fr-FR"

/** Voix de l'appareil, mises en cache : on en a besoin à chaque lecture pour
 * connaître la langue de la voix choisie, et la liste ne change pas. */
let voixEnCache: SpeechSynthesisVoice[] | null = null

/** Débloque un `parler()` en cours (voir arreterParler). Une seule lecture à
 * la fois dans toute l'app : un module-level suffit, il n'y a qu'une voix. */
let pendingStop: (() => void) | null = null

export function synthesePriseEnCharge(): boolean {
  return isNative || "speechSynthesis" in window
}

export interface OptionsParler {
  /** Index dans la liste renvoyée par voixDisponibles(), pour utiliser la
   * voix choisie dans Paramètres plutôt que la voix par défaut du système. */
  voiceIndex?: number
  /** Force la lecture même si la voix est coupée (bouton "Tester"). */
  forcer?: boolean
  onSpeakingChange?: (speaking: boolean) => void
  onErreur?: (message: string) => void
}

/**
 * Attend la fin réelle de la lecture (côté web comme natif) avant de
 * résoudre — important : sans ça, l'appelant croit Jarvis silencieux et
 * relance l'écoute (ou repasse en idle) alors que l'audio joue encore, ce qui
 * fait parler Jarvis "par-dessus" une nouvelle écoute ou une interaction.
 */
export async function parler(text: string, options: OptionsParler = {}): Promise<void> {
  if (!synthesePriseEnCharge()) return
  const { voiceIndex, forcer = false, onSpeakingChange, onErreur } = options

  const prefs = readVoicePrefs()
  // Voix coupée : on ne dit rien, mais l'appelant continue normalement — la
  // réponse reste affichée à l'écran.
  if (prefs.muted && !forcer) return
  const index = voiceIndex ?? prefs.voiceIndex ?? undefined
  // La langue de lecture suit la voix choisie (voir plus bas) : si la liste
  // des voix n'a encore jamais été demandée — Paramètres jamais ouvert cette
  // session, ou premier mot dit avant —, voixEnCache est encore vide et une
  // voix non française retomberait à tort sur LANGUE_PAR_DEFAUT, qu'Android
  // refuse de lire avec cette voix. Piège déjà payé une fois pour cette
  // raison précise (voir le commentaire de LANGUE_PAR_DEFAUT ci-dessus).
  if (index !== undefined && voixEnCache === null) await voixDisponibles()
  const voix = index === undefined ? undefined : voixEnCache?.[index]

  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      onSpeakingChange?.(false)
      pendingStop = null
      resolve()
    }
    pendingStop = finish

    if (isNative) {
      onSpeakingChange?.(true)
      TextToSpeech.speak({
        text,
        // La langue de la voix choisie prime : sinon Android refuse de lire.
        lang: voix?.lang ?? LANGUE_PAR_DEFAUT,
        rate: prefs.rate,
        pitch: prefs.pitch,
        volume: 1,
        voice: index,
      })
        // Sans ce catch, un échec de lecture ne se voyait nulle part.
        .catch((e) => onErreur?.(errorMessage(e)))
        .finally(finish)
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voixWeb = index === undefined ? undefined : window.speechSynthesis.getVoices()[index]
    utterance.lang = voixWeb?.lang ?? LANGUE_PAR_DEFAUT
    utterance.rate = prefs.rate
    utterance.pitch = prefs.pitch
    if (voixWeb) utterance.voice = voixWeb
    utterance.onstart = () => onSpeakingChange?.(true)
    utterance.onend = finish
    utterance.onerror = (e) => {
      onErreur?.(e.error || "La lecture a échoué.")
      finish()
    }
    window.speechSynthesis.speak(utterance)
  })
}

/** Coupe la voix en cours (interruption / "barge-in"). */
export function arreterParler(): void {
  if (isNative) {
    TextToSpeech.stop()
  } else {
    window.speechSynthesis.cancel()
  }
  pendingStop?.()
}

/** Liste des voix disponibles sur l'appareil (même API des deux côtés). */
export async function voixDisponibles(): Promise<SpeechSynthesisVoice[]> {
  if (!synthesePriseEnCharge()) return []
  if (isNative) {
    const { voices } = await TextToSpeech.getSupportedVoices()
    voixEnCache = voices
    return voices
  }
  // Le navigateur charge parfois la liste des voix de façon asynchrone : si
  // elle est vide au premier appel, on attend l'événement dédié.
  const existing = window.speechSynthesis.getVoices()
  if (existing.length > 0) {
    voixEnCache = existing
    return existing
  }
  return new Promise((resolve) => {
    window.speechSynthesis.onvoiceschanged = () => {
      voixEnCache = window.speechSynthesis.getVoices()
      resolve(voixEnCache as SpeechSynthesisVoice[])
    }
  })
}
