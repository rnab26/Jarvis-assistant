import type { ErreurCategorie, ErreurStatut } from "@/types/database"

/**
 * Les mots affichés pour les familles d'erreurs et leurs états.
 *
 * Dans un fichier à part parce qu'ils servent à trois endroits (la liste, le
 * formulaire, la note du chantier créé depuis une erreur) : trois copies
 * finissent par dire trois choses différentes du même statut.
 */
export const CATEGORIES: { valeur: ErreurCategorie; libelle: string; aide: string }[] = [
  {
    valeur: "comprehension",
    libelle: "Compréhension",
    aide: "Il a compris autre chose que ce que tu demandais",
  },
  { valeur: "action", libelle: "Action", aide: "Il a compris, mais a fait autre chose — ou rien" },
  { valeur: "ecoute", libelle: "Écoute", aide: "Le micro n'a pas entendu, s'est coupé, a inventé" },
  { valeur: "serveur", libelle: "Serveur", aide: "Le modèle ou le serveur a refusé de répondre" },
  { valeur: "systeme", libelle: "Système", aide: "Une écriture a échoué (réseau, droits, base)" },
  { valeur: "utilisation", libelle: "Utilisation", aide: "L'app a mal guidé, un écran a manqué" },
  { valeur: "autre", libelle: "Autre", aide: "Ce qui ne rentre nulle part — plutôt que d'être perdu" },
]

export const LIBELLE_CATEGORIE: Record<ErreurCategorie, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.valeur, c.libelle]),
) as Record<ErreurCategorie, string>

export const STATUTS: { valeur: ErreurStatut; libelle: string }[] = [
  { valeur: "nouveau", libelle: "Nouvelle" },
  { valeur: "en_cours", libelle: "En cours" },
  { valeur: "corrige", libelle: "Corrigée" },
  { valeur: "ignore", libelle: "Ignorée" },
]

export const LIBELLE_STATUT: Record<ErreurStatut, string> = Object.fromEntries(
  STATUTS.map((s) => [s.valeur, s.libelle]),
) as Record<ErreurStatut, string>

/** Une date lisible d'un coup d'œil : « aujourd'hui à 14:05 », « le 2 sept. ». */
export function quand(iso: string): string {
  const d = new Date(iso)
  const auj = new Date()
  const memeJour = d.toDateString() === auj.toDateString()
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  if (memeJour) return `aujourd'hui à ${heure}`
  return `le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à ${heure}`
}
