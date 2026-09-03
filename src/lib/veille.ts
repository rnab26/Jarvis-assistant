/**
 * La veille : quand Jarvis a le droit d'écouter sans qu'on lui ait rien
 * demandé, et quoi faire de ce qu'il entend.
 *
 * Pourquoi ce module existe (test en direct du 3 sept.) : le mot-clé était
 * activé, et la boucle qui écoute « Jarvis » tournait dès que l'app était
 * montée — y compris l'app derrière une autre. Android refuse le micro à une
 * app qui n'est pas au premier plan : chaque rafale échouait et repartait
 * 150 ms plus tard. C'est le micro que Raphaël voyait s'allumer et
 * s'éteindre pendant qu'il dictait à un AUTRE assistant. Une écoute non
 * voulue, pas un inconfort.
 *
 * Deuxième défaut du même tonneau : quand une rafale se terminait, la boucle
 * remettait l'état au repos SANS regarder si, entre-temps, un appui sur le
 * cœur avait pris la main. Le tour en cours se voyait écrasé, et une seconde
 * reconnaissance partait par-dessus la première.
 *
 * Volontairement pur : ni horloge, ni micro, ni React. Vérifié par
 * `node --experimental-strip-types scripts/verifier-dialogue.ts`.
 */

// Import relatif avec extension, comme commandeLocale.ts : ce module doit
// tourner sous Node sans bundler (scripts/verifier-dialogue.ts).
import { chercherMotCle } from "./motCle.ts"

export type StatutVoix = "idle" | "wake-listening" | "listening" | "processing" | "speaking" | "error"

/** Entre deux rafales : Android refuse un redémarrage immédiat du service. */
export const RESPIRATION_MS = 150

/** Après un démarrage refusé (service encore occupé) : lui laisser le temps
 * de se libérer, plutôt que de le harceler et de faire clignoter le micro. */
export const RECUL_APRES_ECHEC_MS = 700

/**
 * La veille n'écoute que si tout est réuni : le réglage est activé, l'app
 * est réellement à l'écran, et rien d'autre ne se sert du micro.
 *
 * « error » compte comme un repos : sans ça, la moindre erreur tuait la
 * veille pour de bon (déjà signalé une fois, ne pas y revenir).
 */
export function peutEcouterEnVeille(p: { actif: boolean; visible: boolean; statut: StatutVoix }): boolean {
  if (!p.actif || !p.visible) return false
  return p.statut === "idle" || p.statut === "error"
}

export type SuiteRafale =
  /** Quelqu'un a pris la main pendant la rafale : ne toucher à rien. */
  | "laisser"
  /** « Jarvis, ajoute une tâche » : la demande est déjà là, on la traite. */
  | "conversation"
  /** « Jarvis » seul : on ouvre le micro et on le dit. */
  | "oui"
  /** Rien, ou une phrase qui ne nous était pas adressée : on reste au repos. */
  | "repos"

/**
 * Ce qu'il faut faire d'une rafale terminée.
 *
 * @param priseAvant  numéro de prise au lancement de la rafale
 * @param priseApres  numéro de prise maintenant — s'il a changé, un appui sur
 *                    le cœur (ou une autre rafale) a pris la main entre-temps
 */
export function apresRafale(p: {
  priseAvant: number
  priseApres: number
  transcript: string | null
}): { suite: SuiteRafale; demande: string } {
  if (p.priseAvant !== p.priseApres) return { suite: "laisser", demande: "" }
  if (!p.transcript) return { suite: "repos", demande: "" }
  const { trouve, reste } = chercherMotCle(p.transcript)
  if (!trouve) return { suite: "repos", demande: "" }
  return reste.length > 3 ? { suite: "conversation", demande: reste } : { suite: "oui", demande: "" }
}

/** Ce qu'on affiche pendant une rafale : rien tant que « Jarvis » n'a pas
 * été dit — une phrase qui ne nous est pas adressée n'a pas à s'afficher. */
export function texteAAfficherEnVeille(partiel: string): string | null {
  const { trouve, reste } = chercherMotCle(partiel)
  return trouve ? reste : null
}

/** Plafond du recul entre deux rafales muettes. Au-delà, « Jarvis » dit
 * dans le trou serait raté trop souvent. */
export const RECUL_MAX_MS = 8000

/**
 * Délai avant la rafale suivante.
 *
 * Le service Android meurt après quelques secondes de silence, et chaque
 * redémarrage joue une tonalité sur Samsung. Tant que personne ne parle, on
 * espace donc les rafales — 1 s, 2 s, 4 s, 8 s — au lieu de biper toutes
 * les cinq secondes. Dès qu'un mot est entendu, on repart serré.
 *
 * @param rafalesMuettes  nombre de rafales consécutives sans un seul mot
 */
export function delaiAvantRafaleSuivante(echecDemarrage: boolean, rafalesMuettes = 0): number {
  if (echecDemarrage) return RECUL_APRES_ECHEC_MS
  if (rafalesMuettes <= 0) return RESPIRATION_MS
  return Math.min(RECUL_MAX_MS, 1000 * 2 ** (rafalesMuettes - 1))
}

/**
 * Le « Oui ? » de Jarvis est dit PENDANT que le micro s'ouvre (voir
 * MicButton) : sur un appareil rapide, le moteur peut l'entendre et le coller
 * au début de la demande. On le retire — mais seulement lui, en tête, et
 * seulement s'il reste quelque chose derrière : un « oui » qui répond à une
 * question n'est pas un écho.
 */
export function sansAccuse(transcript: string): string {
  const m = transcript.match(/^\s*(?:oui|ouais)\s*[?!.,]*\s+(\S.*)$/i)
  return m ? m[1] : transcript
}
