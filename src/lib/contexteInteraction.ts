/**
 * Ce que Raphaël vient de toucher, et sur quel écran — pour reconstituer
 * APRÈS COUP comment Jarvis s'est comporté, sans avoir à deviner.
 *
 * Chantier 6d94ab6a, 17 sept. 2026. Sa demande : « mieux comprendre comment
 * Jarvis se comporte lors de mes requêtes et de mes différents problèmes
 * (voix + interactions de clic dans l'app) ». Sa réponse au périmètre, le
 * même jour : « Enrichir l'existant » — pas un quatrième endroit, mais plus
 * de détail dans `journal_ecoute` et `jarvis_erreurs`.
 *
 * Ce module est le point UNIQUE que les deux lisent :
 *   — `journalEcoute.ts` y prend l'écran et le dernier clic pour enrichir
 *     CHAQUE événement du journal, sans toucher aux dizaines d'appels à
 *     `noterEcoute` disséminés dans l'app ;
 *   — `erreurs.ts` y prend l'écran (et le dernier clic) pour remplir
 *     `jarvis_erreurs.contexte` quand l'appelant n'en a pas fourni un —
 *     c'est le cas de la quasi-totalité des erreurs `systeme`, celles de
 *     `withErrorToast` (src/lib/notifyError.ts), branché sur TOUTES les
 *     écritures de l'app, qui ne savait dire ni où ni sur quoi ça avait
 *     lâché.
 *
 * PUR à l'exception de deux variables de module (écran actuel, dernier
 * appui) — même discipline que `derniereParole` dans journalEcoute.ts : en
 * mémoire seulement, jamais en base ni en stockage local, parce que la
 * question posée est « où en est-il MAINTENANT », pas « où en était-il à la
 * dernière ouverture de l'app ». Aucun accès au DOM ni à React ici : c'est ce
 * qui permet à `erreurs.ts` de continuer à importer ce fichier au niveau
 * racine et de rester chargeable sous Node
 * (`scripts/verifier-contexte-interaction.ts`,
 * `scripts/verifier-raison-ecoute.ts`). `Capacitor.isNativePlatform()` (pour
 * `plateforme` ci-dessous) n'y fait pas exception : elle ne lit que
 * `globalThis`, jamais `window`/`document`, donc reste sans effet sous Node
 * (rend "web", comme en vrai dans un navigateur). La capture réelle des clics — qui a
 * besoin du DOM — vit dans `src/hooks/useTraceInteractions.ts` et se
 * contente d'appeler `noterAppui`/`noterEcranActuel`.
 */

import { Capacitor } from "@capacitor/core"

/**
 * Les noms d'écran, alignés avec la barre d'onglets (DashboardLayout.tsx) et
 * les pages qui n'y figurent pas. Un chemin inconnu se montre tel quel plutôt
 * que de se taire : un futur écran ajouté à l'app sans être ajouté ici ne
 * casse rien, il perd juste son joli nom.
 */
const NOMS_ECRAN: Record<string, string> = {
  "/": "Tâches",
  "/cockpit": "Cockpit dev",
  "/documents": "Docs",
  "/notes": "Notes",
  "/memoire": "Mémoire",
  "/settings": "Paramètres",
  "/assistant": "Fenêtre d'assistance",
  "/login": "Connexion",
}

/** Le nom lisible d'un écran, à partir du chemin de la route (la recherche
 * `?...` et un éventuel `/` de fin sont ignorés). */
export function nomEcran(pathname: string): string {
  const chemin = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/"
  return NOMS_ECRAN[chemin] ?? chemin
}

/**
 * Au-delà, un clic n'explique plus ce qui vient de se produire : trop de
 * temps s'est écoulé, autre chose a pu se passer entre les deux (une phrase
 * dictée, un changement d'écran).
 */
export const FENETRE_CLIC_MS = 30_000

export interface Appui {
  libelle: string
  at: number
}

export interface AppuiRecent {
  libelle: string
  il_y_a_ms: number
}

/** Décide si un appui mémorisé explique encore ce qui vient de se produire à
 * `maintenant`. Un délai négatif (horloge qui recule) est traité comme trop
 * vieux, jamais comme "à l'instant". */
export function appuiPertinent(appui: Appui | null, maintenant: number): AppuiRecent | null {
  if (!appui) return null
  const il_y_a_ms = maintenant - appui.at
  if (il_y_a_ms < 0 || il_y_a_ms > FENETRE_CLIC_MS) return null
  return { libelle: appui.libelle, il_y_a_ms }
}

/**
 * Le texte lisible d'un élément touché : ce que Raphaël lit dessus, pas son
 * markup. `aria-label` d'abord — les boutons icône (une croix, une corbeille)
 * n'ont que ça — sinon le texte visible, coupé pour ne pas noyer une ligne de
 * journal avec le contenu d'une carte entière.
 */
export function libelleElement(ariaLabel: string | null, texte: string | null): string | null {
  const source = (ariaLabel || texte || "").replace(/\s+/g, " ").trim()
  if (!source) return null
  return source.length > 60 ? `${source.slice(0, 60)}…` : source
}

// --- État de module -------------------------------------------------------
// Écrit depuis useTraceInteractions.ts (DOM + route), lu depuis
// journalEcoute.ts et erreurs.ts. Volontairement PAS dans React (contexte,
// state) : les deux lecteurs sont hors composant, appelés depuis des
// promesses et des effets qui n'ont ni l'un ni l'autre sous la main.

let ecranValeur = "/"
let dernierAppuiValeur: Appui | null = null

/** Appelé à chaque changement de route. */
export function noterEcranActuel(pathname: string): void {
  ecranValeur = pathname
}

/** Appelé à chaque clic sur un élément interactif. `null` (rien de lisible
 * dessus) laisse le dernier appui connu inchangé plutôt que de l'effacer.
 * `at` n'est là que pour les vérifications hors ligne — en usage réel, c'est
 * toujours l'instant de l'appel. */
export function noterAppui(libelle: string | null, at: number = Date.now()): void {
  if (!libelle) return
  dernierAppuiValeur = { libelle, at }
}

/** Pour les vérifications : remet l'état à zéro entre deux cas. */
export function reinitialiserContexteInteraction(): void {
  ecranValeur = "/"
  dernierAppuiValeur = null
}

/**
 * Ce qu'on ajoute à CHAQUE événement de `journal_ecoute` : l'écran affiché et,
 * s'il est encore pertinent, le dernier élément touché. `null` (jamais 0 ou
 * une chaîne vide) quand il n'y a rien à dire — même règle que le reste du
 * journal (`ms_ouverture`, `ms_premier_mot`) : un zéro se lirait comme
 * "aucun délai", ce qui est faux.
 *
 * `plateforme` — chantier f0228dc7, 23 sept. 2026 : sa remarque « ça le fait
 * toujours un peu sur la version web » ne pouvait pas se vérifier, faute de
 * pouvoir séparer ses rafales web de ses rafales Android dans les mêmes
 * requêtes. L'écoute web passe par `webkitSpeechRecognition` (le
 * navigateur), l'écoute app par le SpeechRecognizer d'Android — deux chemins
 * différents, donc pas la même cause à supposer. Un seul point à brancher.
 */
export function detailInteraction(maintenant: number = Date.now()): {
  ecran: string
  clic: string | null
  clic_il_y_a_ms: number | null
  plateforme: "app" | "web"
} {
  const appui = appuiPertinent(dernierAppuiValeur, maintenant)
  return {
    ecran: nomEcran(ecranValeur),
    clic: appui?.libelle ?? null,
    clic_il_y_a_ms: appui?.il_y_a_ms ?? null,
    plateforme: Capacitor.isNativePlatform() ? "app" : "web",
  }
}

/**
 * Le texte à mettre dans `jarvis_erreurs.contexte` quand l'appelant n'en a
 * pas fourni un lui-même (le cas de la plupart des erreurs `systeme` — voir
 * l'en-tête de ce fichier). Un appelant qui a déjà quelque chose de plus
 * précis à dire (la phrase dictée, par exemple) garde la main : voir
 * `signalerErreur` dans erreurs.ts, qui n'appelle ceci qu'en repli.
 */
export function contextePourErreur(maintenant: number = Date.now()): string {
  const appui = appuiPertinent(dernierAppuiValeur, maintenant)
  const ecran = `Écran : ${nomEcran(ecranValeur)}`
  if (!appui) return ecran
  const secondes = Math.round(appui.il_y_a_ms / 1000)
  return `${ecran} — dernier bouton touché : « ${appui.libelle} » (${secondes} s avant)`
}
