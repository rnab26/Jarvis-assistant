import { Check, Pencil, Play, Trash2, X } from "lucide-react"
import { useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { LoadError } from "@/components/LoadError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { useEntrainement } from "@/hooks/useEntrainement"
import type { SequenceEntrainementRow } from "@/types/database"

/**
 * « Mode entraînement » (chantier 86df4f4a) : ce que Jarvis a retenu en le
 * regardant faire, et les trois gestes qu'une séquence enregistrée doit
 * pouvoir recevoir — la renommer, la rejouer pour vérifier qu'elle marche
 * encore, la supprimer avec confirmation. La voix sait déjà créer et rejouer
 * une séquence (« commence/termine l'entraînement », « refais X ») ; sans cet
 * écran, la renommer ou la supprimer n'aurait aucun chemin du tout.
 */
export function Entrainement({ api }: { api: ReturnType<typeof useEntrainement> }) {
  const { sequences, loading, error, refresh } = api

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ce que Jarvis a retenu</CardTitle>
        <CardDescription>
          « Jarvis, commence l'entraînement », montre-lui ce qu'il faut faire sur l'écran, puis
          « termine l'entraînement, appelle ça… ». Il rejoue ensuite exactement les mêmes gestes
          quand tu dis « refais… » suivi du nom. Ce n'est pas encore généralisé : une séquence
          rejoue les mêmes clics, elle ne s'adapte pas à un écran différent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : error ? (
          <LoadError message={error} onRetry={refresh} />
        ) : sequences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune séquence enregistrée pour l'instant.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {sequences.map((s) => (
              <LigneSequence key={s.id} sequence={s} api={api} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function LigneSequence({
  sequence,
  api,
}: {
  sequence: SequenceEntrainementRow
  api: ReturnType<typeof useEntrainement>
}) {
  const [edition, setEdition] = useState(false)
  const [nom, setNom] = useState(sequence.nom)
  const [enregistre, setEnregistre] = useState(false)
  const [rejeuEnCours, setRejeuEnCours] = useState(false)
  const [dernierMessage, setDernierMessage] = useState<string | null>(null)

  async function enregistrerNom() {
    const suivant = nom.trim()
    if (!suivant) return
    setEnregistre(true)
    try {
      if (suivant !== sequence.nom) await api.renameSequence(sequence.id, suivant)
      setEdition(false)
    } catch {
      // Déjà signalé par un toast ; on laisse la saisie telle quelle.
    } finally {
      setEnregistre(false)
    }
  }

  async function rejouerMaintenant() {
    setRejeuEnCours(true)
    setDernierMessage(null)
    try {
      const message = await api.rejouer({
        id: sequence.id,
        nom: sequence.nom,
        etapes: sequence.etapes,
      })
      setDernierMessage(message)
    } finally {
      setRejeuEnCours(false)
    }
  }

  if (edition) {
    return (
      <li className="flex flex-col gap-2 py-3">
        <Input
          value={nom}
          autoFocus
          aria-label="Nom de la séquence"
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enregistrerNom()
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEdition(false)}>
            <X className="size-3.5" />
            Annuler
          </Button>
          <Button size="sm" disabled={enregistre || !nom.trim()} onClick={enregistrerNom}>
            <Check className="size-3.5" />
            Enregistrer
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium">{sequence.nom}</span>
            <Badge variant="outline" className="shrink-0 px-1.5 text-xs font-normal">
              {sequence.etapes.length} étape{sequence.etapes.length > 1 ? "s" : ""}
            </Badge>
          </div>
          {sequence.dernier_resultat && (
            <p className="text-xs text-muted-foreground">
              Dernier essai :{" "}
              {sequence.dernier_resultat === "reussi" ? "réussi" : "échoué"}
              {sequence.dernier_essai_at &&
                ` — ${new Date(sequence.dernier_essai_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Rejouer maintenant"
          disabled={rejeuEnCours}
          onClick={rejouerMaintenant}
        >
          <Play className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Renommer"
          onClick={() => {
            setNom(sequence.nom)
            setEdition(true)
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        <ConfirmerAction
          libelleConfirmation="Supprimer"
          titre={`Supprimer « ${sequence.nom} » ?`}
          description="Jarvis ne saura plus la rejouer. Il faudra la refaire depuis le début si tu en as encore besoin."
          onConfirmer={() => api.deleteSequence(sequence.id)}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Supprimer">
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
      </div>
      {rejeuEnCours && <p className="text-xs text-muted-foreground">Je reproduis la séquence…</p>}
      {dernierMessage && !rejeuEnCours && (
        <p className="text-xs text-muted-foreground">{dernierMessage}</p>
      )}
    </li>
  )
}
