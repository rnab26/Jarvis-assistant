// Import relatif avec extension : ce module doit rester chargeable par
// `node --experimental-strip-types` pour sa vérification, qui ne connaît pas
// l'alias « @/ » de Vite. Les imports de TYPES, eux, sont effacés à la
// compilation et peuvent garder l'alias.
import { cleTheme } from "./themeChantier.ts"
import type { DevItem, DevPriority, DevSection, DevStatus } from "@/types/database"

/**
 * Le rangement du cockpit : quelles sections existent, ce qu'elles contiennent,
 * et ce qu'on en voit après filtrage.
 *
 * Tout est ici plutôt que dans les composants pour une raison précise : ce
 * sont ces règles-là qui décident de ce que Raphaël VOIT, et un chantier
 * invisible est un chantier perdu. Un filtre qui laisse tomber les chantiers
 * sans section, une section vide qui disparaît de la liste, un compteur qui
 * additionne les archivés : rien de tout ça ne lève d'erreur, ça se remarque
 * des semaines plus tard. C'est vérifié sans réseau par
 * `scripts/verifier-sections.ts`.
 */

/** Faute de section, un chantier n'est pas caché : il est signalé à classer. */
export const SANS_SECTION = "À classer"

const POIDS_PRIORITE: Record<DevPriority, number> = { high: 3, normal: 2, low: 1 }
/** En cours d'abord : c'est ce qui bouge maintenant. */
const POIDS_STATUT: Record<DevStatus, number> = { in_progress: 3, todo: 2, done: 1 }

/** Accents et casse ne doivent pas empêcher de retrouver un chantier : on
 * tape « echeance » sur un clavier de téléphone, le chantier s'appelle
 * « échéance ». */
export function normaliserRecherche(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function trierChantiers(items: DevItem[]): DevItem[] {
  return [...items].sort(
    (a, b) =>
      POIDS_STATUT[b.status] - POIDS_STATUT[a.status] ||
      POIDS_PRIORITE[b.priority] - POIDS_PRIORITE[a.priority] ||
      a.created_at.localeCompare(b.created_at),
  )
}

export interface GroupeSection {
  /** Le nom affiché, et la valeur écrite dans `dev_items.theme`. */
  nom: string
  /** La section déclarée, si elle l'est. null = thème porté par des chantiers
   * sans section correspondante (écrit en SQL par une session), ou « À classer ». */
  section: DevSection | null
  chantiers: DevItem[]
  /** Ce qui reste à faire : « terminé » non archivé n'est plus du travail. */
  restants: number
  enCours: number
  urgents: number
  total: number
}

/** Le nom de section auquel un chantier appartient. */
export function sectionDe(item: DevItem): string {
  return item.theme?.trim() || SANS_SECTION
}

/**
 * Toutes les sections dans l'ordre où elles s'affichent : les sections
 * déclarées d'abord, dans l'ordre choisi par Raphaël (`position`), puis les
 * thèmes qui n'ont pas de section déclarée, puis « À classer » tout en bas —
 * c'est une liste d'attente, pas un sujet.
 *
 * Une section déclarée reste listée même sans un seul chantier : c'est le
 * point du chantier 3e880467, on doit pouvoir créer « Entraînement » avant
 * d'avoir quoi que ce soit à y mettre.
 */
export function grouperParSection(items: DevItem[], sections: DevSection[]): GroupeSection[] {
  const parCle = new Map<string, DevItem[]>()
  for (const item of items) {
    const cle = cleTheme(sectionDe(item))
    parCle.set(cle, [...(parCle.get(cle) ?? []), item])
  }

  const declarees = [...sections].sort(
    (a, b) => a.position - b.position || a.nom.localeCompare(b.nom, "fr"),
  )
  const vues = new Set<string>()
  const groupes: GroupeSection[] = []

  const ajouter = (nom: string, section: DevSection | null) => {
    const cle = cleTheme(nom)
    if (vues.has(cle)) return
    vues.add(cle)
    groupes.push(resumer(nom, section, parCle.get(cle) ?? []))
  }

  for (const section of declarees) ajouter(section.nom, section)

  // Les thèmes écrits directement en base par une session Claude Code, sans
  // passer par l'app : ils doivent apparaître, sinon leurs chantiers seraient
  // invisibles dans le cockpit.
  const orphelins = [
    ...new Set(items.map(sectionDe).filter((n) => n !== SANS_SECTION && !vues.has(cleTheme(n)))),
  ].sort((a, b) => a.localeCompare(b, "fr"))
  for (const nom of orphelins) ajouter(nom, null)

  if (parCle.has(cleTheme(SANS_SECTION))) ajouter(SANS_SECTION, null)

  return groupes
}

function resumer(nom: string, section: DevSection | null, chantiers: DevItem[]): GroupeSection {
  const tries = trierChantiers(chantiers)
  return {
    nom,
    section,
    chantiers: tries,
    restants: tries.filter((i) => i.status !== "done").length,
    enCours: tries.filter((i) => i.status === "in_progress").length,
    urgents: tries.filter((i) => i.priority === "high" && i.status !== "done").length,
    total: tries.length,
  }
}

/** Un thème porté par des chantiers mais sans section déclarée : proposé au
 * rangement en un geste, plutôt que laissé à dériver. */
export function themesSansSection(items: DevItem[], sections: DevSection[]): string[] {
  const declarees = new Set(sections.map((s) => cleTheme(s.nom)))
  return [
    ...new Set(
      items
        .map((i) => i.theme?.trim())
        .filter((t): t is string => !!t && !declarees.has(cleTheme(t))),
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"))
}

export type FiltreStatut = "tous" | "todo" | "in_progress" | "done"

export interface FiltreCockpit {
  /** Nom de section, ou null pour toutes. */
  section: string | null
  statut: FiltreStatut
  recherche: string
}

export const FILTRE_VIDE: FiltreCockpit = { section: null, statut: "tous", recherche: "" }

export function filtreActif(filtre: FiltreCockpit): boolean {
  return filtre.section !== null || filtre.statut !== "tous" || filtre.recherche.trim() !== ""
}

/** La recherche porte sur le titre, la note ET le nom de section : on cherche
 * aussi bien « Gmail » que « le chantier de la section Messagerie ». */
export function filtrerChantiers(items: DevItem[], filtre: FiltreCockpit): DevItem[] {
  const cleSection = filtre.section === null ? null : cleTheme(filtre.section)
  const mots = normaliserRecherche(filtre.recherche).split(/\s+/).filter(Boolean)

  return items.filter((item) => {
    if (cleSection !== null && cleTheme(sectionDe(item)) !== cleSection) return false
    if (filtre.statut !== "tous" && item.status !== filtre.statut) return false
    if (mots.length === 0) return true
    const foin = normaliserRecherche(`${item.title} ${item.notes ?? ""} ${sectionDe(item)}`)
    // Tous les mots doivent être là : deux mots tapés servent à réduire, pas
    // à élargir.
    return mots.every((mot) => foin.includes(mot))
  })
}
