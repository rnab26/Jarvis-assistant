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
 * `[DOUBLON — …]`. C'est écrit dans le CLAUDE.md du projet, et toutes les
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
  | "reporte"
  | "bloque"
  | "doublon"
  | "libre"

export const LIBELLE_MARQUEUR: Record<Marqueur, string> = {
  pour_raphael: "pour toi",
  a_cadrer: "à cadrer",
  reporte: "reporté",
  bloque: "bloqué",
  doublon: "doublon",
  libre: "libre",
}

/** Ce que le marqueur veut dire, en une phrase, sur la carte dépliée. */
export const EXPLICATION_MARQUEUR: Record<Marqueur, string> = {
  pour_raphael: "Ce n'est pas du code : c'est une action de ton côté.",
  a_cadrer: "Une session ne le prendra pas : il attend une décision de toi.",
  reporte: "Reporté par toi — aucune session ne le rouvrira d'elle-même.",
  bloque: "En attente d'un autre chantier.",
  doublon: "Déjà traité ailleurs — gardé pour la trace.",
  libre: "Spécifié de bout en bout : la prochaine session peut le prendre.",
}

export const VARIANTE_MARQUEUR: Record<Marqueur, "default" | "secondary" | "destructive" | "outline"> =
  {
    pour_raphael: "destructive",
    a_cadrer: "destructive",
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
export function compterMarqueurs(items: DevItem[]): { marqueur: Marqueur; nb: number }[] {
  const compte = new Map<Marqueur, number>()
  for (const item of items) {
    const m = marqueurDe(item)
    if (m) compte.set(m, (compte.get(m) ?? 0) + 1)
  }
  // Ce qui attend Raphaël d'abord : c'est la question qu'il se pose en
  // ouvrant le cockpit.
  const ordre: Marqueur[] = ["pour_raphael", "a_cadrer", "bloque", "reporte", "libre", "doublon"]
  return ordre.filter((m) => compte.has(m)).map((m) => ({ marqueur: m, nb: compte.get(m)! }))
}
