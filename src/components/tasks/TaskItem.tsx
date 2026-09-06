import { ArrowRightLeft, BellOff, BellRing, CloudOff, Pencil, RotateCw, Trash2 } from "lucide-react"
import { useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { alreadyNotified } from "@/lib/notifyError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { lireEcheance } from "@/lib/echeance"
import { rappelDeLaTache } from "@/lib/notifications/plan"
import { chantierDeguise } from "@/lib/tacheOuChantier"
import type { PrefsNotifications } from "@/lib/notifications/prefs"
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
  /** Créer le chantier correspondant, quand cette « tâche » n'en est pas une.
   * Absent = la proposition ne s'affiche pas (banc d'essai, écran réduit). */
  onEnFaireUnChantier?: (titre: string, notes: string | null) => Promise<void>
  /** Les réglages de notification, pour dire si CETTE tâche fera sonner
   * quelque chose. Absents = on ne dit rien plutôt que de deviner. */
  prefsNotifs?: PrefsNotifications
  /** Relancer l'envoi d'une tâche restée en attente. Absent = pas de bouton. */
  onRelancerEnvoi?: (id: string) => void
  /** Retirer une dictée de la file : elle disparaît pour de bon. */
  onOublierEnAttente?: (id: string) => void
}

export function TaskItem({
  task,
  categories,
  onToggle,
  onUpdate,
  onDelete,
  onEnFaireUnChantier,
  prefsNotifs,
  onRelancerEnvoi,
  onOublierEnAttente,
}: TaskItemProps) {
  const [deplie, setDeplie] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const isDone = task.status === "done"
  // Une tâche faite n'est plus en retard : garder l'étiquette rouge sur
  // quelque chose de terminé ne signale rien, ça alarme pour rien.
  const echeance = lireEcheance(task.due_date, task.due_time)
  // Une demande faite à Claude, atterrie dans sa liste de courses : au 5 sept.
  // six de ses tâches étaient dans ce cas, dont une qui n'existait nulle part
  // ailleurs. Rien n'est proposé sur une tâche déjà faite.
  const deguise = isDone ? null : chantierDeguise(task.title, task.notes)
  // Elle est notée mais pas encore écrite en base. Rien ne doit lui laisser
  // croire le contraire — sa règle du 6 sept. : « on n'annonce jamais au passé
  // ce qu'on n'a pas constaté, ni à l'oral, ni dans un toast, ni dans une
  // étiquette d'écran ».
  const enAttente = task.enAttente === true

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        {/* Une ligne encore en attente n'existe pas en base : la cocher, la
            modifier ou la supprimer échouerait à coup sûr. On montre l'icône
            du hors-ligne à la place de la case, plutôt qu'un contrôle mort. */}
        {enAttente ? (
          <CloudOff
            className={`size-4 shrink-0 ${task.envoiBloque ? "text-destructive" : "text-muted-foreground"}`}
            aria-hidden
          />
        ) : (
          <input
            type="checkbox"
            checked={isDone}
            onChange={() => onToggle(task).catch(alreadyNotified)}
            className="size-4 shrink-0"
            aria-label="Marquer comme faite"
          />
        )}
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
        {enAttente && (
          <Badge
            variant={task.envoiBloque ? "destructive" : "secondary"}
            className="shrink-0 px-1.5 text-xs font-normal"
          >
            {task.envoiBloque ? "pas enregistrée" : "en attente d'envoi"}
          </Badge>
        )}
        {enAttente ? (
          <>
            {onRelancerEnvoi && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label="Réessayer d'enregistrer"
                onClick={() => onRelancerEnvoi(task.id)}
              >
                <RotateCw className="size-3.5" />
              </Button>
            )}
            {onOublierEnAttente && (
              // Retirer de la file, c'est perdre la dictée pour de bon : même
              // règle que partout ailleurs dans l'app, on demande avant.
              <ConfirmerAction
                titre="Abandonner cette tâche ?"
                description={
                  <>
                    « {task.title} » n'a jamais été enregistrée. L'abandonner ici la fait
                    disparaître définitivement.
                  </>
                }
                libelleConfirmation="Abandonner"
                onConfirmer={async () => onOublierEnAttente(task.id)}
                trigger={
                  <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Abandonner">
                    <Trash2 className="size-3.5" />
                  </Button>
                }
              />
            )}
          </>
        ) : (
        <>
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
        {/* Une tâche supprimée ne se retrouve nulle part, et sur un téléphone
            la corbeille est à trois millimètres du crayon. Même règle que
            dans le cockpit depuis le 4 sept. */}
        <ConfirmerAction
          titre="Supprimer cette tâche ?"
          description={<>« {task.title} » sera supprimée définitivement.</>}
          libelleConfirmation="Supprimer"
          onConfirmer={() => onDelete(task.id)}
          trigger={
            <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Supprimer">
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
        </>
        )}
      </div>
      {/* La raison du blocage, en clair. « Ça n'a pas marché » sans dire
          pourquoi ne permet ni de comprendre ni de rattraper. */}
      {enAttente && task.envoiBloque && task.echecEnvoi && (
        <p className="ml-6 mt-0.5 text-xs text-destructive">
          Pas enregistrée après plusieurs essais : {task.echecEnvoi}
        </p>
      )}
      {/* La proposition, jamais l'action : c'est SA liste. On crée le chantier
          et on marque la tâche faite — on ne la supprime pas, il doit pouvoir
          retrouver ce qu'il a dicté. */}
      {deguise && onEnFaireUnChantier && (
        <div className="mt-1 ml-6 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-2 py-1.5">
          <span className="text-xs text-muted-foreground">
            <ArrowRightLeft className="mr-1 inline size-3 align-[-1px]" />
            Ça commence par {deguise.indice} : c'est une demande à Claude, pas une tâche.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={enCours}
            onClick={async () => {
              setEnCours(true)
              try {
                await onEnFaireUnChantier(deguise.titre, task.notes)
              } finally {
                setEnCours(false)
              }
            }}
          >
            {enCours ? "…" : "En faire un chantier"}
          </Button>
        </div>
      )}
      {/* CE QUI VA RÉELLEMENT SONNER, et quand — sa question du chantier
          336be5fb : « est-ce que ces dates d'échéance correspondent au rappel
          qui pourrait lancer à Jarvis de me faire un rappel oral ? »
          Mesuré le 6 sept. sur ses trente tâches : vingt-deux n'ont aucune
          date et ne sonneront jamais, quatre sont en retard. Rien ne le
          disait. Le texte vient de `rappelDeLaTache`, qui passe par la
          fonction QUI PROGRAMME VRAIMENT les alarmes : ce qu'il lit ici est
          ce qui se passera, pas une seconde interprétation de la même règle.
          Seulement une fois la ligne dépliée : trente lignes qui répètent
          « aucun rappel » sont un mur, pas une réponse. */}
      {deplie && prefsNotifs && !isDone && (
        <RappelDeLaLigne task={task} prefs={prefsNotifs} />
      )}
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

/**
 * Une ligne qui dit ce que Jarvis fera, ou ne fera pas, pour cette tâche.
 *
 * On n'annonce jamais un rappel qu'on n'a pas constaté programmable : quand il
 * n'y en aura pas, on dit POURQUOI, et ce qu'il faut faire pour qu'il y en ait
 * un. « Aucun rappel » sans raison se lit comme une panne.
 */
function RappelDeLaLigne({ task, prefs }: { task: Task; prefs: PrefsNotifications }) {
  const rappel = rappelDeLaTache(task, prefs, new Date())

  if (rappel.sonnera) {
    const quand = rappel.quand.toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    })
    return (
      <p className="ml-6 text-xs text-muted-foreground">
        <BellRing className="mr-1 inline size-3 align-[-1px]" />
        Jarvis te préviendra {quand.replace(":", " h ")}
        {rappel.silencieux && " — en silencieux, c'est dans tes heures de silence"}.
      </p>
    )
  }

  const RAISONS: Record<typeof rappel.raison, string> = {
    faite: "",
    sans_date: "Aucun rappel : cette tâche n'a pas de date. Ajoute-en une avec le crayon.",
    passee:
      "Aucun rappel : l'échéance est passée. Seul le point du matin la mentionnera, s'il est activé.",
    coupe: "Aucun rappel : les rappels d'échéance sont coupés dans Paramètres › Notifications.",
    date_illisible: "Aucun rappel : la date de cette tâche est illisible. Corrige-la avec le crayon.",
  }
  const texte = RAISONS[rappel.raison]
  if (!texte) return null

  return (
    <p className="ml-6 text-xs text-muted-foreground">
      <BellOff className="mr-1 inline size-3 align-[-1px]" />
      {texte}
    </p>
  )
}
