import type { DevLogKind } from "@/types/database"

/**
 * Ce qui est commun au journal de bord et aux chantiers qui portent leurs
 * messages.
 *
 * Ces quatre choses (le libellé d'un type de message, sa couleur, l'âge en
 * clair, le nom court d'une session) s'affichaient au même moment à deux
 * endroits — le flux du journal et la carte d'un chantier. Deux copies
 * finissent par dire deux choses différentes du même message, et la
 * divergence ne se voit jamais : elle se lit.
 */

export const KIND_LABEL: Record<DevLogKind, string> = {
  question: "Question",
  reponse: "Réponse",
  info: "Info",
  blocage: "Blocage",
  // Ce que RAPHAËL doit faire, par opposition à « question » où il décide.
  // Voir src/lib/decisions.ts.
  action: "À faire par toi",
}

export const KIND_VARIANT: Record<DevLogKind, "default" | "secondary" | "destructive" | "outline"> =
  {
    question: "default",
    reponse: "secondary",
    info: "outline",
    blocage: "destructive",
    action: "destructive",
  }

/** « il y a 3 h » plutôt qu'une date brute : on lit un fil, pas un registre. */
export function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  return `il y a ${Math.round(heures / 24)} j`
}

/** Une branche de session est longue : on n'en garde que ce qui distingue. */
export function courtAuteur(auteur: string): string {
  return auteur.replace(/^claude\//, "")
}

/**
 * Le début d'un texte, coupé AU MOT.
 *
 * POURQUOI C'EST ICI, et pas recopié à chaque endroit qui en a besoin. Il y en
 * avait déjà deux copies — `extraitLisible` dans `DepuisTonDernierPassage.tsx`
 * et la citation de `filJournal.ts` — et la troisième a été la fois de trop :
 * mesuré le 17 sept. 2026, `CeQuiAttendTaDecision` affichait le corps ENTIER
 * d'une question sur sa ligne repliée. Ses cinq points en attente faisaient
 * 697, 561, 146, 110 et 86 caractères ; la carte montait à 924 points de haut
 * pour quatre points repliés, et poussait « Où j'en suis » hors du premier
 * écran.
 *
 * COUPÉ AU MOT, jamais au caractère : une phrase coupée au pixel près se
 * termine n'importe où et se lit plus mal que pas d'extrait du tout. Et les
 * blancs sont écrasés d'abord — une note de session contient des retours à la
 * ligne, qui feraient un extrait haut de cinq lignes pour trois mots.
 *
 * Le repli sur une coupe nette existe pour le cas d'un texte sans aucune
 * espace dans sa première partie (une URL collée, un identifiant) : mieux vaut
 * couper court que de rendre le texte entier en croyant l'avoir coupé.
 */
export function extraitAuMot(texte: string, maximum = 110): string {
  const propre = texte.replace(/\s+/g, " ").trim()
  if (propre.length <= maximum) return propre
  const coupe = propre.slice(0, maximum)
  const espace = coupe.lastIndexOf(" ")
  return `${espace > maximum / 3 ? coupe.slice(0, espace) : coupe}…`
}
