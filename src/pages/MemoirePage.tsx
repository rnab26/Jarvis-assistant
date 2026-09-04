import { Check, Pencil, Trash2, Undo2 } from "lucide-react"
import { useState } from "react"
import { ConfirmerSuppression } from "@/components/ConfirmerSuppression"
import { LoadError } from "@/components/LoadError"
import { ConversationsRecentes } from "@/components/memoire/ConversationsRecentes"
import { SanteMemoire } from "@/components/memoire/SanteMemoire"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/useAuth"
import { useEchanges } from "@/hooks/useEchanges"
import { useSanteMemoire } from "@/hooks/useSanteMemoire"
import { useSouvenirs } from "@/hooks/useSouvenirs"
import { alreadyNotified } from "@/lib/notifyError"
import type { Souvenir, SouvenirCategorie } from "@/types/database"

const CATEGORIE_LABEL: Record<SouvenirCategorie, string> = {
  personne: "Personne",
  dossier: "Dossier",
  engagement: "Engagement",
  preference: "Préférence",
  fait: "Fait",
}

const ORDRE: SouvenirCategorie[] = ["personne", "dossier", "engagement", "preference", "fait"]

function LigneSouvenir({
  souvenir,
  onCorriger,
  onOublier,
  onPerimer,
}: {
  souvenir: Souvenir
  onCorriger: (id: string, contenu: string) => Promise<void>
  onOublier: (id: string) => Promise<void>
  onPerimer: (id: string, perime: boolean) => Promise<void>
}) {
  const [edition, setEdition] = useState(false)
  const [texte, setTexte] = useState(souvenir.contenu)
  const [confirmation, setConfirmation] = useState(false)
  const perime = souvenir.perime_at !== null

  async function enregistrer() {
    if (!texte.trim() || texte.trim() === souvenir.contenu) {
      setEdition(false)
      return
    }
    try {
      await onCorriger(souvenir.id, texte.trim())
      setEdition(false)
    } catch {
      // Signalé par un toast : on garde le champ ouvert avec la saisie.
    }
  }

  return (
    <div className={`flex flex-col gap-2 rounded-lg border p-3 ${perime ? "opacity-60" : ""}`}>
      {edition ? (
        <>
          <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} aria-label="Corriger" />
          <div className="flex gap-2">
            <Button size="sm" onClick={enregistrer}>
              <Check className="size-4" />
              Enregistrer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTexte(souvenir.contenu)
                setEdition(false)
              }}
            >
              Annuler
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={`text-sm ${perime ? "line-through" : ""}`}>{souvenir.contenu}</p>
          {souvenir.source && (
            <p className="text-xs text-muted-foreground">Dit : « {souvenir.source} »</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{CATEGORIE_LABEL[souvenir.categorie]}</Badge>
            {perime && <Badge variant="secondary">Périmé</Badge>}
            <span className="flex-1" />
            <Button variant="ghost" size="icon" aria-label="Corriger" onClick={() => setEdition(true)}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={perime ? "Rendre à nouveau valable" : "Marquer comme périmé"}
              onClick={() => onPerimer(souvenir.id, !perime).catch(alreadyNotified)}
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Oublier définitivement"
              onClick={() => setConfirmation(true)}
            >
              <Trash2 className="size-4" />
            </Button>
            {/* Un souvenir oublié ne revient pas, et la corbeille se touche
                par erreur en faisant défiler sur un téléphone. */}
            <ConfirmerSuppression
              ouvert={confirmation}
              titre="Oublier ce souvenir ?"
              detail={`« ${souvenir.contenu} » — Jarvis ne s'en servira plus. Pour le mettre de côté sans l'effacer, utilise plutôt « périmé ».`}
              libelleAction="Oublier"
              onFermer={() => setConfirmation(false)}
              onConfirmer={() => onOublier(souvenir.id)}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Le contrôle de Raphaël sur ce que Jarvis retient : il mémorise en silence,
 * cette page lui permet de relire, corriger et faire oublier. */
export function MemoirePage() {
  const { session } = useAuth()
  const { souvenirs, loading, error, refresh, corriger, oublier, perimer } = useSouvenirs(
    session?.user.id,
  )
  const echanges = useEchanges(session?.user.id)
  const sante = useSanteMemoire(session?.user.id)

  const vivants = souvenirs.filter((s) => !s.perime_at)

  return (
    <div className="flex flex-col gap-4">
      {/* En tête, parce qu'une mémoire morte rend tout le reste de la page
          trompeur : la liste aurait l'air normale, simplement figée. */}
      <SanteMemoire api={sante} />

      <p className="text-sm text-muted-foreground">
        Jarvis retient au fil de vos échanges, sans rien te demander. Voilà tout ce qu'il a gardé —
        corrige ce qui est faux, fais-lui oublier ce qui ne sert plus. Le mot-à-mot des
        conversations, lui, disparaît au bout de sept jours.
      </p>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : error ? (
        <LoadError message={error} onRetry={refresh} />
      ) : souvenirs.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Jarvis n'a encore rien retenu. Parle-lui, il commencera.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {vivants.length} souvenir{vivants.length > 1 ? "s" : ""} actif
            {vivants.length > 1 ? "s" : ""}
            {souvenirs.length > vivants.length && `, ${souvenirs.length - vivants.length} périmé(s)`}
          </p>
          {ORDRE.map((categorie) => {
            const groupe = souvenirs.filter((s) => s.categorie === categorie)
            if (groupe.length === 0) return null
            return (
              <Card key={categorie}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {CATEGORIE_LABEL[categorie]} ({groupe.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {groupe.map((souvenir) => (
                    <LigneSouvenir
                      key={souvenir.id}
                      souvenir={souvenir}
                      onCorriger={corriger}
                      onOublier={oublier}
                      onPerimer={perimer}
                    />
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </>
      )}

      {/* Les faits retenus ci-dessus, et le mot-à-mot ci-dessous : Jarvis se
          sert des deux, Raphaël doit pouvoir contrôler les deux. */}
      <ConversationsRecentes api={echanges} />
    </div>
  )
}
