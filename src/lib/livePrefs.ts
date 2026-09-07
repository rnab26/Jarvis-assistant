import { ecrireReglage } from "@/lib/reglages"
import { FORMULES_PAR_DEFAUT } from "@/lib/live/finConversation"

/**
 * « Mode conversation Live » : le cœur ouvre une conversation Gemini Live
 * (audio en continu, fin de tour et interruption gérées par Google) au lieu
 * du micro fait main. Prototype, désactivé par défaut — décision de Raphaël
 * du 4 sept. : les deux pistes avancent en parallèle, on mesure, on tranche.
 */
export const MODE_LIVE_KEY = "jarvis_mode_live"

export function lireModeLive(): boolean {
  try {
    return localStorage.getItem(MODE_LIVE_KEY) === "1"
  } catch {
    return false
  }
}

export function ecrireModeLive(actif: boolean) {
  ecrireReglage(MODE_LIVE_KEY, actif ? "1" : "0")
}

/**
 * La clôture à la voix du Live (« terminé », « au revoir »…), réglable
 * depuis Paramètres (chantier b68f3b21, 6 sept. 2026). Trois clés
 * distinctes, déclarées dans src/lib/reglages.ts :
 *
 *   jarvis_live_cloture_actif    — interrupteur général.
 *   jarvis_live_cloture_formules — sa liste éditée, en JSON. Absente tant
 *                                  qu'il n'a rien changé : demandeFinDeConversation()
 *                                  utilise alors la liste par défaut.
 *   jarvis_live_cloture_delai_ms — le temps laissé à Jarvis pour dire au
 *                                  revoir avant de couper.
 */
export const CLOTURE_ACTIF_KEY = "jarvis_live_cloture_actif"
export const CLOTURE_FORMULES_KEY = "jarvis_live_cloture_formules"
export const CLOTURE_DELAI_KEY = "jarvis_live_cloture_delai_ms"

/** Défaut historique du chantier : 8 s, le temps de dire une phrase d'adieu
 * courte sans laisser la conversation ouverte inutilement longtemps. */
export const DELAI_ADIEU_DEFAUT_MS = 8000
/** Bornes du réglage : en dessous, Jarvis n'a pas le temps de finir sa
 * phrase ; au-dessus, une clôture demandée traîne sans raison. */
export const DELAI_ADIEU_MIN_MS = 2000
export const DELAI_ADIEU_MAX_MS = 20000

export interface ClotureLivePrefs {
  actif: boolean
  /** `null` : pas de personnalisation, la liste par défaut s'applique. Un
   * tableau (même vide) : la sienne, telle qu'il l'a éditée. */
  formules: string[] | null
  delaiMs: number
}

export function lireClotureLive(): ClotureLivePrefs {
  let actif = true
  let formules: string[] | null = null
  let delaiMs = DELAI_ADIEU_DEFAUT_MS
  try {
    const brutActif = localStorage.getItem(CLOTURE_ACTIF_KEY)
    if (brutActif !== null) actif = brutActif === "1"

    const brutFormules = localStorage.getItem(CLOTURE_FORMULES_KEY)
    if (brutFormules !== null) {
      const parse = JSON.parse(brutFormules)
      if (Array.isArray(parse) && parse.every((f) => typeof f === "string")) formules = parse
    }

    const brutDelai = localStorage.getItem(CLOTURE_DELAI_KEY)
    if (brutDelai !== null) {
      const v = Number(brutDelai)
      if (Number.isFinite(v) && v >= DELAI_ADIEU_MIN_MS && v <= DELAI_ADIEU_MAX_MS) delaiMs = v
    }
  } catch {
    // Stockage illisible : les valeurs par défaut ci-dessus s'appliquent.
  }
  return { actif, formules, delaiMs }
}

export function ecrireClotureActif(actif: boolean) {
  ecrireReglage(CLOTURE_ACTIF_KEY, actif ? "1" : "0")
}

/** `null` remet la liste par défaut (efface la personnalisation, ne
 * l'enregistre pas comme une liste vide). */
export function ecrireClotureFormules(formules: string[] | null) {
  ecrireReglage(CLOTURE_FORMULES_KEY, formules === null ? null : JSON.stringify(formules))
}

export function ecrireClotureDelai(delaiMs: number) {
  const borne = Math.min(DELAI_ADIEU_MAX_MS, Math.max(DELAI_ADIEU_MIN_MS, Math.round(delaiMs)))
  ecrireReglage(CLOTURE_DELAI_KEY, String(borne))
}

/** Pour l'écran : la liste réellement affichée, jamais vide au premier
 * chargement — celle par défaut tant qu'il n'a rien édité. */
export function formulesAffichees(prefs: ClotureLivePrefs): string[] {
  return prefs.formules ?? [...FORMULES_PAR_DEFAUT]
}
