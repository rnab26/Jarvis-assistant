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
  /** Les mots qui DÉSIGNENT cette valeur dans sa phrase (texte aplati, sans
   * accents ni majuscules). Absent pour un interrupteur : c'est le VERBE
   * (active / désactive) qui dit la valeur. */
  mots?: RegExp
}

export interface ReglageVoix {
  cle: string
  /** Comment on nomme ce réglage dans une phrase. */
  nom: string
  /** Où il se règle aussi depuis l'écran — repris de `src/lib/reglages.ts`. */
  ou: string
  options: OptionReglageVoix[]
  /** La valeur stockée quand la clé est ABSENTE, telle que la lit le module
   * qui possède le réglage (relue dans chacun, jamais supposée). C'est ce qui
   * permet de dire sa valeur ACTUELLE à « qu'est-ce que j'ai réglé ? ». */
  defaut: string | null
  /** Comment il DÉSIGNE ce réglage dans une phrase (texte aplati). Absent :
   * le réglage ne se reconnaît pas sur le téléphone, seul le serveur le peut. */
  motif?: RegExp
  /** Réglage à paliers ORDONNÉS : « plus » avance dans `options`, « moins »
   * recule. Les deux libellés disent le sens en clair. */
  ajustable?: { plus: string; moins: string }
  /** Une valeur hors paliers (réglée au curseur dans Paramètres) : comment la
   * dire. Absent : un réglage à valeurs fermées. */
  direNombre?: (valeur: number) => string
  /** Ajouté à la confirmation : ce que ça change vraiment, et ses limites. */
  conseil?: string
}

export const REGLAGES_VOIX: ReglageVoix[] = [
  {
    // useWakeWordSetting.ts : seul « 1 » l'allume.
    cle: "jarvis_wake_word_enabled",
    nom: "le mot-clé de réveil « Jarvis »",
    ou: "Paramètres › Voix et écoute › Mot-clé de réveil",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activé" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivé" },
    ],
    defaut: "0",
    motif: /mot[- ]cle(?: de reveil)?|reveil (?:par|a) la voix|ecoute du mot[- ]cle/,
  },
  {
    // useGeofenceSetting.ts : seul « 1 » l'allume.
    cle: "jarvis_geofence_enabled",
    nom: "les rappels de lieu par géolocalisation réelle",
    ou: "Paramètres › Tâches et organisation › Rappels de lieu",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activés" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivés" },
    ],
    defaut: "0",
    motif: /rappels? de lieux?|geolocalisation(?: des rappels| reelle)?/,
  },
  {
    // App.tsx : ThemeProvider defaultTheme="system".
    cle: "jarvis_theme",
    nom: "le thème de l'application",
    ou: "Paramètres › Apparence › Thème",
    options: [
      { cleValeur: "clair", stocke: "light", dit: "clair", mots: /^(?:en )?(?:clair|jour|blanc)$/ },
      { cleValeur: "sombre", stocke: "dark", dit: "sombre", mots: /^(?:en )?(?:sombre|nuit|noir)$/ },
      {
        cleValeur: "systeme",
        stocke: "system",
        dit: "comme le téléphone",
        mots: /^(?:comme le telephone|automatique|auto|systeme|du systeme|du telephone)$/,
      },
    ],
    defaut: "system",
    motif: /(?:theme|mode|affichage)(?: de l['’]?\s*(?:application|app|ecran))?/,
  },
  {
    // memoirePrefs.ts : RETENTION_PAR_DEFAUT = "illimite".
    cle: "jarvis_memoire_retention",
    nom: "combien de temps il garde le mot-à-mot des conversations",
    ou: "Paramètres › Mémoire",
    options: [
      { cleValeur: "illimite", stocke: "illimite", dit: "sans limite", mots: /^(?:sans limite|illimite|toujours|pour toujours|tout le temps)$/ },
      { cleValeur: "7", stocke: "7", dit: "7 jours", mots: /^(?:7|sept) jours|une semaine$/ },
      { cleValeur: "30", stocke: "30", dit: "30 jours", mots: /^(?:30|trente) jours|un mois$/ },
      { cleValeur: "90", stocke: "90", dit: "90 jours", mots: /^(?:90|quatre-vingt-dix) jours|trois mois$/ },
    ],
    defaut: "illimite",
    motif: /(?:la )?(?:conservation|duree de conservation) (?:des|de mes) conversations|(?:mes|les) conversations/,
  },
  {
    // actionsTelephoneFenetre.ts : DELAI_ANNULATION_DEFAUT = 3000.
    cle: "jarvis_delai_annulation",
    nom: "le délai pour annuler une action dans une autre application",
    ou: "Paramètres › Ce que Jarvis utilise › Le temps de l'arrêter",
    options: [
      { cleValeur: "immediat", stocke: "0", dit: "immédiat", mots: /^(?:immediat|aucun|zero|0|pas de delai|sans delai)$/ },
      { cleValeur: "3", stocke: "3000", dit: "3 secondes", mots: /^(?:3|trois) secondes?$/ },
      { cleValeur: "5", stocke: "5000", dit: "5 secondes", mots: /^(?:5|cinq) secondes?$/ },
      { cleValeur: "8", stocke: "8000", dit: "8 secondes", mots: /^(?:8|huit) secondes?$/ },
    ],
    defaut: "3000",
    motif: /(?:delai|temps) (?:d['’]\s*annulation|pour annuler|de l['’]\s*arreter)/,
  },
  {
    // majPrefs.ts : tout sauf « 0 » = oui.
    cle: "jarvis_maj_auto",
    nom: "l'application automatique des mises à jour rapides",
    ou: "Paramètres › L'application › Mettre à jour l'application",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activée" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivée" },
    ],
    defaut: "1",
    motif: /mises? a jour (?:rapides? )?automatiques?/,
  },
  {
    // veilleMoteur.ts : VEILLE_PAR_DEFAUT = true, écrit "true"/"false".
    cle: "jarvis_moteur_auto",
    nom: "la veille automatique du moteur de langue",
    ou: "Paramètres › Le cockpit › Le moteur de langue",
    options: [
      { cleValeur: "actif", stocke: "true", dit: "activée" },
      { cleValeur: "inactif", stocke: "false", dit: "gelée" },
    ],
    defaut: "true",
    motif: /veille (?:automatique )?du moteur(?: de langue)?|changement automatique (?:de|du) moteur/,
  },
  {
    // passeAutonome.ts : AUTONOMIE_PAR_DEFAUT = true.
    cle: "jarvis_sessions_autonomes",
    nom: "les sessions autonomes de développement",
    ou: "Paramètres › Le cockpit › Sessions autonomes",
    options: [
      { cleValeur: "actif", stocke: "true", dit: "activées" },
      { cleValeur: "inactif", stocke: "false", dit: "désactivées" },
    ],
    defaut: "true",
    motif: /sessions? autonomes?(?: de developpement)?/,
  },
  {
    // relaisIA.ts : seul « 1 » l'allume, l'absence le coupe.
    cle: "jarvis_ia_relais_lecture",
    nom: "la lecture à voix haute des réponses d'une IA relayée",
    ou: "Paramètres › Ce que Jarvis utilise › Tes applications d'IA",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activée" },
      { cleValeur: "inactif", stocke: null, dit: "désactivée" },
    ],
    defaut: null,
    motif: /lecture (?:a voix haute )?des reponses (?:d['’]\s*(?:une )?ia|des ia|de l['’]\s*ia)(?: a voix haute)?/,
  },
  // ── Ajoutés le 23 sept. 2026 (chantier 8e1da88b). Chacun relu dans le
  // module qui possède la clé, et chacun RELU par son écran ou son hook sur
  // REGLAGES_RESTAURES — sinon le changer à la voix ne changerait rien avant
  // un redémarrage. Écartés exprès : l'annonce app fermée (recopiée côté
  // Android par son écran, une écriture ici la laisserait désalignée), la
  // hauteur de la voix, l'archive des tâches (lue une seule fois à l'ouverture
  // de l'onglet), et l'envoi automatique des messages (envoi en son nom :
  // jamais sans lui).
  {
    // voicePrefs.ts : absent ou « 1 » = oui, seul « 0 » coupe.
    cle: "jarvis_voice_confirmer_resultat",
    nom: "l'annonce à voix haute du résultat de chaque action",
    ou: "Paramètres › Voix et écoute › Voix de Jarvis",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activée" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivée" },
    ],
    defaut: "1",
    motif: /annonces? (?:a voix haute )?(?:du|des) resultats?(?: de chaque action| des actions)?|confirmations? (?:vocales?|a voix haute)/,
  },
  {
    // livePrefs.ts : « 1 » seulement.
    cle: "jarvis_mode_live",
    nom: "le mode conversation Live",
    ou: "Paramètres › Voix et écoute › Mode conversation Live",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activé" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivé" },
    ],
    defaut: "0",
    motif: /mode (?:conversation )?live|conversation live/,
  },
  {
    // livePrefs.ts : absent = oui, « 1 »/« 0 » sinon.
    cle: "jarvis_live_cloture_actif",
    nom: "la fin de conversation à la voix (« terminé », « au revoir »)",
    ou: "Paramètres › Voix et écoute › Mode conversation Live",
    options: [
      { cleValeur: "actif", stocke: "1", dit: "activée" },
      { cleValeur: "inactif", stocke: "0", dit: "désactivée" },
    ],
    defaut: "1",
    motif: /(?:fin|cloture) (?:de (?:la )?conversation )?(?:a la voix|vocale)/,
  },
  {
    // cockpitSimplifie.ts : « true »/« false », pas « 1 »/« 0 ».
    cle: "jarvis_cockpit_simplifie",
    nom: "la vue simple du cockpit",
    ou: "Paramètres › Le cockpit",
    options: [
      { cleValeur: "actif", stocke: "true", dit: "activée" },
      { cleValeur: "inactif", stocke: "false", dit: "désactivée" },
    ],
    defaut: "false",
    motif: /(?:vue|mode) simple(?: du cockpit)?/,
  },
  {
    // ouJenSuis.ts, FenetreBilan : « aujourdhui » | « 24h » | « 7j ».
    cle: "jarvis_cockpit_fenetre",
    nom: "ce que le cockpit compte comme livré",
    ou: "Paramètres › Le cockpit",
    options: [
      { cleValeur: "aujourdhui", stocke: "aujourdhui", dit: "depuis ce matin" },
      { cleValeur: "24h", stocke: "24h", dit: "sur les dernières 24 heures" },
      { cleValeur: "7j", stocke: "7j", dit: "sur les sept derniers jours" },
    ],
    defaut: "aujourdhui",
  },
  // ── Ajoutés le soir du 23 sept. 2026, à sa demande après un essai : « règle
  // ta vitesse de réponse quand je pose une question […] il y a beaucoup de
  // réglages, à l'utilisation ça devient vite difficile ». Ce sont des
  // CURSEURS dans Paramètres : la voix les règle par PALIERS nommés, et
  // « plus vite » / « moins vite » avance d'un palier. Une valeur posée au
  // curseur entre deux paliers se dit telle quelle, en secondes.
  {
    // dialoguePrefs.ts : DEFAULT_PAUSE_MS = 2000, bornes 600-6000. Lu à
    // chaque tour d'écoute par useSpeechRecognition.
    cle: "jarvis_dialogue_pause_ms",
    nom: "ma vitesse de réponse (le silence que j'attends après ta dernière parole)",
    ou: "Paramètres › Voix et écoute › Rythme de la discussion",
    options: [
      { cleValeur: "pose", stocke: "3500", dit: "posée (3,5 secondes de silence)", mots: /^(?:posee?|lente?|calme|tranquille)$/ },
      { cleValeur: "normal", stocke: "2000", dit: "normale (2 secondes de silence)", mots: /^(?:normale?|moyenne?|par defaut)$/ },
      { cleValeur: "rapide", stocke: "1000", dit: "rapide (1 seconde de silence)", mots: /^(?:rapide|vite|reactive|courte?)$/ },
    ],
    defaut: "2000",
    motif: /vitesse de (?:ta |ma )?reponse|delai de (?:ta |ma )?reponse|temps de reponse|rapidite de (?:ta )?reponse/,
    ajustable: { plus: "je réponds plus vite", moins: "je te laisse plus de temps" },
    direNombre: (ms) => `${String(Math.round(ms / 100) / 10).replace(".", ",")} seconde${ms >= 2000 ? "s" : ""} de silence`,
    conseil:
      "Ça raccourcit l'attente après ta dernière parole ; le temps que met le serveur à comprendre, lui, ne change pas. Si je te coupe la parole, dis « réponds moins vite ».",
  },
  {
    // voicePrefs.ts : DEFAULT_RATE = 1.15, bornes 0.5-2. Relu à chaque phrase
    // dite (parler.ts).
    cle: "jarvis_voice_rate",
    nom: "la vitesse de ma voix",
    ou: "Paramètres › Voix et écoute › Voix de Jarvis",
    options: [
      { cleValeur: "lente", stocke: "0.9", dit: "lente", mots: /^(?:lente?|lentement|doucement)$/ },
      { cleValeur: "normale", stocke: "1.15", dit: "normale", mots: /^(?:normale?|par defaut)$/ },
      { cleValeur: "rapide", stocke: "1.4", dit: "rapide", mots: /^(?:rapide|vite|rapidement)$/ },
    ],
    defaut: "1.15",
    motif: /vitesse de (?:ta |la |ma )?(?:voix|parole|lecture|diction)|debit de (?:ta |la )?(?:voix|parole)|ton debit/,
    ajustable: { plus: "je parle plus vite", moins: "je parle plus lentement" },
    direNombre: (x) => `${String(Math.round(x * 100) / 100).replace(".", ",")} fois la vitesse normale`,
  },
  {
    // dialoguePrefs.ts : DEFAULT_SUITE_MS = 8000, bornes 0-15000. Relu par
    // useDialogueSetting sur REGLAGES_RESTAURES.
    cle: "jarvis_dialogue_suite_ms",
    nom: "le temps que je t'écoute encore après t'avoir répondu",
    ou: "Paramètres › Voix et écoute › Rythme de la discussion",
    options: [
      { cleValeur: "coupe", stocke: "0", dit: "coupé (je n'écoute plus après avoir répondu)", mots: /^(?:coupe|rien|aucun|jamais|zero|0)$/ },
      { cleValeur: "court", stocke: "4000", dit: "court (4 secondes)", mots: /^(?:court|courte|4 secondes|quatre secondes)$/ },
      { cleValeur: "normal", stocke: "8000", dit: "normal (8 secondes)", mots: /^(?:normale?|par defaut|8 secondes|huit secondes)$/ },
      { cleValeur: "long", stocke: "12000", dit: "long (12 secondes)", mots: /^(?:long|longue|12 secondes|douze secondes)$/ },
    ],
    defaut: "8000",
    motif: /(?:temps d['’]\s*)?ecoute apres (?:ta |ma )?reponse|ecoute apres avoir repondu/,
    ajustable: { plus: "je t'écoute plus longtemps après avoir répondu", moins: "je t'écoute moins longtemps après avoir répondu" },
    direNombre: (ms) => (ms === 0 ? "coupé" : `${Math.round(ms / 1000)} secondes`),
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

// ─────────────────────────────────────────────────────────────────────────────
// Sur le TÉLÉPHONE, sans le serveur (23 sept. 2026, au soir).
//
// Ses mots, après un essai : « elle est toujours pas capable de me dire
// qu'est-ce que j'ai paramétré […] j'aimerais pouvoir régler Jarvis à l'oral,
// dire “règle ta vitesse de réponse” […] il y a beaucoup de réglages, à
// l'utilisation ça devient vite difficile ». MESURÉ le même soir sur la vraie
// consigne Live : à « Règle ta vitesse de réponse sur rapide », le modèle a
// répondu deux fois sur trois « je ne peux pas modifier ce réglage » sans
// même appeler l'outil, et la seule commande de sa conversation de 16 h 06
// (« activer la lecture des rappels à voix haute ») est morte sur un serveur
// saturé. Un réglage n'a besoin d'aucun modèle : il se reconnaît et s'écrit
// ici, en quelques millisecondes, même quand Google sature.
// ─────────────────────────────────────────────────────────────────────────────

/** La valeur ACTUELLE, lue comme la lit le module qui possède le réglage :
 * une clé absente vaut `defaut`, une valeur inconnue retombe aussi sur
 * `defaut` (c'est ce que font tous les lecteurs relus), et un curseur réglé
 * entre deux paliers se dit tel quel. */
export function valeurActuelle(
  r: ReglageVoix,
  brut: string | null,
): { option: OptionReglageVoix | null; dit: string; nombre: number | null } {
  const v = brut === null || brut === "" ? r.defaut : brut
  const exacte = r.options.find((o) => o.stocke === v)
  if (exacte) return { option: exacte, dit: exacte.dit, nombre: v === null ? null : Number(v) }
  if (r.direNombre && v !== null && Number.isFinite(Number(v))) {
    const n = Number(v)
    const egale = r.options.find((o) => o.stocke !== null && Number(o.stocke) === n)
    if (egale) return { option: egale, dit: egale.dit, nombre: n }
    return { option: null, dit: r.direNombre(n), nombre: n }
  }
  const parDefaut = r.options.find((o) => o.stocke === r.defaut) ?? r.options[0]
  return { option: parDefaut, dit: parDefaut.dit, nombre: null }
}

/** Le palier suivant dans le sens demandé (`sens` 1 = « plus », vers la fin
 * de `options`), ou `null` quand on est déjà au bout. Une valeur posée au
 * curseur ENTRE deux paliers va au plus proche dans ce sens — jamais un
 * palier dans le sens contraire. */
export function ajuster(r: ReglageVoix, brut: string | null, sens: 1 | -1): OptionReglageVoix | null {
  const { option, nombre } = valeurActuelle(r, brut)
  if (option) {
    const i = r.options.indexOf(option)
    return r.options[i + sens] ?? null
  }
  if (nombre === null) return null
  const nombres = r.options.map((o) => Number(o.stocke))
  const croissant = nombres[nombres.length - 1] > nombres[0] ? 1 : -1
  let meilleur: OptionReglageVoix | null = null
  let ecart = Infinity
  r.options.forEach((o, i) => {
    const d = (nombres[i] - nombre) * croissant * sens
    if (d > 0 && d < ecart) {
      ecart = d
      meilleur = o
    }
  })
  return meilleur
}

export type CommandeReglage =
  | { type: "regler"; cle: string; cleValeur: string }
  | { type: "ajuster"; cle: string; sens: 1 | -1 }
  | { type: "etat"; cle: string | null }

const DET = "(?:le |la |les |l['’]\\s*|ton |ta |tes |mon |ma |mes |du |de la |des )?"
const ALLUME = "active|reactive|allume|rallume|remets|mets en marche|demarre|passe en|bascule en|branche"
const ETEINT = "desactive|coupe|eteins|arrete|stoppe|enleve|retire|debranche|supprime"

/** « quels sont mes réglages », « qu'est-ce que j'ai paramétré », « qu'est-ce
 * que tu peux régler » : l'état de TOUT, avec ce qu'il peut changer. */
const LISTE = new RegExp(
  "^(?:" +
    [
      "(?:quels?|quelles?) sont (?:mes|tes|les) (?:reglages|parametres)(?: actuels)?(?: de (?:jarvis|l['’]\\s*application|l['’]\\s*app))?",
      "(?:dis|donne|liste|rappelle|lis|resume)[- ]moi (?:mes|tes|les) (?:reglages|parametres)(?: actuels)?",
      "qu['’]\\s*est[- ]ce que (?:j['’]\\s*ai|tu as|on a|je t['’]\\s*ai) (?:regle|parametre|configure|active)(?: (?:chez toi|dans (?:l['’]\\s*)?(?:app|application|jarvis)|comme reglages?))?",
      "qu['’]\\s*est[- ]ce qui est (?:regle|parametre|configure|active)(?: chez toi| dans (?:l['’]\\s*)?(?:app|application))?",
      "comment (?:tu es|es[- ]tu|t['’]\\s*es|est[- ]ce que tu es) (?:regle|parametre|configure)e?",
      "c['’]\\s*est quoi (?:mes|tes) (?:reglages|parametres)",
      "(?:mes|tes) reglages",
      "qu['’]\\s*est[- ]ce que (?:tu peux|je peux te faire) (?:regler|changer|modifier)(?: (?:toi[- ]meme|tout seul|a la voix))?",
      "(?:quels?|quelles?) reglages (?:tu peux|peux[- ]tu|je peux) (?:regler|changer|modifier)(?: (?:toi[- ]meme|a la voix))?",
    ].join("|") +
    ")$",
)

/** « Plus » / « moins », dits sans nommer le réglage : SES tournures. */
const RELATIFS: ReadonlyArray<{ cle: string; sens: 1 | -1; motif: RegExp }> = [
  {
    cle: "jarvis_dialogue_pause_ms",
    sens: 1,
    motif: /^(?:reponds?|repondre)(?:[- ]moi)? plus (?:vite|rapidement)$|^(?:sois|soit|etre) plus (?:rapide|reactif)(?: (?:a|pour) (?:me )?repondre)?$|^(?:accelere|augmente) (?:ta |la |ma )?vitesse de reponse$/,
  },
  {
    cle: "jarvis_dialogue_pause_ms",
    sens: -1,
    motif: /^(?:reponds?|repondre)(?:[- ]moi)? (?:moins vite|plus lentement)$|^attends? (?:un peu )?plus(?: longtemps)? avant de (?:me )?repondre$|^(?:ne me coupe pas|arrete de me couper)(?: la parole)?$|^(?:ralentis|diminue|baisse) (?:ta |la |ma )?vitesse de reponse$|^laisse[- ]moi plus de temps(?: pour parler| pour finir| de finir)?$/,
  },
  {
    cle: "jarvis_voice_rate",
    sens: 1,
    motif: /^parle(?:r)?(?:[- ]moi)? plus (?:vite|rapidement)$|^accelere (?:ta voix|ton debit|ta diction|ta parole)$|^augmente (?:la |ta )?vitesse de (?:ta |la )?(?:voix|parole)$/,
  },
  {
    cle: "jarvis_voice_rate",
    sens: -1,
    motif: /^parle(?:r)?(?:[- ]moi)? (?:moins vite|plus lentement)$|^ralentis (?:ta voix|ton debit|ta diction|ta parole)$|^(?:baisse|diminue) (?:la |ta )?vitesse de (?:ta |la )?(?:voix|parole)$/,
  },
  {
    cle: "jarvis_dialogue_suite_ms",
    sens: 1,
    motif: /^ecoute[- ]moi plus longtemps(?: apres (?:avoir repondu|ta reponse))?$/,
  },
  {
    cle: "jarvis_dialogue_suite_ms",
    sens: -1,
    motif: /^ecoute[- ]moi moins longtemps(?: apres (?:avoir repondu|ta reponse))?$/,
  },
]

function estInterrupteur(r: ReglageVoix): boolean {
  return r.options.some((o) => o.cleValeur === "actif") && r.options.some((o) => o.cleValeur === "inactif")
}

/**
 * Ce que dit une phrase, s'il s'agit d'un réglage — ou `null`, et la phrase
 * suit son chemin habituel. Texte APLATI attendu (minuscules, sans accents),
 * comme partout dans `commandeLocale.ts`.
 *
 * Tout est ANCRÉ : le nom du réglage doit être toute la fin de la phrase.
 * « coupe le mode Live et appelle Yoni » est une autre demande, qui part au
 * serveur — comme pour les notifications (capacitesVoix.ts).
 */
export function commandeReglage(texte: string): CommandeReglage | null {
  const t = texte.replace(/[?!.]+$/g, "").replace(/\s+/g, " ").trim()
  if (!t || t.length > 120) return null
  if (LISTE.test(t)) return { type: "etat", cle: null }
  for (const r of RELATIFS) if (r.motif.test(t)) return { type: "ajuster", cle: r.cle, sens: r.sens }

  for (const r of REGLAGES_VOIX) {
    if (!r.motif) continue
    const m = r.motif.source
    // « active le mode Live », « coupe le mot-clé de réveil »
    if (estInterrupteur(r)) {
      const inter = t.match(new RegExp(`^(${ALLUME}|${ETEINT})(?:[- ]moi)? ${DET}(?:${m})$`))
      if (inter) {
        const allume = new RegExp(`^(?:${ALLUME})$`).test(inter[1])
        return { type: "regler", cle: r.cle, cleValeur: allume ? "actif" : "inactif" }
      }
    }
    // « règle ta vitesse de réponse sur rapide », « mets le thème sombre »
    const avecValeur = t.match(
      new RegExp(`^(?:regle|mets|passe|change|bascule|fixe|reduis|augmente|diminue)(?:[- ]moi)? ${DET}(?:${m}) (?:en |sur |a |au |a la |pour |sur le mode |en mode )?(.+)$`),
    )
    if (avecValeur) {
      const option = r.options.find((o) => o.mots?.test(avecValeur[1]))
      if (option) return { type: "regler", cle: r.cle, cleValeur: option.cleValeur }
    }
    // « quelle est ta vitesse de réponse ? », « règle ta vitesse de réponse »
    // (sans valeur : on lui dit où elle en est, et ce qu'il peut choisir)
    if (
      new RegExp(
        `^(?:quel(?:le)? est|c['’]\\s*est quoi|dis[- ]moi|donne[- ]moi|a combien est|comment est|regle|change|modifie|ajuste)(?:[- ]moi)? ${DET}(?:${m})(?: actuelle?)?(?: reglee?)?$`,
      ).test(t) ||
      new RegExp(`^${DET}(?:${m}) (?:est[- ]il |est[- ]elle |est )?(?:active|activee|allume|allumee|en marche)$`).test(t)
    ) {
      return { type: "etat", cle: r.cle }
    }
  }
  // Le thème se dit aussi sans le mot « thème » : « passe en mode sombre » est
  // couvert ci-dessus, « mets l'application en sombre » ici.
  const theme = t.match(/^(?:mets|passe|bascule)(?:[- ]moi)? (?:l['’]\s*(?:application|app|ecran) )?en (?:mode )?(sombre|clair|nuit|jour)$/)
  if (theme) return { type: "regler", cle: "jarvis_theme", cleValeur: /sombre|nuit/.test(theme[1]) ? "sombre" : "clair" }
  // « garde mes conversations trente jours »
  const garde = t.match(/^garde (?:mes |les )?conversations (?:pendant )?(.+)$/)
  if (garde) {
    const r = trouverReglageVoix("jarvis_memoire_retention")!
    const option = r.options.find((o) => o.mots?.test(garde[1]))
    if (option) return { type: "regler", cle: r.cle, cleValeur: option.cleValeur }
  }
  return null
}

/** « Ta vitesse de réponse est … Tu peux dire : … ». */
export function phraseEtat(r: ReglageVoix, brut: string | null): string {
  const { dit } = valeurActuelle(r, brut)
  const choix = estInterrupteur(r)
    ? "Dis « active » ou « coupe » suivi de son nom pour le changer."
    : `Tu peux choisir : ${r.options.map((o) => o.dit.split(" (")[0]).join(", ")}${
        r.ajustable ? ` — ou me dire « ${r.cle === "jarvis_voice_rate" ? "parle plus vite" : r.cle === "jarvis_dialogue_pause_ms" ? "réponds plus vite" : "écoute-moi plus longtemps"} » / « moins ».` : "."
      }`
  return `${majusculeInitiale(r.nom)} : ${dit}. ${choix}`
}

/**
 * La réponse à « qu'est-ce que j'ai réglé ? » : chaque réglage que la voix
 * sait changer, avec sa valeur ACTUELLE (lue par `lire`, jamais supposée),
 * plus les lignes que l'appelant ajoute (applications par défaut,
 * notifications) — qui se lisent ailleurs. Les réglages de la voix et de
 * l'écoute d'abord : ce sont ceux qu'il cherche en parlant.
 */
export function phraseTousLesReglages(lire: (cle: string) => string | null, autres: string[] = []): string {
  const DABORD = [
    "jarvis_mode_live",
    "jarvis_dialogue_pause_ms",
    "jarvis_voice_rate",
    "jarvis_dialogue_suite_ms",
    "jarvis_wake_word_enabled",
    "jarvis_voice_confirmer_resultat",
    "jarvis_live_cloture_actif",
  ]
  const rang = (r: ReglageVoix) => (DABORD.includes(r.cle) ? DABORD.indexOf(r.cle) : DABORD.length)
  const tri = [...REGLAGES_VOIX]
    .sort((a, b) => rang(a) - rang(b))
    .map((r) => `${r.nom} : ${valeurActuelle(r, lire(r.cle)).dit}`)
  return `Voici tes réglages. ${[...tri, ...autres].join(" ; ")}. Tu peux m'en faire changer un à la voix, par exemple « réponds plus vite », « parle plus lentement » ou « mets le thème sombre ».`
}

function majusculeInitiale(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
