import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { alreadyNotified } from "@/lib/notifyError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { lireEcheance } from "@/lib/echeance"
import type { Category, Task, TaskInput } from "@/types/database"

/**
 * Une tâche, en une ligne.
 *
 * Densité choisie par Raphaël le 3 sept. 2026 (option « compact » de la fiche
 * https://claude.ai/code/artifact/067c81c1-88de-4ca9-8947-8df34eb9f89e) :
 * la note reste visible, les étiquettes rentrent dans la ligne du titre, et
 * chaque tâche n'est plus une carte encadrée dans une carte.
 *
 * Ce qui a fait gagner le plus de hauteur n'est pas la taille du texte, c'est
 * la suppression du cadre par tâche : une bordure, un rayon, et l'écart entre
 * deux cartes coûtaient plus de pixels que la ligne elle-même. La liste est
 * maintenant séparée par un simple filet (voir TaskList).
 *
 * Le titre tient sur une ligne et se coupe : sur un téléphone, un titre long
 * qui passe à la ligne décale toutes les tâches suivantes et casse le rythme
 * de lecture. Le titre entier reste lisible en ouvrant la tâche.
 */
interface TaskItemProps {
  task: Task
  categories: Category[]
  onToggle: (task: Task) => Promise<void>
  onUpdate: (id: string, input: TaskInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TaskItem({
  task,
  categories,
  onToggle,
  onUpdate,
  onDelete,
}: TaskItemProps) {
  const [deplie, setDeplie] = useState(false)
  const isDone = task.status === "done"
  // Une tâche faite n'est plus en retard : garder l'étiquette rouge sur
  // quelque chose de terminé ne signale rien, ça alarme pour rien.
  const echeance = lireEcheance(task.due_date, task.due_time)

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => onToggle(task).catch(alreadyNotified)}
          className="size-4 shrink-0"
          aria-label="Marquer comme faite"
        />
        {/* Appuyer sur le titre déplie la tâche. Le crayon annonce « modifier »
            et ouvre un formulaire : s'en servir pour LIRE une note, c'est
            ouvrir une fenêtre d'édition sans vouloir modifier. Signalé par
            Raphaël le 3 sept., sur les chantiers comme sur les tâches. */}
        <button
          type="button"
          aria-expanded={deplie}
          onClick={() => setDeplie(!deplie)}
          className={`min-w-0 flex-1 text-left text-sm ${deplie ? "" : "truncate"} ${
            isDone ? "text-muted-foreground line-through" : ""
          }`}
        >
          {task.title}
        </button>
        {echeance && (
          <Badge
            variant={echeance.enRetard && !isDone ? "destructive" : "outline"}
            className="shrink-0 px-1.5 text-xs font-normal"
          >
            {echeance.texte}
          </Badge>
        )}
        <TaskFormDialog
          categories={categories}
          task={task}
          onSubmit={(input) => onUpdate(task.id, input)}
          trigger={
            <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Modifier">
              <Pencil className="size-3.5" />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Supprimer"
          onClick={() => onDelete(task.id).catch(alreadyNotified)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {task.notes && (
        // Alignée sous le titre, pas sous la case : la note appartient au
        // titre. Deux lignes au plus, sinon une note dictée d'un trait occupe
        // à elle seule tout l'écran.
        <p
          className={`ml-6 text-xs whitespace-pre-line text-muted-foreground ${
            deplie ? "" : "line-clamp-2"
          }`}
        >
          {task.notes}
        </p>
      )}
    </div>
  )
}
