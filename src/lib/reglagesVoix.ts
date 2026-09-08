/**
 * Les réglages que Jarvis peut lire ET changer lui-même, à la voix.
 *
 * Chantier f7137b0c, ses mots : « il doit connaître tout son environnement
 * et doit pouvoir répondre à n'importe quelle question le concernant […],
 * modifier ses propres réglages lui-même ». `_shared/environnement.ts` et
 * `_shared/branchements.ts` répondaient déjà à « où » et « à quoi es-tu
 * branché » ; rien ne permettait de dire « change ça ».
 *
 * POURQUOI UNE LISTE FERMÉE, ET PAS N'IMPORTE QUEL RÉGLAGE DE `reglages.ts`.
 * Certains réglages sont des objets complexes (le widget, déjà couvert par sa
 * propre action `configure_widget`), d'autres exigent une autorisation
 * Android réelle (la bulle flottante, la lecture des notifications — les
 * activer par la voix sans le geste système ne changerait rien et mentirait
 * sur l'état) ou une liste qu'on ne réécrit pas d'un coup (la liste noire de
 * l'écran, déjà couverte par `block_screen_app`). Ceux-ci sont des scalaires
 * (bool ou énuméré) et sans danger à changer d'un mot : la voix, le mot-clé,
 * la géolocalisation, le thème, la mémoire, les mises à jour et deux
 * interrupteurs internes.
 *
 * CHAQUE OPTION PORTE SA VALEUR STOCKÉE EXACTE — pas une conversion
 * générique — parce que ce projet ne code pas ses booléens de façon
 * uniforme : `jarvis_wake_word_enabled` vaut "1"/"0",
 * `jarvis_moteur_auto` vaut "true"/"false", `jarvis_ia_relais_lecture` vaut
 * "1" ou l'ABSENCE de la clé (null). Deviner une convention commune aurait
 * fini par écrire une valeur qu'aucun lecteur ne reconnaît. Chaque ligne est
 * relue depuis le module qui possède réellement le réglage
 * (`src/hooks/useWakeWordSetting.ts`, `src/lib/theme.ts`, etc.), jamais
 * inventée.
 *
 * Le modèle ne reçoit QUE `cle` et `cleValeur` dans son schéma (voir
 * `supabase/functions/voice-command/index.ts`, action `set_setting`) : c'est
 * ici, côté client, qu'on traduit vers la vraie représentation stockée — la
 * même défense qu'ailleurs contre une valeur inventée par une phrase mal
 * comprise.
 */

export interface OptionReglageVoix {
  /** Ce que le modèle envoie dans `setting_valeur`. */
  cleValeur: string
  /** La valeur RÉELLEMENT stockée par `ecrireReglage` ; `null` = on retire la clé. */
  stocke: string | null
  /** Comment on le dit à voix haute une fois fait. */
  dit: string
}

export interface ReglageVoix {
  cle: string
  /** Comment on nomme ce réglage dans une phrase. */
  nom: string
  /** Où il se règle aussi depuis l'écran — repris de `src/lib/reglages.ts`. */
  ou: string
  options: OptionReglageVoix[]
}

export const REGLAGES_VOIX: ReglageVoix[] = [
  {
    cle: "jarvis_wake_word_enabled",
    nom: "le mot-clé de réveil « Jarvis »",
    ou: "Paramètres › Voix et écoute › Mot-clé de réveil",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activé" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivé" },
    ],
  },
  {
    cle: "jarvis_geofence_enabled",
    nom: "les rappels de lieu par géolocalisation réelle",
    ou: "Paramètres › Tâches et organisation › Rappels de lieu",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activés" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivés" },
    ],
  },
  {
    cle: "jarvis_theme",
    nom: "le thème de l'application",
    ou: "Paramètres › Apparence › Thème",
    options: [
      { cleValeur: "clair", stocke: "light", dit: "clair" },
      { cleValeur: "sombre", stocke: "dark", dit: "sombre" },
      { cleValeur: "systeme", stocke: "system", dit: "comme le téléphone" },
    ],
  },
  {
    cle: "jarvis_memoire_retention",
    nom: "combien de temps il garde le mot-à-mot des conversations",
    ou: "Paramètres › Mémoire",
    options: [
      { cleValeur: "illimite", stocke: "illimite", dit: "sans limite" },
      { cleValeur: "7", stocke: "7", dit: "7 jours" },
      { cleValeur: "30", stocke: "30", dit: "30 jours" },
      { cleValeur: "90", stocke: "90", dit: "90 jours" },
    ],
  },
  {
    cle: "jarvis_delai_annulation",
    nom: "le délai pour annuler une action dans une autre application",
    ou: "Paramètres › Ce que Jarvis utilise › Le temps de l'arrêter",
    options: [
      { cleValeur: "immediat", stocke: "0", dit: "immédiat" },
      { cleValeur: "3", stocke: "3000", dit: "3 secondes" },
      { cleValeur: "5", stocke: "5000", dit: "5 secondes" },
      { cleValeur: "8", stocke: "8000", dit: "8 secondes" },
    ],
  },
  {
    cle: "jarvis_maj_auto",
    nom: "l'application automatique des mises à jour rapides",
    ou: "Paramètres › L'application › Mettre à jour l'application",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activée" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivée" },
    ],
  },
  {
    cle: "jarvis_moteur_auto",
    nom: "la veille automatique du moteur de langue",
    ou: "Paramètres › Le cockpit › Le moteur de langue",
    options: [
      { cleValeur: "actif", stocke: "true", dit: "activée" },
      { cleValeur: "inactif", stocke: "false", dit: "gelée" },
    ],
  },
  {
    cle: "jarvis_sessions_autonomes",
    nom: "les sessions autonomes de développement",
    ou: "Paramètres › Le cockpit › Sessions autonomes",
    options: [
      { cleValeur: "actif", stocke: "true", dit: "activées" },
      { cleValeur: "inactif", stocke: "false", dit: "désactivées" },
    ],
  },
  {
    cle: "jarvis_ia_relais_lecture",
    nom: "la lecture à voix haute des réponses d'une IA relayée",
    ou: "Paramètres › Ce que Jarvis utilise › Tes applications d'IA",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activée" },
      { cleValeur: "inactif", stocke: null, dit: "désactivée" },
    ],
  },
]

export function trouverReglageVoix(cle: string): ReglageVoix | undefined {
  return REGLAGES_VOIX.find((r) => r.cle === cle)
}

export function trouverOptionReglageVoix(
  cle: string,
  cleValeur: string,
): OptionReglageVoix | undefined {
  return trouverReglageVoix(cle)?.options.find((o) => o.cleValeur === cleValeur)
}

/**
 * Ce qu'on répond à « qu'est-ce que tu peux régler toi-même ? ». Jamais
 * appelée pour construire une consigne à chaque phrase (trop long, et
 * `_shared/branchements.ts` dit déjà l'état courant) — seulement pour une
 * réponse ponctuelle à cette question précise.
 */
export function listeReglagesVoix(): string {
  return REGLAGES_VOIX.map(
    (r) => `${r.nom} (${r.options.map((o) => o.dit).join(" / ")})`,
  ).join(", ")
}
