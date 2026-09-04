import { ArrowDown, ArrowUp, Check, FolderPlus, Merge, Pencil, Trash2, X } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { LoadError } from "@/components/LoadError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { useDevSections } from "@/hooks/useDevSections"
import { alreadyNotified } from "@/lib/notifyError"
import { grouperParSection, themesSansSection } from "@/lib/sections"
import { cleTheme } from "@/lib/themeChantier"
import type { DevItem, DevSection } from "@/types/database"

/**
 * Gérer les sections : en créer, les renommer, les décrire, les réordonner,
 * les fusionner, les supprimer.
 *
 * Ce que ça remplace : rien. Une section n'existait que tant qu'un chantier
 * la portait, et la renommer voulait dire retoucher chaque chantier un par
 * un — donc, en pratique, ne jamais la renommer. C'est le chantier dce4415e.
 *
 * Les deux gestes dangereux (fusionner, supprimer) passent par une
 * confirmation qui dit COMBIEN de chantiers vont bouger et OÙ ils vont : sans
 * ce chiffre, on ne sait pas ce qu'on est en train d'accepter.
 */
interface SectionsDialogProps {
  trigger: ReactNode
  devItems: DevItem[]
  sectionsState: ReturnType<typeof useDevSections>
}

export function SectionsDialog({ trigger, devItems, sectionsState }: SectionsDialogProps) {
  const { sections, loading, error, refresh } = sectionsState
  const [open, setOpen] = useState(false)
  const [nouveau, setNouveau] = useState("")
  const [creation, setCreation] = useState(false)

  const groupes = grouperParSection(
    devItems.filter((i) => !i.archived_at),
    sections,
  )
  const compte = (nom: string) =>
    groupes.find((g) => cleTheme(g.nom) === cleTheme(nom))?.chantiers.length ?? 0

  const orphelins = themesSansSection(devItems, sections)

  async function creer() {
    const nom = nouveau.trim()
    if (!nom) return
    setCreation(true)
    try {
      await sectionsState.addSection(nom)
      setNouveau("")
    } catch {
      // Déjà signalé par un toast ; on garde la saisie.
    } finally {
      setCreation(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Les sections</DialogTitle>
          <DialogDescription>
            L'ordre choisi ici est celui du cockpit. Renommer une section renomme aussi
            tous ses chantiers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Créer d'abord : c'est le geste le plus fréquent, et une section
              peut naître vide — « Entraînement » avant d'avoir quoi que ce
              soit à y mettre (demande de Raphaël, chantier 3e880467). */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="nouvelle-section">Nouvelle section</Label>
            <div className="flex gap-2">
              <Input
                id="nouvelle-section"
                value={nouveau}
                placeholder="Entraînement, Fonctionnalités…"
                onChange={(e) => setNouveau(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    creer()
                  }
                }}
              />
              <Button size="sm" disabled={creation || !nouveau.trim()} onClick={creer}>
                <FolderPlus className="size-4" />
                Créer
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : error ? (
            <LoadError message={error} onRetry={refresh} />
          ) : sections.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Aucune section pour l'instant. Crée la première ci-dessus : les chantiers
              s'y rangeront ensuite.
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {sections.map((section, index) => (
                <LigneSection
                  key={section.id}
                  section={section}
                  sections={sections}
                  nbChantiers={compte(section.nom)}
                  premiere={index === 0}
                  derniere={index === sections.length - 1}
                  sectionsState={sectionsState}
                />
              ))}
            </div>
          )}

          {/* Un thème écrit directement en base par une session Claude Code
              n'a pas de section : il s'affiche quand même dans le cockpit,
              mais il ne peut ni être réordonné ni décrit tant qu'il n'en a
              pas une. Un bouton, et c'est réglé. */}
          {orphelins.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                Ces thèmes portent des chantiers mais n'ont pas encore de section — ils
                ne peuvent pas être ordonnés tant qu'ils n'en ont pas.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {orphelins.map((nom) => (
                  <Button
                    key={nom}
                    size="sm"
                    variant="outline"
                    onClick={() => sectionsState.addSection(nom).catch(alreadyNotified)}
                  >
                    <FolderPlus className="size-3.5" />
                    {nom}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface LigneSectionProps {
  section: DevSection
  sections: DevSection[]
  nbChantiers: number
  premiere: boolean
  derniere: boolean
  sectionsState: ReturnType<typeof useDevSections>
}

function LigneSection({
  section,
  sections,
  nbChantiers,
  premiere,
  derniere,
  sectionsState,
}: LigneSectionProps) {
  const [edition, setEdition] = useState(false)
  const [nom, setNom] = useState(section.nom)
  const [description, setDescription] = useState(section.description ?? "")
  const [enregistre, setEnregistre] = useState(false)
  // Deux destinations distinctes : celle d'une fusion et celle d'une
  // suppression. Un seul état, et le choix fait pour l'une réapparaissait
  // pré-rempli dans l'autre — on accepterait un déplacement qu'on n'a pas
  // choisi.
  const [cibleFusion, setCibleFusion] = useState<string>("")
  const [cibleSuppression, setCibleSuppression] = useState<string>("")

  useEffect(() => {
    if (!edition) {
      setNom(section.nom)
      setDescription(section.description ?? "")
    }
  }, [edition, section])

  const autres = sections.filter((s) => s.id !== section.id)

  async function enregistrer() {
    setEnregistre(true)
    try {
      if (nom.trim() && nom.trim() !== section.nom) await sectionsState.renameSection(section.id, nom)
      if ((description.trim() || null) !== section.description) {
        await sectionsState.updateSection(section.id, description)
      }
      setEdition(false)
    } catch {
      // Toast déjà affiché, la saisie reste.
    } finally {
      setEnregistre(false)
    }
  }

  function deplacer(sens: -1 | 1) {
    const ids = sections.map((s) => s.id)
    const i = ids.indexOf(section.id)
    const j = i + sens
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    sectionsState.reorderSections(ids).catch(alreadyNotified)
  }

  if (edition) {
    return (
      <div className="flex flex-col gap-2 py-3">
        <Input
          value={nom}
          autoFocus
          aria-label="Nom de la section"
          onChange={(e) => setNom(e.target.value)}
        />
        <Textarea
          value={description}
          rows={2}
          placeholder="Ce qu'on range ici (facultatif)"
          aria-label="Description de la section"
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEdition(false)}>
            <X className="size-3.5" />
            Annuler
          </Button>
          <Button size="sm" disabled={enregistre || !nom.trim()} onClick={enregistrer}>
            <Check className="size-3.5" />
            Enregistrer
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-1 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm">{section.nom}</span>
          <Badge variant="outline" className="shrink-0 px-1.5 text-xs font-normal">
            {nbChantiers}
          </Badge>
        </div>
        {section.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{section.description}</p>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Monter"
        disabled={premiere}
        onClick={() => deplacer(-1)}
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Descendre"
        disabled={derniere}
        onClick={() => deplacer(1)}
      >
        <ArrowDown className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Renommer"
        onClick={() => setEdition(true)}
      >
        <Pencil className="size-3.5" />
      </Button>

      {autres.length > 0 && (
        <ConfirmerAction
          destructif={false}
          libelleConfirmation="Fusionner"
          titre={`Fusionner « ${section.nom} » ?`}
          description={
            <>
              Ses {nbChantiers} chantier{nbChantiers > 1 ? "s" : ""} passeront dans la section
              choisie, et « {section.nom} » disparaîtra. Aucun chantier n'est supprimé.
            </>
          }
          contenu={
            <div className="flex flex-col gap-2">
              <Label>Vers quelle section ?</Label>
              <Select value={cibleFusion} onValueChange={setCibleFusion}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {autres.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          onConfirmer={async () => {
            if (!cibleFusion) throw new Error("Choisis une section de destination.")
            await sectionsState.mergeSections(section.id, cibleFusion)
          }}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Fusionner">
              <Merge className="size-3.5" />
            </Button>
          }
        />
      )}

      <ConfirmerAction
        libelleConfirmation="Supprimer la section"
        titre={`Supprimer « ${section.nom} » ?`}
        description={
          nbChantiers === 0 ? (
            "Cette section est vide : rien d'autre ne bouge."
          ) : (
            <>
              Ses {nbChantiers} chantier{nbChantiers > 1 ? "s" : ""} ne sont pas supprimés —
              ils repartent dans « À classer », ou dans la section que tu choisis
              ci-dessous.
            </>
          )
        }
        contenu={
          nbChantiers > 0 && autres.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>Où vont ses chantiers ?</Label>
              <Select value={cibleSuppression} onValueChange={setCibleSuppression}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="À classer" />
                </SelectTrigger>
                <SelectContent>
                  {autres.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : undefined
        }
        onConfirmer={() => sectionsState.removeSection(section.id, cibleSuppression || null)}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Supprimer la section">
            <Trash2 className="size-3.5" />
          </Button>
        }
      />
    </div>
  )
}
