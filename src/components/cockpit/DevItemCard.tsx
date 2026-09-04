import { Archive, ArchiveRestore, Check, MessageSquare, Pencil, Send, Trash2 } from "lucide-react"
import { useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { alreadyNotified } from "@/lib/notifyError"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { DevItemFormDialog } from "@/components/cockpit/DevItemFormDialog"
import { ago, courtAuteur, KIND_LABEL, KIND_VARIANT } from "@/lib/journalBord"
import {
  EXPLICATION_MARQUEUR,
  LIBELLE_MARQUEUR,
  VARIANTE_MARQUEUR,
  marqueurDe,
} from "@/lib/marqueurChantier"
import type { DevItem, DevItemInput, DevLogEntry, DevPriority, DevStatus } from "@/types/database"

/** « Normale » reste implicite : c'est la priorité de presque tous les
 * chantiers, l'afficher sur chacun ne distingue rien et mange la place du
 * titre. Même raisonnement que pour « À faire » ci-dessous. */
const PRIORITY_LABEL: Partial<Record<DevPriority, string>> = {
  low: "Basse",
  high: "Haute",
}

/** Le tableau est groupé par thème : le statut, lui, se lit sur la carte.
 * "À faire" reste implicite — c'est le cas de la plupart, l'afficher n'ajoute
 * que du bruit sur un écran de téléphone. */
const STATUS_LABEL: Partial<Record<DevStatus, string>> = {
  in_progress: "En cours",
  done: "Terminé",
}

const PRIORITY_VARIANT: Record<DevPriority, "secondary" | "outline" | "destructive"> = {
  low: "secondary",
  normal: "outline",
  high: "destructive",
}

/**
 * Les notes archivées finissent souvent par "Commit <hash>." — on rend ce
 * hash cliquable vers GitHub pour retrouver le code réel en un clic
 * (visibilité cockpit → code).
 */
function renderNotes(notes: string) {
  const match = notes.match(/^([\s\S]*commit )([0-9a-f]{7,40})(\.?)$/i)
  if (!match) return notes
  const [, prefix, hash, suffix] = match
  return (
    <>
      {prefix}
      <a
        href={`https://github.com/rnab26/Jarvis-assistant/commit/${hash}`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {hash}
      </a>
      {suffix}
    </>
  )
}

/**
 * Session qui travaille actuellement sur ce chantier, si la réservation court
 * toujours. Une réservation expirée ne compte pas : la session qui l'avait
 * prise a pu être arrêtée sans la libérer.
 */
function reservePar(item: DevItem) {
  if (!item.claimed_by || !item.claim_expires_at) return null
  if (new Date(item.claim_expires_at).getTime() < Date.now()) return null
  return item.claimed_by.replace(/^claude\//, "")
}

const STATUTS: { valeur: DevStatus; libelle: string }[] = [
  { valeur: "todo", libelle: "À faire" },
  { valeur: "in_progress", libelle: "En cours" },
  { valeur: "done", libelle: "Terminé" },
]

const PRIORITES: { valeur: DevPriority; libelle: string }[] = [
  { valeur: "low", libelle: "Basse" },
  { valeur: "normal", libelle: "Normale" },
  { valeur: "high", libelle: "Haute" },
]

interface DevItemCardProps {
  item: DevItem
  /** Thèmes déjà utilisés, proposés à la saisie lors d'une modification. */
  themes?: string[]
  onUpdate: (id: string, input: Partial<DevItemInput>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onArchive?: (id: string) => Promise<void>
  onUnarchive?: (id: string) => Promise<void>
  /** Les messages du journal rattachés à CE chantier, plus récents d'abord. */
  messages?: DevLogEntry[]
  /** Répondre depuis le chantier, sans passer par le journal général. */
  onRepondre?: (itemId: string, body: string) => Promise<void>
  onMarquerTraite?: (id: string) => Promise<void>
  /** Mode sélection : la ligne se coche au lieu de se déplier. */
  selectionnable?: boolean
  selectionne?: boolean
  onSelectionner?: (id: string) => void
}

export function DevItemCard({
  item,
  themes,
  onUpdate,
  onDelete,
  onArchive,
  onUnarchive,
  messages = [],
  onRepondre,
  onMarquerTraite,
  selectionnable = false,
  selectionne = false,
  onSelectionner,
}: DevItemCardProps) {
  const [deplie, setDeplie] = useState(false)
  const [reponse, setReponse] = useState("")
  const [envoiReponse, setEnvoiReponse] = useState(false)

  // Une question posée par une session et restée sans réponse est la seule
  // chose qui doive se voir SANS déplier : c'est elle qui bloque le travail.
  const questionsEnAttente = messages.filter((m) => m.kind === "question" && !m.answered_at).length

  // Le marqueur en tête des notes commande le travail des sessions ; il était
  // pourtant invisible tant qu'on n'avait pas déplié la note.
  const marqueur = marqueurDe(item)

  // Même densité que les tâches (option « compact » choisie par Raphaël le
  // 3 sept. 2026) : plus de cadre par chantier, un filet entre deux, les
  // étiquettes dans la ligne du titre. Deux listes qui se ressemblent doivent
  // se lire pareil — sinon le cockpit paraît inachevé à côté des tâches.
  return (
    <div className="flex flex-col gap-1.5 py-1.5">
      <div className="flex items-start gap-2">
      {/* En mode sélection, la case prend toute la hauteur de la ligne : sur
          un téléphone, viser un carré de trois millimètres à côté d'un titre
          qu'on peut aussi toucher ne marche pas. */}
      {selectionnable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selectionne}
          aria-label={`Sélectionner ${item.title}`}
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border ${
            selectionne ? "border-primary bg-primary text-primary-foreground" : "border-input"
          }`}
          onClick={() => onSelectionner?.(item.id)}
        >
          {selectionne && <Check className="size-3.5" />}
        </button>
      )}
      {/* Appuyer sur la ligne déplie le chantier. Avant, le seul moyen de lire
          une note entière était le crayon — qui annonce « modifier » et ouvre
          un formulaire : on ouvrait une fenêtre d'édition pour lire, avec le
          risque d'enregistrer sans le vouloir. Raphaël l'a signalé le 3 sept.
          Le bouton porte tout le bloc titre + note, pas seulement le titre :
          sur un téléphone, viser une ligne de texte de trois millimètres ne
          marche pas. */}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        aria-expanded={deplie}
        onClick={() => (selectionnable ? onSelectionner?.(item.id) : setDeplie(!deplie))}
      >
        {/* Une seule ligne, donc au plus deux étiquettes courtes à droite du
            titre : à trois, elles écrasaient le titre jusqu'à le faire
            disparaître sur un écran de téléphone. « Prise par … » descend donc
            avec la note, dont elle a la nature — un détail qu'on lit après
            avoir trouvé le chantier, pas un critère pour le trouver. */}
        <div className="flex items-center gap-1.5">
          <span className={`min-w-0 flex-1 text-sm ${deplie ? "" : "truncate"}`}>
            {item.title}
          </span>
          {STATUS_LABEL[item.status] && (
            <Badge variant="default" className="shrink-0 px-1.5 text-xs font-normal">
              {STATUS_LABEL[item.status]}
            </Badge>
          )}
          {/* Deux étiquettes au plus à droite du titre : à trois, elles
              l'écrasent sur un écran de téléphone. Le marqueur passe donc
              devant la priorité — « à cadrer » dit qu'une session ne le
              prendra pas, ce qui compte davantage que « haute ». */}
          {marqueur ? (
            <Badge
              variant={VARIANTE_MARQUEUR[marqueur]}
              className="shrink-0 px-1.5 text-xs font-normal"
            >
              {LIBELLE_MARQUEUR[marqueur]}
            </Badge>
          ) : (
            PRIORITY_LABEL[item.priority] && (
              <Badge
                variant={PRIORITY_VARIANT[item.priority]}
                className="shrink-0 px-1.5 text-xs font-normal"
              >
                {PRIORITY_LABEL[item.priority]}
              </Badge>
            )
          )}
          {questionsEnAttente > 0 && (
            <Badge variant="default" className="shrink-0 px-1.5 text-xs font-normal">
              <MessageSquare className="size-3" />
              {questionsEnAttente}
            </Badge>
          )}
        </div>
        {/* Archivé le… : la liste des archivées se lit comme un historique,
            et un historique sans dates ne dit pas ce qui a avancé cette
            semaine. La note porte le commit, elle ne porte pas la date. */}
        {item.archived_at && (
          <p className="text-xs text-muted-foreground">
            Archivé le{" "}
            {new Date(item.archived_at).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
            })}
          </p>
        )}
        {deplie && marqueur && (
          <p className="text-xs text-muted-foreground">{EXPLICATION_MARQUEUR[marqueur]}</p>
        )}
        {reservePar(item) && (
          <p className="truncate text-xs text-muted-foreground">
            Prise par {reservePar(item)}
          </p>
        )}
        {item.notes && (
          // Trois lignes ici, contre deux pour une tâche : les notes d'un
          // chantier portent le cadrage, et c'est ce qu'on vient y lire.
          <p
            className={`text-xs whitespace-pre-line text-muted-foreground ${
              deplie ? "" : "line-clamp-2"
            }`}
          >
            {renderNotes(item.notes)}
          </p>
        )}
      </button>
      {onArchive && item.status === "done" && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Archiver"
          onClick={() => onArchive(item.id).catch(alreadyNotified)}
        >
          <Archive className="size-3.5" />
        </Button>
      )}
      {onUnarchive && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Désarchiver"
          onClick={() => onUnarchive(item.id).catch(alreadyNotified)}
        >
          <ArchiveRestore className="size-3.5" />
        </Button>
      )}
      <DevItemFormDialog
        item={item}
        themes={themes}
        onSubmit={(input) => onUpdate(item.id, input)}
        trigger={
          <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Modifier">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      {/* Un chantier supprimé ne se retrouve nulle part — contrairement à un
          chantier archivé, qui reste consultable. Sur un téléphone, la
          corbeille est à trois millimètres du crayon : elle demande donc
          confirmation, et rappelle ce qu'on est en train de supprimer. */}
      <ConfirmerAction
        titre="Supprimer ce chantier ?"
        description={
          <>
            « {item.title} » sera supprimé définitivement. Pour le garder sans
            l'avoir dans la liste, archive-le plutôt.
          </>
        }
        libelleConfirmation="Supprimer"
        onConfirmer={() => onDelete(item.id)}
        trigger={
          <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Supprimer">
            <Trash2 className="size-3.5" />
          </Button>
        }
      />
      </div>

      {/* Les trois choses qu'on change tout le temps — le statut, la priorité,
          la section — se changeaient jusqu'ici en ouvrant le formulaire, en
          visant un menu et en enregistrant. Partout ailleurs (Linear, Trello,
          GitHub Projects) elles se changent depuis la ligne. Le formulaire
          reste pour le reste : le titre, la note. */}
      {/* Le chantier porte sa conversation. Les messages des sessions
          existaient déjà (dev_log.item_id), mais seulement dans le flux du
          journal, mélangés à tous les autres : une question posée sur un
          chantier ne se lisait pas sur le chantier, et une réponse écrite
          ailleurs ne s'y voyait pas non plus. */}
      {deplie && !selectionnable && messages.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-2">
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Badge variant={KIND_VARIANT[m.kind]} className="shrink-0 px-1.5 text-xs font-normal">
                  {KIND_LABEL[m.kind]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {courtAuteur(m.author)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{ago(m.created_at)}</span>
                {m.kind === "question" && !m.answered_at && onMarquerTraite && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Marquer traité"
                    onClick={() => onMarquerTraite(m.id).catch(alreadyNotified)}
                  >
                    <Check className="size-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-xs whitespace-pre-line text-muted-foreground">{m.body}</p>
            </div>
          ))}

          {onRepondre && (
            <div className="flex flex-col gap-1.5">
              <Textarea
                value={reponse}
                rows={2}
                placeholder="Répondre à la session, ici même"
                aria-label={`Répondre sur ${item.title}`}
                onChange={(e) => setReponse(e.target.value)}
              />
              {reponse.trim() && (
                <Button
                  size="sm"
                  className="self-end"
                  disabled={envoiReponse}
                  onClick={async () => {
                    setEnvoiReponse(true)
                    try {
                      await onRepondre(item.id, reponse.trim())
                      setReponse("")
                    } catch {
                      // Toast déjà affiché : la saisie reste.
                    } finally {
                      setEnvoiReponse(false)
                    }
                  }}
                >
                  <Send className="size-3.5" />
                  Répondre
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {deplie && !selectionnable && !item.archived_at && (
        <div className="flex flex-col gap-1.5 pl-0.5">
          <div className="flex flex-wrap gap-1">
            {STATUTS.map(({ valeur, libelle }) => (
              <Puce
                key={valeur}
                active={item.status === valeur}
                onClick={() => onUpdate(item.id, { status: valeur }).catch(alreadyNotified)}
              >
                {libelle}
              </Puce>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {PRIORITES.map(({ valeur, libelle }) => (
              <Puce
                key={valeur}
                active={item.priority === valeur}
                onClick={() => onUpdate(item.id, { priority: valeur }).catch(alreadyNotified)}
              >
                {libelle}
              </Puce>
            ))}
          </div>
          {themes && themes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {themes.map((t) => (
                <Puce
                  key={t}
                  active={(item.theme ?? "") === t}
                  onClick={() =>
                    onUpdate(item.id, { theme: (item.theme ?? "") === t ? null : t }).catch(
                      alreadyNotified,
                    )
                  }
                >
                  {t}
                </Puce>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Un choix qui s'applique tout de suite, sans bouton « enregistrer » : ce
 * qu'on change ici est réversible d'un second appui. */
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
      className={`rounded-full border px-2 py-0.5 text-xs ${
        active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  )
}
