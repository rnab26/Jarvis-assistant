import { ChevronDown, ChevronRight, FolderCog, Search, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DevItemCard } from "@/components/cockpit/DevItemCard"
import { SectionsDialog } from "@/components/cockpit/SectionsDialog"
import type { useDevSections } from "@/hooks/useDevSections"
import {
  FILTRE_VIDE,
  SANS_SECTION,
  filtreActif,
  filtrerChantiers,
  grouperParSection,
  type FiltreCockpit,
  type FiltreStatut,
  type GroupeSection,
} from "@/lib/sections"
import { cleTheme } from "@/lib/themeChantier"
import type { DevItem, DevItemInput } from "@/types/database"

/** Conservé pour les appelants existants (MicButton, CockpitPage) : la liste
 * des thèmes réellement portés par des chantiers, telle qu'elle part au
 * modèle vocal. */
export function themesDe(devItems: DevItem[]): string[] {
  return [...new Set(devItems.map((i) => i.theme).filter((t): t is string => !!t))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  )
}

/** Ancien nom, gardé pour ne pas casser un import existant. */
export const SANS_THEME = SANS_SECTION

const STATUTS: { valeur: FiltreStatut; libelle: string }[] = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "todo", libelle: "À faire" },
  { valeur: "in_progress", libelle: "En cours" },
  { valeur: "done", libelle: "Terminés" },
]

interface CockpitBoardProps {
  devItems: DevItem[]
  sectionsState: ReturnType<typeof useDevSections>
  onUpdate: (id: string, input: DevItemInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onUnarchive: (id: string) => Promise<void>
}

/**
 * Le tableau des chantiers : un résumé par section d'abord, le détail à la
 * demande.
 *
 * Ce qui a changé, et pourquoi (chantier 033a41da, ses mots) : « les chantiers
 * en cours ne disposent pas de vue filtre et de résumé par section, tout est
 * dans une fenêtre qu'il faut défiler de haut en bas pour accéder à une
 * section ». Avec quatre-vingts chantiers ouverts, la liste dépliée fait une
 * vingtaine d'écrans de téléphone : trouver une section demandait de faire
 * défiler jusqu'à tomber dessus.
 *
 * Donc : les sections arrivent REPLIÉES, avec leurs compteurs — c'est le
 * résumé qu'il demandait —, et on ouvre celle qu'on veut. Un filtre ouvre
 * automatiquement ce qu'il laisse passer : quand on cherche, on veut voir le
 * résultat, pas le déplier.
 */
export function CockpitBoard({
  devItems,
  sectionsState,
  onUpdate,
  onDelete,
  onArchive,
  onUnarchive,
}: CockpitBoardProps) {
  const [filtre, setFiltre] = useState<FiltreCockpit>(FILTRE_VIDE)
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())
  const [archivesOuvertes, setArchivesOuvertes] = useState(false)

  const { sections } = sectionsState
  const themes = themesDe(devItems)
  const actifs = useMemo(() => devItems.filter((i) => !i.archived_at), [devItems])
  const archives = useMemo(() => devItems.filter((i) => i.archived_at), [devItems])

  // Les compteurs du résumé portent sur TOUT, pas sur ce que le filtre laisse
  // passer : sinon « 0 restant » voudrait dire « rien ne correspond », ce qui
  // n'est pas la même chose que « rien à faire ».
  const groupesComplets = useMemo(
    () => grouperParSection(actifs, sections),
    [actifs, sections],
  )
  const filtres = useMemo(() => filtrerChantiers(actifs, filtre), [actifs, filtre])
  const groupesAffiches = useMemo(
    () => grouperParSection(filtres, sections).filter((g) => g.chantiers.length > 0),
    [filtres, sections],
  )
  const groupesArchives = useMemo(
    () =>
      grouperParSection(filtrerChantiers(archives, { ...filtre, statut: "tous" }), sections).filter(
        (g) => g.chantiers.length > 0,
      ),
    [archives, sections, filtre],
  )

  const cherche = filtreActif(filtre)
  const totalRestants = groupesComplets.reduce((n, g) => n + g.restants, 0)
  const totalEnCours = groupesComplets.reduce((n, g) => n + g.enCours, 0)
  const nbArchivesAffiches = groupesArchives.reduce((n, g) => n + g.chantiers.length, 0)

  const estOuverte = (nom: string) => cherche || ouvertes.has(cleTheme(nom))
  const basculer = (nom: string) =>
    setOuvertes((set) => {
      const suivant = new Set(set)
      const cle = cleTheme(nom)
      if (suivant.has(cle)) suivant.delete(cle)
      else suivant.add(cle)
      return suivant
    })

  const boutonSections = (
    <SectionsDialog
      devItems={devItems}
      sectionsState={sectionsState}
      trigger={
        <Button variant="outline" size="sm">
          <FolderCog className="size-4" />
          Sections
        </Button>
      }
    />
  )

  if (devItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-center text-muted-foreground">
          Aucun chantier pour l'instant. Envoie le premier depuis la fenêtre ci-dessus.
        </p>
        {boutonSections}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Le résumé et les filtres ── */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{totalRestants}</span> à traiter
              {totalEnCours > 0 && <> · {totalEnCours} en cours</>} · {groupesComplets.length}{" "}
              section{groupesComplets.length > 1 ? "s" : ""}
            </p>
            {boutonSections}
          </div>

          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtre.recherche}
              className="pl-8"
              placeholder="Chercher un chantier…"
              aria-label="Chercher un chantier"
              onChange={(e) => setFiltre({ ...filtre, recherche: e.target.value })}
            />
            {filtre.recherche && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Effacer la recherche"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                onClick={() => setFiltre({ ...filtre, recherche: "" })}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          {/* Une puce par section, avec ce qu'il y reste : c'est le résumé
              demandé, et c'est aussi le filtre. Deux objets en un seul geste
              plutôt qu'une liste de plus à lire. */}
          <div className="flex flex-wrap gap-1.5">
            <Puce
              active={filtre.section === null}
              onClick={() => setFiltre({ ...filtre, section: null })}
            >
              Tout <span className="opacity-70">{totalRestants}</span>
            </Puce>
            {groupesComplets.map((g) => (
              <Puce
                key={g.nom}
                active={filtre.section !== null && cleTheme(filtre.section) === cleTheme(g.nom)}
                onClick={() =>
                  setFiltre({
                    ...filtre,
                    section:
                      filtre.section && cleTheme(filtre.section) === cleTheme(g.nom) ? null : g.nom,
                  })
                }
              >
                {g.nom} <span className="opacity-70">{g.restants}</span>
                {g.enCours > 0 && <span className="text-primary"> ●</span>}
              </Puce>
            ))}
          </div>

          <div className="flex gap-1.5">
            {STATUTS.map(({ valeur, libelle }) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={filtre.statut === valeur}
                onClick={() => setFiltre({ ...filtre, statut: valeur })}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                  filtre.statut === valeur
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>

          {cherche && (
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {filtres.length} chantier{filtres.length > 1 ? "s" : ""} affiché
                {filtres.length > 1 ? "s" : ""} sur {actifs.length}
                {nbArchivesAffiches > 0 && <> · {nbArchivesAffiches} archivé{nbArchivesAffiches > 1 ? "s" : ""}</>}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setFiltre(FILTRE_VIDE)}>
                <X className="size-3.5" />
                Tout afficher
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Les sections ── */}
      {groupesAffiches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8">
          <p className="text-center text-sm text-muted-foreground">
            Aucun chantier ne correspond à ce filtre.
          </p>
          <Button variant="outline" size="sm" onClick={() => setFiltre(FILTRE_VIDE)}>
            Tout afficher
          </Button>
        </div>
      ) : (
        groupesAffiches.map((groupe) => (
          <SectionPliante
            key={groupe.nom}
            groupe={groupe}
            ouverte={estOuverte(groupe.nom)}
            onBasculer={() => basculer(groupe.nom)}
          >
            {groupe.chantiers.map((item) => (
              <DevItemCard
                key={item.id}
                item={item}
                themes={themes}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onArchive={onArchive}
              />
            ))}
          </SectionPliante>
        ))
      )}

      {/* ── Les archivées, rangées de la même façon ──
          « Pareil pour les chantiers archivés », mot pour mot. Un seul bloc
          replié en bas, avec le même découpage par section à l'intérieur. */}
      {archives.length > 0 && (
        <Card>
          <CardHeader className="grid-cols-[1fr_auto] items-center gap-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              aria-expanded={archivesOuvertes}
              onClick={() => setArchivesOuvertes(!archivesOuvertes)}
            >
              {archivesOuvertes ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
              <CardTitle className="min-w-0 flex-1 text-base text-muted-foreground">
                Archivées{" "}
                <span className="font-normal">
                  ({cherche ? `${nbArchivesAffiches} sur ${archives.length}` : archives.length})
                </span>
              </CardTitle>
            </button>
          </CardHeader>
          {archivesOuvertes && (
            <CardContent className="flex flex-col gap-3">
              {groupesArchives.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune archive ne correspond à ce filtre.
                </p>
              ) : (
                groupesArchives.map((groupe) => (
                  <div key={groupe.nom} className="flex flex-col">
                    <p className="text-xs font-medium text-muted-foreground">
                      {groupe.nom} · {groupe.chantiers.length}
                    </p>
                    <div className="divide-y">
                      {[...groupe.chantiers]
                        .sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""))
                        .map((item) => (
                          <DevItemCard
                            key={item.id}
                            item={item}
                            themes={themes}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            onUnarchive={onUnarchive}
                          />
                        ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}

function Puce({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs ${
        active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function SectionPliante({
  groupe,
  ouverte,
  onBasculer,
  children,
}: {
  groupe: GroupeSection
  ouverte: boolean
  onBasculer: () => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={ouverte}
          onClick={onBasculer}
        >
          {ouverte ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <CardTitle className="min-w-0 flex-1 text-base">
            {groupe.nom}{" "}
            <span className="font-normal text-muted-foreground">
              — {groupe.restants} restant{groupe.restants > 1 ? "s" : ""}
              {groupe.total > groupe.restants && ` sur ${groupe.total}`}
            </span>
          </CardTitle>
        </button>
        {groupe.enCours > 0 && (
          <Badge variant="default" className="shrink-0">
            {groupe.enCours} en cours
          </Badge>
        )}
      </CardHeader>
      {ouverte && (
        <CardContent className="divide-y">
          {groupe.section?.description && (
            <p className="pb-1.5 text-xs text-muted-foreground">{groupe.section.description}</p>
          )}
          {children}
        </CardContent>
      )}
    </Card>
  )
}
