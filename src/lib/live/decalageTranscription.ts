/**
 * MESURER le décalage entre ce que Raphaël dit et ce qui s'affiche en mode
 * Live — chantier f82f7a60, ses mots : « je vois ça même par rapport à ce qui
 * est écrit en fonction de comment je discute. Ça prend pas du tout les écrits
 * rapidement. Tout est en décalage. »
 *
 * CE MODULE NE CORRIGE RIEN, ET C'EST VOULU. La note du chantier dit
 * « mesurer d'abord, ne rien recoder avant » : trois causes plausibles
 * (Google transcrit tard, nous affichons le mauvais flux, le tour entier
 * attend la fin de sa phrase) se ressemblent parfaitement à l'écran et se
 * corrigent à trois endroits différents.
 *
 * CE QUI N'EXISTE PAS, ET QU'IL NE FAUT PAS ALLER CHERCHER : un signal qui
 * dirait QUAND il a commencé à parler. Vérifié dans les types de
 * `@google/genai` 2.21 : `activityStart` / `activityEnd` sont des messages que
 * le CLIENT envoie (`LiveSendRealtimeInputParameters`), jamais des messages
 * que le serveur rend — `LiveServerContent` n'en porte aucun. Inventer un
 * seuil d'énergie sur le micro pour le deviner serait une mesure fabriquée :
 * on ne le fait pas.
 *
 * DEUX ANCRES RÉELLES LE REMPLACENT, et il faut les deux :
 *
 * 1. LES MOTS DATÉS. `Transcription.words[].endOffset` donne la fin de chaque
 *    mot « relative to the start of the audio », c'est-à-dire de l'audio que
 *    Google a REÇU. Comme on sait combien de millisecondes d'audio on lui a
 *    réellement envoyées à l'instant où un morceau arrive, la soustraction
 *    donne le retard VRAI, en millisecondes, sans rien supposer :
 *      retard = audio envoyé à cet instant − fin du dernier mot du morceau.
 *    Google ne remplit peut-être jamais `words` (rien ne l'y oblige) — d'où
 *    `null` plutôt qu'un zéro, et d'où la seconde ancre.
 *
 * 2. LES DEUX FLUX COMPARÉS L'UN À L'AUTRE. Google rend
 *    `interimInputTranscription` (« Low latency transcription updated while
 *    the user is speaking ») en plus de `inputTranscription` ; l'app n'affiche
 *    aujourd'hui QUE le second. Les deux décrivent la même phrase : leur écart
 *    est de la latence pure, quelle que soit l'heure à laquelle il a ouvert la
 *    bouche. Si l'avance est nette, le correctif tient en une ligne d'affichage.
 *
 * NE CONCLUS RIEN DE `ms_premier` SEUL : il compte aussi le silence entre la
 * fin du tour précédent et le moment où il se met à parler. C'est la FORME des
 * arrivées (`arrivees`), l'avance de l'interim et le retard mesuré qui disent
 * la latence.
 */

/** Un morceau de transcription, tel qu'il arrive. */
export interface MorceauTranscription {
  /** Millisecondes écoulées depuis le début du tour quand le morceau est ARRIVÉ. */
  arriveeMs: number
  /** Durée d'audio DÉJÀ ENVOYÉE à Google à cet instant, en millisecondes. */
  audioEnvoyeMs: number
  /** Fin du dernier mot daté du morceau, en ms depuis le début de l'audio reçu
   * par Google ; `null` quand Google ne date pas les mots. */
  finDernierMotMs: number | null
  /** Nombre de caractères du morceau. */
  caracteres: number
  /** Vrai pour `interimInputTranscription`, faux pour `inputTranscription`. */
  interim: boolean
}

export interface TourTranscription {
  morceaux: MorceauTranscription[]
  /** Depuis le début du tour : quand `finished` est arrivé. `null` s'il n'est
   * jamais venu — ça arrive, et c'est en soi une réponse. */
  finiMs: number | null
  /** Depuis le début du tour : quand `turnComplete` est arrivé. */
  tourMs: number
  /** `turnCompleteReason` de Google, s'il en donne une. */
  raisonFin: string | null
}

/** Combien d'arrivées on garde pour lire la FORME du flux sans gonfler le
 * journal : au-delà, une ligne par mot rendrait `journal_ecoute` illisible. */
export const ARRIVEES_GARDEES = 12

/**
 * Une durée protobuf (« 1.500s », « 0s », « 12s ») en millisecondes.
 *
 * `null` sur tout ce qui n'est pas exactement ça : un format inattendu doit se
 * lire comme « Google ne nous l'a pas dit », jamais comme zéro — zéro voudrait
 * dire « au tout début de l'audio », et fabriquerait un retard énorme.
 */
export function dureeProtoEnMs(valeur: unknown): number | null {
  if (typeof valeur === "number" && Number.isFinite(valeur)) return Math.round(valeur * 1000)
  if (typeof valeur !== "string") return null
  const m = /^(\d+(?:\.\d+)?|\.\d+)s$/.exec(valeur.trim())
  if (!m) return null
  const secondes = Number(m[1])
  if (!Number.isFinite(secondes)) return null
  return Math.round(secondes * 1000)
}

/** La fin du dernier mot DATÉ d'un morceau, ou `null` si aucun ne l'est. */
export function finDernierMot(mots: unknown): number | null {
  if (!Array.isArray(mots)) return null
  let fin: number | null = null
  for (const mot of mots) {
    const v = dureeProtoEnMs((mot as { endOffset?: unknown } | null)?.endOffset)
    if (v !== null && (fin === null || v > fin)) fin = v
  }
  return fin
}

/**
 * Le retard d'un morceau : l'audio qu'on avait déjà envoyé, moins la fin du
 * dernier mot qu'il porte. `null` quand Google ne date pas les mots.
 *
 * Borné à zéro par le bas : un retard négatif voudrait dire que Google a
 * transcrit de l'audio qu'on ne lui a pas encore donné. Ça ne peut venir que
 * d'un décalage de compteur (un paquet compté avant d'être réellement parti),
 * pas d'une mesure à publier.
 */
export function retardDuMorceau(m: MorceauTranscription): number | null {
  if (m.finDernierMotMs === null) return null
  return Math.max(0, Math.round(m.audioEnvoyeMs - m.finDernierMotMs))
}

export function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  if (tri.length % 2 === 1) return tri[milieu]
  return Math.round((tri[milieu - 1] + tri[milieu]) / 2)
}

/**
 * Ce qu'on écrit dans `journal_ecoute` pour un tour de parole.
 *
 * `null` partout où la chose n'a PAS eu lieu, jamais zéro : « zéro
 * milliseconde » et « ça n'est jamais arrivé » se liraient pareil dans une
 * requête SQL, et c'est précisément la confusion qui a coûté l'enquête à la
 * main de `live_reponse_anormale`.
 */
export function resumerTour(tour: TourTranscription): Record<string, string | number | boolean | null> {
  const finals = tour.morceaux.filter((m) => !m.interim)
  const interims = tour.morceaux.filter((m) => m.interim)
  const premier = tour.morceaux[0] ?? null
  const premierFinal = finals[0] ?? null
  const premierInterim = interims[0] ?? null
  const dernierFinal = finals.length ? finals[finals.length - 1] : null

  const retards = tour.morceaux.map(retardDuMorceau).filter((v): v is number => v !== null)

  return {
    morceaux: finals.length,
    interims: interims.length,
    caracteres: finals.reduce((n, m) => n + m.caracteres, 0),
    caracteres_interim: interims.reduce((n, m) => n + m.caracteres, 0),
    // Compte le silence d'AVANT sa phrase autant que la latence : à lire avec
    // les autres, jamais seul.
    ms_premier: premier ? premier.arriveeMs : null,
    ms_premier_final: premierFinal ? premierFinal.arriveeMs : null,
    ms_premier_interim: premierInterim ? premierInterim.arriveeMs : null,
    // LE NOMBRE QUI DÉCIDE DU CORRECTIF : de combien le flux « basse latence »
    // précède celui qu'on affiche. Les deux décrivent la même phrase.
    avance_interim_ms:
      premierFinal && premierInterim ? Math.round(premierFinal.arriveeMs - premierInterim.arriveeMs) : null,
    ms_dernier_a_fini: dernierFinal && tour.finiMs !== null ? Math.round(tour.finiMs - dernierFinal.arriveeMs) : null,
    ms_fini_a_tour: tour.finiMs !== null ? Math.round(tour.tourMs - tour.finiMs) : null,
    ms_tour: Math.round(tour.tourMs),
    // Le retard VRAI, quand Google date les mots.
    retard_median_ms: mediane(retards),
    retard_max_ms: retards.length ? Math.max(...retards) : null,
    mots_dates: retards.length,
    // La FORME : « 0,80,160,240 » se lit comme un flux, « 1840 » comme une
    // rafale en fin de phrase. C'est ce qu'il décrit.
    arrivees: tour.morceaux.length
      ? tour.morceaux
          .slice(0, ARRIVEES_GARDEES)
          .map((m) => `${m.interim ? "i" : ""}${Math.round(m.arriveeMs)}`)
          .join(",")
      : null,
    raison_fin: tour.raisonFin,
  }
}
