import { ChevronDown, ChevronRight, Plus, Target } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TaskItem } from "@/components/tasks/TaskItem"
import { libelleArchive, phraseCategorieSoldee, repartir } from "@/lib/archiveTaches"
import { categoriesOrdonnees } from "@/lib/ordreCategories"
import type { PrefsNotifications } from "@/lib/notifications/prefs"
import type { Category, Task, TaskInput } from "@/types/database"

interface TaskListProps {
  tasks: Task[]
  categories: Category[]
  onToggle: (task: Task) => Promise<void>
  onUpdate: (id: string, input: TaskInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** Transformer une « tâche » qui est en fait une demande à Claude en
   * chantier du cockpit. Absent = la proposition ne s'affiche pas. */
  onEnFaireUnChantier?: (task: Task, titre: string, notes: string | null) => Promise<void>
  /** Pour dire, sur une ligne dépliée, ce que Jarvis fera sonner et quand. */
  prefsNotifs?: PrefsNotifications
  /** Relancer l'envoi d'une tâche restée en attente (réseau coupé). */
  onRelancerEnvoi?: (id: string) => void
  /** Retirer une dictée de la file d'attente. */
  onOublierEnAttente?: (id: string) => void
  /** Les terminées dépliées d'entrée ? Réglage `jarvis_taches_archives_ouvertes`
   * (Paramètres › Tâches et organisation). Replié par défaut : c'est le but
   * même de sa demande — que les tâches faites cessent de polluer la liste. */
  archivesOuvertes?: boolean
  /** Le « + » de chaque bloc : crée une tâche déjà rangée dans sa catégorie
   * (sa demande du 24 nov. 2026). Absent = pas de bouton. */
  onAjouter?: (input: TaskInput) => Promise<void>
  /** La cible de chaque ligne : ajoute ou retire de l'« Objectif du jour ».
   * Absent = ni cible ni bloc « Objectif du jour ». */
  onObjectif?: (task: Task) => void
}

const NO_CATEGORY_LABEL = "Sans catégorie"

export function TaskList({
  tasks,
  categories,
  onToggle,
  onUpdate,
  onDelete,
  onEnFaireUnChantier,
  prefsNotifs,
  onRelancerEnvoi,
  onOublierEnAttente,
  archivesOuvertes = false,
  onAjouter,
  onObjectif,
}: TaskListProps) {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]))
  const groups = new Map<string, Task[]>()

  for (const task of tasks) {
    const key = task.category_id ?? "none"
    const group = groups.get(key) ?? []
    group.push(task)
    groups.set(key, group)
  }

  // Ordre stable : catégories dans l'ordre alphabétique déjà fourni par
  // useTasks, puis "Sans catégorie" en dernier — plutôt que l'ordre
  // d'apparition dans les tâches (qui change à chaque tri par échéance).
  const orderedKeys = [...categories.map((c) => c.id), "none"].filter((key) =>
    groups.has(key),
  )

  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Aucune tâche pour l'instant.
      </p>
    )
  }

  const communs = {
    categories,
    toutesLesTaches: tasks,
    onToggle,
    onUpdate,
    onDelete,
    onEnFaireUnChantier,
    prefsNotifs,
    onRelancerEnvoi,
    onOublierEnAttente,
    archivesOuvertes,
    onObjectif,
  }
  // L'objectif du jour, au-dessus de toutes les sections (sa demande du
  // 24 nov. 2026 : « pour éviter de tout consulter »). Une tâche cochée en
  // sort ; elle reste aussi dans sa section, cible colorée.
  const objectifs = onObjectif ? tasks.filter((t) => t.objectif_le && t.status !== "done") : []

  return (
    <div className="flex flex-col gap-4">
      {objectifs.length > 0 && (
        <BlocCategorie
          {...communs}
          cleRepli="objectif"
          enAvant
          categorieId={null}
          nom="Objectif du jour"
          taches={objectifs}
        />
      )}
      {orderedKeys.map((categoryId) => (
        <BlocCategorie
          {...communs}
          key={categoryId}
          cleRepli={categoryId}
          categorieId={categoryId === "none" ? null : categoryId}
          onAjouter={onAjouter}
          nom={categoryById.get(categoryId) ?? NO_CATEGORY_LABEL}
          taches={groups.get(categoryId)!}
        />
      ))}
    </div>
  )
}

/**
 * Un bloc de catégorie : son nom, ce qui reste à faire, et ses terminées.
 *
 * LE NOM EST CENTRÉ ET PORTE UN BANDEAU, et c'est sa demande du 15 sept. 2026
 * (capture à l'appui, trois noms de catégorie entourés) : « je veux que tu
 * centre le nom des catégories de listes dans leur blocs respectifs et fait
 * les plus ressortir sans que ce soit trop lourd mais quon puisse mieux faire
 * la distinction dans les differents blocs de liste de taches ».
 *
 * Le bandeau prend la place du padding haut de la carte au lieu de s'y
 * ajouter (`-mt-(--card-spacing)`) : sur dix catégories, un en-tête qui
 * coûterait vingt points chacun repousserait la moitié de sa liste hors de
 * l'écran. Pas de majuscules forcées — « HIPOUY » crie, et il demande
 * justement que ce ne soit pas lourd.
 */
function BlocCategorie({
  nom,
  taches,
  categories,
  onToggle,
  onUpdate,
  onDelete,
  onEnFaireUnChantier,
  prefsNotifs,
  onRelancerEnvoi,
  onOublierEnAttente,
  archivesOuvertes,
  onAjouter,
  onObjectif,
  categorieId,
  toutesLesTaches,
  cleRepli,
  enAvant = false,
}: {
  nom: string
  taches: Task[]
  categorieId: string | null
  /** Pour le « ça existe déjà » du formulaire, qui compare à toute la liste. */
  toutesLesTaches: Task[]
  /** Sous quel nom l'appareil retient si ce bloc est replié. */
  cleRepli: string
  /** Le bloc « Objectif du jour » : cible dans le titre, cadre coloré. */
  enAvant?: boolean
} & Omit<TaskListProps, "tasks">) {
  const { aFaire, archivees } = repartir(taches)
  const [ouvert, setOuvert] = useState(archivesOuvertes === true)
  // Replié ou déplié, retenu par section sur CET appareil (sa demande du
  // 24 nov. 2026). Même préfixe que les sections de Paramètres, déjà classé
  // « confort d'écran, pas une préférence à synchroniser » dans reglages.ts.
  const cleStockage = `jarvis_section_taches_${cleRepli}`
  const [replie, setReplie] = useState(() => lireStockage(cleStockage) === "0")
  function basculerRepli() {
    const suivant = !replie
    setReplie(suivant)
    try {
      localStorage.setItem(cleStockage, suivant ? "0" : "1")
    } catch {
      // Stockage refusé : le bloc s'ouvrira simplement déplié la prochaine fois.
    }
  }
  const soldee = aFaire.length === 0 ? phraseCategorieSoldee(archivees.length) : null

  const ligne = (task: Task) => (
    <TaskItem
      key={task.id}
      task={task}
      categories={categories}
      onToggle={onToggle}
      onUpdate={onUpdate}
      onDelete={onDelete}
      prefsNotifs={prefsNotifs}
      onRelancerEnvoi={onRelancerEnvoi}
      onOublierEnAttente={onOublierEnAttente}
      onObjectif={onObjectif}
      onEnFaireUnChantier={
        onEnFaireUnChantier
          ? (titre, notes) => onEnFaireUnChantier(task, titre, notes)
          : undefined
      }
    />
  )

  return (
    // `gap-2` AU LIEU DES 16 POINTS PAR DÉFAUT, et c'est ce qui paie le
    // bandeau : mesuré sur le banc, l'en-tête centré coûtait +9 points par
    // carte, resserrer les écarts internes en rend 8 par intervalle. Un blanc
    // de seize points sous un bandeau qui sépare déjà à l'œil ne sert plus à
    // rien — la séparation est faite par le trait, pas par le vide.
    <Card className={enAvant ? "gap-2 ring-2 ring-primary/40" : "gap-2"}>
      {/* Le « + » est posé PAR-DESSUS le bandeau, à droite, sans prendre de
          place : le nom reste centré (padding symétrique px-9) et la carte
          garde sa hauteur — budget mesuré par verifier-taches-web. */}
      <CardHeader className="-mt-(--card-spacing) border-b bg-muted/40 py-2.5">
        {/* Ancré sur la ligne du nom, pas sur le bandeau : le bandeau a plus
            de marge en bas qu'en haut, le « + » y tombait plus bas que le nom. */}
        <CardTitle className="relative px-9 text-center font-semibold tracking-wide">
          {/* Toucher le nom replie ou déplie le bloc. Replié, il garde son
              compte : on sait ce qui attend sans rouvrir. */}
          <button
            type="button"
            aria-expanded={!replie}
            onClick={basculerRepli}
            className="inline-flex w-full items-center justify-center gap-1.5"
          >
            {enAvant && <Target className="size-4 shrink-0 text-primary" />}
            {nom}
            {replie && aFaire.length > 0 && (
              <span className="font-normal text-muted-foreground">· {aFaire.length}</span>
            )}
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${replie ? "-rotate-90" : ""}`}
            />
          </button>
          {onAjouter && (
            // .zone-tactile impose position: relative : le placement va sur l'enveloppe.
            <span className="absolute top-1/2 right-0 flex -translate-y-1/2">
              <TaskFormDialog
                categories={categoriesOrdonnees(categories)}
                taches={toutesLesTaches}
                categorieInitiale={categorieId}
                onSubmit={onAjouter}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Ajouter une tâche dans ${nom}`}
                    className="zone-tactile"
                  >
                    <Plus className="size-5" />
                  </Button>
                }
              />
            </span>
          )}
        </CardTitle>
      </CardHeader>
      {!replie && (
        <>
          {/* Un filet entre deux tâches, pas un cadre autour de chacune :
              c'est ce qui rend la liste compacte sans rétrécir le texte. */}
          <CardContent className="divide-y">
            {soldee ? (
              <p className="py-2 text-center text-sm text-muted-foreground">{soldee}</p>
            ) : (
              aFaire.map(ligne)
            )}
          </CardContent>

          {/* LES TERMINÉES. Le dépliant ne s'affiche PAS quand il n'y en a aucune :
              « 0 terminées » est un contrôle mort, et la carte reste exactement
              aussi haute qu'avant pour une catégorie qu'il n'a pas encore
              entamée. */}
          {archivees.length > 0 && (
            <CardContent className="pt-0">
              <button
                type="button"
                aria-expanded={ouvert}
                onClick={() => setOuvert(!ouvert)}
                className="zone-tactile flex w-full items-center justify-center gap-1.5 border-t pt-2 text-xs text-muted-foreground"
              >
                {ouvert ? (
                  <ChevronDown className="size-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0" />
                )}
                {libelleArchive(archivees.length)}
              </button>
              {ouvert && <div className="divide-y">{archivees.map(ligne)}</div>}
            </CardContent>
          )}
        </>
      )}
    </Card>
  )
}

/** Le stockage peut être refusé (navigation privée, quota) : on lit alors
 * « rien choisi », donc déplié. */
function lireStockage(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}
