import { normaliserRecherche } from "./sections.ts"
import type { DevItem } from "@/types/database"

/**
 * Les marqueurs en tête des notes d'un chantier — et pourquoi ils méritent
 * d'être visibles dans l'app.
 *
 * Les sessions Claude Code écrivent en première ligne des notes un marqueur
 * qui commande leur comportement : `[À CADRER AVEC RAPHAËL AVANT DE
 * COMMENCER]` (ne pas coder, il faut trancher d'abord), `[LIBRE]` (spécifié de
 * bout en bout, à prendre sans rien demander), `[BLOQUÉ PAR : …]`,
 * `[DOUBLON — …]`, `[LIVRÉ — RESTE À CONSTATER SUR SON TÉLÉPHONE]` (le code
 * est fini, il ne manque qu'un essai sur l'appareil — chantier cc2d9392, ne
 * PAS le confondre avec `[LIBRE]` : une session autonome reprendrait un
 * travail déjà fait). C'est écrit dans le CLAUDE.md du projet, et toutes les
 * sessions s'y tiennent.
 *
 * Mais l'app, elle, n'en disait rien : ces marqueurs restaient noyés dans le
 * texte d'une note qu'il faut déplier pour lire. Résultat, la seule question
 * qui intéresse Raphaël quand il ouvre le cockpit — « qu'est-ce qui attend une
 * décision de MOI ? » — demandait de déplier une cinquantaine de chantiers.
 * Douze l'attendent au 4 sept. 2026, et rien ne le disait.
 *
 * Lecture seule, sans réseau : on n'écrit jamais un marqueur d'ici, il vient
 * des sessions. Vérifié par `scripts/verifier-sections.ts`.
 */

export type Marqueur =
  | "pour_raphael"
  | "a_cadrer"
  | "a_constater"
  | "reporte"
  | "bloque"
  | "doublon"
  | "libre"

/**
 * CE QUI N'A PAS ENCORE ÉTÉ TRIÉ — et pourquoi ça mérite d'être visible.
 *
 * Ce n'est PAS un marqueur : personne ne l'écrit dans une note, `marqueurDe`
 * ne le rend jamais. C'est l'ABSENCE de marqueur, rendue visible.
 *
 * MESURÉ le 9 sept. 2026 sur ses 18 chantiers ouverts (chantier ba8bd119) :
 * SIX n'en portaient aucun. Ils étaient invisibles DEUX FOIS — une passe
 * autonome ne les prend pas (elle exige `libre`), et « Où j'en suis » ne les
 * compte ni dans « pour toi » ni dans « dort ». Quatre disaient pourtant leur
 * état en toutes lettres, dont trois en priorité haute, et l'un d'eux était
 * une dictée de Raphaël jamais triée. Ils ont dormi des jours sans que rien
 * ne le signale.
 *
 * ON SIGNALE, ON NE CLASSE JAMAIS TOUT SEUL — même choix que pour les
 * doublons déjà en base et les thèmes non déclarés. Un classement automatique
 * mettrait un marqueur dans le dos de celui qui a écrit la note, et le pire
 * cas est un `libre` posé à tort : une session autonome coderait alors un
 * sujet qu'il voulait trancher d'abord (chantier 4d0ebdf3, 6 sept.).
 */
export const A_TRIER = "a_trier" as const

/** Ce qui s'affiche en étiquette sur une ligne : un marqueur, ou son absence. */
export type Etiquette = Marqueur | typeof A_TRIER

export const LIBELLE_MARQUEUR: Record<Etiquette, string> = {
  a_trier: "à trier",
  pour_raphael: "pour toi",
  a_cadrer: "à cadrer",
  a_constater: "à constater",
  reporte: "reporté",
  bloque: "bloqué",
  doublon: "doublon",
  libre: "libre",
}

/** Ce que le marqueur veut dire, en une phrase, sur la carte dépliée. */
export const EXPLICATION_MARQUEUR: Record<Etiquette, string> = {
  a_trier:
    "Aucun marqueur : aucune session ne le prendra, et il n'est compté nulle part. Dis s'il est libre, ou s'il attend une décision de toi.",
  pour_raphael: "Ce n'est pas du code : c'est une action de ton côté.",
  a_cadrer: "Une session ne le prendra pas : il attend une décision de toi.",
  a_constater:
    "Le code est livré : il ne reste qu'à l'essayer sur ton téléphone. Une session autonome ne le reprendra pas.",
  reporte: "Reporté par toi — aucune session ne le rouvrira d'elle-même.",
  bloque: "En attente d'un autre chantier.",
  doublon: "Déjà traité ailleurs — gardé pour la trace.",
  libre: "Spécifié de bout en bout : la prochaine session peut le prendre.",
}

export const VARIANTE_MARQUEUR: Record<Etiquette, "default" | "secondary" | "destructive" | "outline"> =
  {
    // Discret exprès : ce n'est pas une alerte, c'est un rangement qui manque.
    a_trier: "secondary",
    pour_raphael: "destructive",
    a_cadrer: "destructive",
    a_constater: "destructive",
    reporte: "secondary",
    bloque: "secondary",
    doublon: "secondary",
    libre: "outline",
  }

/**
 * Le marqueur d'un chantier, ou null.
 *
 * Il se lit dans le ou les crochets qui OUVRENT la note, jamais ailleurs :
 * une note longue cite souvent un autre chantier en écrivant « [LIBRE] » au
 * passage, et un chantier à cadrer serait alors présenté comme libre — une
 * session le prendrait sans rien demander. Le contrôle hors réseau garde
 * exactement ce cas.
 *
 * L'ordre de priorité n'est pas arbitraire : il va du plus « ne t'en occupe
 * pas » au plus « vas-y ». Un chantier marqué « [LIBRE pour la partie
 * réglages, À CADRER pour le reste] » (cas réel) ressort donc « à cadrer ».
 */
export function marqueurDe(item: DevItem): Marqueur | null {
  if (!item.notes) return null

  // Au plus deux groupes de crochets d'affilée en tête : certaines notes
  // portent « [BLOQUÉ PAR : …] [Questionnaire] … ». Le contenu d'un crochet
  // peut être long (une phrase entière), mais ce qui le CLASSE est toujours
  // au début : on ne lit donc que ses premiers mots, sinon un « libre » cité
  // au milieu d'une explication changerait la nature du chantier.
  const tete: string[] = []
  let reste = item.notes.trimStart()
  for (let i = 0; i < 2; i++) {
    const m = reste.match(/^\[([^\]]{0,400})\]/)
    if (!m) break
    tete.push(normaliserRecherche(m[1]).slice(0, 60))
    reste = reste.slice(m[0].length).trimStart()
  }
  if (tete.length === 0) return null

  return classer(tete.join(" "))
}

/**
 * La table de correspondance, et la SEULE : `marqueurDe` s'en sert pour
 * l'étiquette, `notesSansMarqueur` pour savoir quel crochet retirer de
 * l'aperçu. Écrite deux fois, elle finirait par diverger — une étiquette
 * affichée d'un côté, le crochet gardé dans l'aperçu de l'autre, et personne
 * pour s'en apercevoir.
 *
 * L'ordre n'est pas arbitraire : il va du plus « ne t'en occupe pas » au plus
 * « vas-y ». Un chantier marqué « [LIBRE pour la partie réglages, À CADRER
 * pour le reste] » (cas réel) ressort donc « à cadrer ».
 */
function classer(entete: string): Marqueur | null {
  if (entete.includes("doublon")) return "doublon"
  if (entete.includes("a faire par raphael")) return "pour_raphael"
  if (entete.includes("reste a constater")) return "a_constater"
  if (entete.includes("cadrer")) return "a_cadrer"
  if (entete.includes("reporte")) return "reporte"
  if (entete.includes("bloque")) return "bloque"
  if (entete.includes("libre")) return "libre"
  return null
}

/**
 * Les notes débarrassées du marqueur qui les ouvre.
 *
 * Sans ça, l'aperçu d'une note sur la carte répète en toutes lettres ce que
 * l'étiquette dit déjà — « [À CADRER AVEC RAPHAËL AVANT DE COMMENCER]… » — et
 * les deux lignes visibles ne montrent rien du contenu réel. Vu à l'écran, sur
 * une capture : la moitié des chantiers gaspillaient leur aperçu.
 */
export function notesSansMarqueur(notes: string | null): string | null {
  if (!notes) return null
  let reste = notes.trimStart()
  for (let i = 0; i < 2; i++) {
    const m = reste.match(/^\[([^\]]{0,400})\]/)
    if (!m) break
    // Seuls les crochets qui PORTENT un marqueur sont retirés — même table que
    // l'étiquette, pas une seconde liste. « [Questionnaire] » ou « [CADRE —
    // Raphael a tranché] » disent quelque chose, eux, et restent.
    if (!classer(normaliserRecherche(m[1]).slice(0, 60))) break
    reste = reste.slice(m[0].length).trimStart()
  }
  return reste || null
}

/** Combien de chantiers portent chaque marqueur, dans l'ordre d'affichage. */
export function compterMarqueurs(items: DevItem[]): { marqueur: Etiquette; nb: number }[] {
  const compte = new Map<Etiquette, number>()
  for (const item of items) {
    // L'absence de marqueur est comptée comme le reste : c'est tout l'objet
    // de A_TRIER. Sans cette ligne, six chantiers sur dix-huit ne figuraient
    // dans aucun compte, donc nulle part.
    const m = marqueurDe(item) ?? A_TRIER
    compte.set(m, (compte.get(m) ?? 0) + 1)
  }
  // Ce qui attend Raphaël d'abord : c'est la question qu'il se pose en
  // ouvrant le cockpit.
  const ordre: Etiquette[] = [
    "pour_raphael",
    "a_cadrer",
    "a_constater",
    "bloque",
    "reporte",
    "libre",
    "doublon",
    // En dernier : c'est du rangement, pas une urgence.
    A_TRIER,
  ]
  return ordre.filter((m) => compte.has(m)).map((m) => ({ marqueur: m, nb: compte.get(m)! }))
}
