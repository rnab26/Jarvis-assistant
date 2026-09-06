/**
 * La fenêtre d'annulation des actions qui sortent de Jarvis.
 *
 * D'OÙ ÇA VIENT, et ce que ça n'est PAS. Raphaël a tranché le périmètre du
 * contrôle du téléphone le 5 sept. 2026, et il a ÉCARTÉ la confirmation que
 * je proposais : « aucune limite dans le sens où il doit faire tout ce que je
 * demande sans limite, c'est le but de Jarvis, il doit être l'extension de
 * l'utilisateur ». Ce module ne réintroduit donc AUCUNE question : rien
 * n'attend son accord, rien ne se bloque, tout part tout seul.
 *
 * Ce qui reste vrai malgré sa décision, c'est qu'une commande MAL ENTENDUE
 * n'est pas une commande demandée. Le 5 sept. entre 17 h 59 et 18 h 20,
 * quatre tentatives à la voix ont donné deux ouvertures de l'application
 * מכבי et deux tâches absurdes. D'où ce compromis, celui écrit dans le
 * chantier : Jarvis annonce ce qu'il fait et laisse quelques secondes pour
 * l'arrêter — comme les actions groupées du cockpit (src/lib/annulation.ts),
 * qui agissent d'abord et proposent « Annuler » ensuite.
 *
 * Et le délai est un RÉGLAGE, pas une valeur en dur : « Immédiat » est un
 * choix disponible en un appui, dans Paramètres.
 */

/** Les actions qui SORTENT de Jarvis vers une autre application. */
export type ActionSortante =
  | "open_app"
  | "call_contact"
  | "navigate_to"
  | "send_message"
  | "ask_ai"

/**
 * Ce qui passe par la fenêtre, et ce qui n'y passe pas.
 *
 * En sont exclus, volontairement : `media_control` (mettre en pause se
 * défait en appuyant une deuxième fois, et attendre trois secondes pour ça
 * serait ridicule), `set_alarm` (elle ne sort pas du téléphone et se
 * supprime d'un geste) et `set_app_preference` (un réglage, qui se rechange).
 * Rallonger cette liste sans raison rendrait Jarvis lent partout.
 */
const SORTANTES = new Set<string>([
  "open_app",
  "call_contact",
  "navigate_to",
  "send_message",
  "ask_ai",
])

export function passeParLaFenetre(action: string): boolean {
  return SORTANTES.has(action)
}

/** Les délais proposés dans Paramètres. Zéro = pas de fenêtre du tout. */
export const DELAIS_ANNULATION = [0, 3000, 5000, 8000] as const

/** Trois secondes : assez pour lire et arrêter une bêtise, assez court pour
 * ne pas transformer chaque commande en attente. Se met à zéro en un appui. */
export const DELAI_ANNULATION_DEFAUT = 3000

export const CLE_DELAI_ANNULATION = "jarvis_delai_annulation"

export function libelleDelai(ms: number): string {
  return ms === 0 ? "Immédiat" : `${Math.round(ms / 1000)} secondes`
}

/** Le délai retenu, en millisecondes. Une valeur inconnue retombe sur le
 * défaut plutôt que sur zéro : on ne coupe pas un garde-fou par accident. */
export function delaiAnnulation(): number {
  try {
    const brut = localStorage.getItem(CLE_DELAI_ANNULATION)
    if (brut === null) return DELAI_ANNULATION_DEFAUT
    const ms = Number(brut)
    if (!Number.isFinite(ms) || ms < 0) return DELAI_ANNULATION_DEFAUT
    return (DELAIS_ANNULATION as readonly number[]).includes(ms) ? ms : DELAI_ANNULATION_DEFAUT
  } catch {
    return DELAI_ANNULATION_DEFAUT
  }
}

/**
 * Ce que Jarvis annonce AVANT d'agir.
 *
 * Court, et il nomme la cible : c'est le seul mot qui permet de repérer une
 * commande mal entendue. « J'ouvre une application » ne dirait rien ;
 * « J'ouvre מכבי » se corrige en une seconde.
 */
export function annonceAction(
  action: string,
  cible: string | null,
): string {
  const quoi = cible?.trim() || null
  switch (action) {
    case "open_app":
      return quoi ? `J'ouvre ${quoi}.` : "J'ouvre l'application."
    case "call_contact":
      return quoi ? `J'appelle ${quoi}.` : "Je passe l'appel."
    case "navigate_to":
      return quoi ? `Itinéraire vers ${quoi}.` : "J'ouvre l'itinéraire."
    case "send_message":
      return quoi ? `Message pour ${quoi}.` : "Je prépare le message."
    case "ask_ai":
      return quoi ? `Je pose la question à ${quoi}.` : "Je relaie la question."
    default:
      return "J'y vais."
  }
}
