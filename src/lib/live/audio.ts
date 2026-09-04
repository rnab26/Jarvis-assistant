/**
 * L'audio du mode conversation Live : le micro vers Gemini, Gemini vers le
 * haut-parleur. Rien d'autre — pas de détection de voix, pas de fin de tour :
 * c'est justement ce qu'on ne veut plus écrire nous-mêmes.
 *
 * Formats imposés par l'API (vérifiés dans la doc, 4 sept.) : en entrée du
 * PCM 16 bits petit-boutiste à 16 kHz, en sortie du PCM 16 bits à 24 kHz.
 *
 * ScriptProcessorNode plutôt qu'AudioWorklet : déprécié mais présent partout,
 * WebView Android comprise, et sans fichier séparé à servir. Pour un
 * prototype, la fiabilité passe avant l'élégance.
 */

export const CADENCE_ENTREE = 16000
export const CADENCE_SORTIE = 24000

/** Taille du tampon de capture : ~85 ms à 48 kHz, un bon compromis latence/charge. */
const TAILLE_TAMPON = 4096

export interface CaptureMicro {
  arreter: () => void
}

/**
 * Ouvre le micro et livre des paquets PCM16 à 16 kHz, encodés en base64,
 * prêts pour `sendRealtimeInput`.
 */
export async function capturerMicro(surPaquet: (base64: string) => void): Promise<CaptureMicro> {
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const contexte = new AudioContext()
  // Certains navigateurs créent le contexte suspendu tant qu'aucun geste
  // n'a eu lieu ; on part d'un appui, mais on s'en assure.
  if (contexte.state === "suspended") await contexte.resume().catch(() => {})

  const source = contexte.createMediaStreamSource(flux)
  const processeur = contexte.createScriptProcessor(TAILLE_TAMPON, 1, 1)
  const rapport = contexte.sampleRate / CADENCE_ENTREE

  processeur.onaudioprocess = (e) => {
    const entree = e.inputBuffer.getChannelData(0)
    surPaquet(pcm16Base64(sousEchantillonner(entree, rapport)))
  }
  source.connect(processeur)
  // Sans destination, Chrome ne fait pas tourner le processeur ; on branche
  // sur un gain à zéro pour ne rien entendre de soi-même.
  const muet = contexte.createGain()
  muet.gain.value = 0
  processeur.connect(muet)
  muet.connect(contexte.destination)

  return {
    arreter: () => {
      processeur.disconnect()
      source.disconnect()
      muet.disconnect()
      flux.getTracks().forEach((t) => t.stop())
      void contexte.close().catch(() => {})
    },
  }
}

/** Réduit la cadence par moyenne des échantillons : suffisant pour la voix. */
function sousEchantillonner(entree: Float32Array, rapport: number): Float32Array {
  if (rapport <= 1) return entree
  const longueur = Math.floor(entree.length / rapport)
  const sortie = new Float32Array(longueur)
  for (let i = 0; i < longueur; i++) {
    const debut = Math.floor(i * rapport)
    const fin = Math.min(entree.length, Math.floor((i + 1) * rapport))
    let somme = 0
    for (let j = debut; j < fin; j++) somme += entree[j]
    sortie[i] = fin > debut ? somme / (fin - debut) : 0
  }
  return sortie
}

function pcm16Base64(echantillons: Float32Array): string {
  const tampon = new ArrayBuffer(echantillons.length * 2)
  const vue = new DataView(tampon)
  for (let i = 0; i < echantillons.length; i++) {
    const v = Math.max(-1, Math.min(1, echantillons[i]))
    vue.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true)
  }
  const octets = new Uint8Array(tampon)
  let binaire = ""
  for (let i = 0; i < octets.length; i += 0x8000) {
    binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  }
  return btoa(binaire)
}

/**
 * Lit les paquets audio de Gemini dans l'ordre, sans trou, et sait tout
 * jeter d'un coup quand Gemini signale une interruption — c'est ce qui rend
 * la coupure de parole naturelle : on se tait tout de suite.
 */
export class LecteurAudio {
  private contexte: AudioContext | null = null
  private prochainDepart = 0
  private sources: AudioBufferSourceNode[] = []

  private obtenirContexte(): AudioContext {
    if (!this.contexte) this.contexte = new AudioContext({ sampleRate: CADENCE_SORTIE })
    if (this.contexte.state === "suspended") void this.contexte.resume().catch(() => {})
    return this.contexte
  }

  jouer(base64: string) {
    const contexte = this.obtenirContexte()
    const binaire = atob(base64)
    const nb = Math.floor(binaire.length / 2)
    const flottants = new Float32Array(nb)
    for (let i = 0; i < nb; i++) {
      const bas = binaire.charCodeAt(i * 2)
      const haut = binaire.charCodeAt(i * 2 + 1)
      let v = (haut << 8) | bas
      if (v >= 0x8000) v -= 0x10000
      flottants[i] = v / 0x8000
    }
    const tampon = contexte.createBuffer(1, nb, CADENCE_SORTIE)
    tampon.copyToChannel(flottants, 0)
    const source = contexte.createBufferSource()
    source.buffer = tampon
    source.connect(contexte.destination)
    const depart = Math.max(contexte.currentTime, this.prochainDepart)
    source.start(depart)
    this.prochainDepart = depart + tampon.duration
    this.sources.push(source)
    source.onended = () => {
      this.sources = this.sources.filter((s) => s !== source)
    }
  }

  /** Vrai tant qu'il reste de l'audio programmé. */
  get enCours(): boolean {
    return this.contexte !== null && this.prochainDepart > this.contexte.currentTime + 0.05
  }

  /** Interruption : on jette tout ce qui n'a pas encore été joué. */
  vider() {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        // déjà finie
      }
    }
    this.sources = []
    this.prochainDepart = 0
  }

  fermer() {
    this.vider()
    void this.contexte?.close().catch(() => {})
    this.contexte = null
  }
}
