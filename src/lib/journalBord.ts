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
}

export const KIND_VARIANT: Record<DevLogKind, "default" | "secondary" | "destructive" | "outline"> =
  {
    question: "default",
    reponse: "secondary",
    info: "outline",
    blocage: "destructive",
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
