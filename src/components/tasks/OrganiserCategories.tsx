import { closestCenter, DndContext, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { categoriesOrdonnees, deplacer, MESSAGE_REFUS, verifierRenommage } from "@/lib/ordreCategories"
import type { Category, Task } from "@/types/database"

/**
 * Le crayon de l'écran Tâches : ranger ses catégories.
 *
 * SA DEMANDE, 7 sept. 2026, capture à l'appui : « ajouter dans l'écran
 * d'accueil un petit crayon [...] pour moduler l'organisation de l'écran en
 * ayant les fonctions nécessaires pour pouvoir bien évidemment renommer les
 * sections, les déplacer facilement avec un drag and drop pour mieux organiser
 * le panel visuel de jarvis ».
 *
 * POURQUOI CE N'EST PAS UNE LIGNE DE PLUS SUR L'ÉCRAN. La création d'une
 * catégorie occupait une ligne pleine largeur sur l'écran d'accueil — alors
 * qu'on crée une catégorie deux fois par an et une tâche dix fois par jour.
 * C'est le déséquilibre qu'il pointe : « c'est plus logique d'avoir une tâche
 * à ajouter au milieu et sur le côté les catégories modulable ». Tout ce qui
 * touche aux catégories vient donc ici, derrière le crayon, et « + Tâche »
 * récupère la place.
 *
 * @dnd-kit plutôt qu'un glisser-déposer maison : le drag & drop HTML5 ne
 * fonctionne pas au doigt, et Raphaël est sur un téléphone. `TouchSensor` avec
 * un délai court distingue le glissement du défilement de la page — sans lui,
 * essayer de faire défiler la liste attraperait une catégorie.
 */

function LigneCategorie({
  categorie, nbTaches, onRenommer, onSupprimer, categories,
}: {
  categorie: Category
  nbTaches: number
  categories: Category[]
  onRenommer: (id: string, nom: string) => Promise<void> | void
  onSupprimer: (id: string) => Promise<void> | void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: categorie.id,
  })
  const [edite, setEdite] = useState(false)
  const [nom, setNom] = useState(categorie.name)

  async function valider() {
    const refus = verifierRenommage(categories, categorie.id, nom)
    if (refus) {
      toast.error(MESSAGE_REFUS[refus])
      return
    }
    await onRenommer(categorie.id, nom)
    setEdite(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border p-2 ${isDragging ? "opacity-60 shadow-lg" : ""}`}
    >
      {/* La poignée est la SEULE zone qui déclenche le glissement : sinon un
          appui sur « renommer » emporterait la ligne au lieu d'ouvrir le champ. */}
      <button
        type="button"
        className="touch-none text-muted-foreground"
        aria-label={`Déplacer ${categorie.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {edite ? (
        <>
          <Input
            value={nom}
            autoFocus
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void valider()
              if (e.key === "Escape") { setNom(categorie.name); setEdite(false) }
            }}
            className="h-8"
          />
          <Button size="icon" variant="ghost" onClick={() => void valider()} aria-label="Enregistrer">
            <Check className="size-4" />
          </Button>
          <Button
            size="icon" variant="ghost" aria-label="Annuler"
            onClick={() => { setNom(categorie.name); setEdite(false) }}
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">{categorie.name}</span>
          {/* Le nombre de tâches est là POUR LA SUPPRESSION : c'est ce qu'il
              doit savoir avant de retirer une catégorie. */}
          <span className="shrink-0 text-xs text-muted-foreground">
            {nbTaches === 0 ? "vide" : `${nbTaches} tâche${nbTaches > 1 ? "s" : ""}`}
          </span>
          <Button size="icon" variant="ghost" onClick={() => setEdite(true)} aria-label={`Renommer ${categorie.name}`}>
            <Pencil className="size-4" />
          </Button>
          <ConfirmerAction
            titre={`Supprimer la catégorie « ${categorie.name} » ?`}
            description={
              nbTaches === 0
                ? "Elle est vide : rien d'autre ne disparaît."
                : `Ses ${nbTaches} tâche${nbTaches > 1 ? "s" : ""} ne sont PAS supprimées — elles repassent dans « Sans catégorie ».`
            }
            libelleConfirmation="Supprimer"
            destructif
            onConfirmer={() => onSupprimer(categorie.id)}
            trigger={
              <Button size="icon" variant="ghost" aria-label={`Supprimer ${categorie.name}`}>
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </>
      )}
    </div>
  )
}

export function OrganiserCategories({
  categories, taches, onAjouter, onRenommer, onSupprimer, onReordonner,
}: {
  categories: Category[]
  taches: Task[]
  onAjouter: (nom: string) => Promise<void> | void
  onRenommer: (id: string, nom: string) => Promise<void> | void
  onSupprimer: (id: string) => Promise<void> | void
  onReordonner: (positions: { id: string; position: number }[]) => Promise<void> | void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [nouveau, setNouveau] = useState("")
  const ordre = categoriesOrdonnees(categories)

  // Un petit délai avant que le glissement prenne : sans lui, faire défiler la
  // liste au doigt attraperait une catégorie au lieu de faire défiler.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  function surFin(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const versIndex = ordre.findIndex((c) => c.id === over.id)
    const positions = deplacer(categories, String(active.id), versIndex)
    if (positions.length > 0) void onReordonner(positions)
  }

  async function ajouter() {
    const propre = nouveau.trim()
    if (!propre) return
    if (categories.some((c) => c.name.trim().toLowerCase() === propre.toLowerCase())) {
      toast.error(MESSAGE_REFUS.existe)
      return
    }
    await onAjouter(propre)
    setNouveau("")
  }

  const compte = new Map<string, number>()
  for (const t of taches) if (t.category_id) compte.set(t.category_id, (compte.get(t.category_id) ?? 0) + 1)

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Organiser les catégories">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Organiser tes catégories</DialogTitle>
          <DialogDescription>
            Glisse la poignée pour changer l'ordre, le crayon pour renommer. L'ordre choisi
            ici est celui de l'écran Tâches.
          </DialogDescription>
        </DialogHeader>

        {ordre.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucune catégorie pour l'instant. Ajoute la première ci-dessous.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={surFin}
          >
            <SortableContext items={ordre.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {ordre.map((c) => (
                  <LigneCategorie
                    key={c.id}
                    categorie={c}
                    categories={categories}
                    nbTaches={compte.get(c.id) ?? 0}
                    onRenommer={onRenommer}
                    onSupprimer={onSupprimer}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex gap-2 border-t pt-3">
          <Input
            placeholder="Nouvelle catégorie"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void ajouter()}
          />
          <Button variant="outline" onClick={() => void ajouter()}>
            <Plus className="size-4" />
            Ajouter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
