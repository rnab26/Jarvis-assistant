import { Camera, HelpCircle, Send, Sparkles, X } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { CarteRepliable } from "@/components/cockpit/CarteRepliable"
import {
  ETATS_ACTION,
  corpsReponse,
  optionsDe,
  questionsEnAttente,
  reponsePrete,
} from "@/lib/decisions"
import { ago, courtAuteur } from "@/lib/journalBord"
import { alreadyNotified } from "@/lib/notifyError"
import type { DevItem, DevLogEntry, EtatAction, OptionDecision } from "@/types/database"

/**
 * « Ce qui attend ta décision » — la fin des fiches publiées hors du dépôt.
 *
 * SA DEMANDE, 5 sept. 2026 au soir : « J'ai répondu à ton artefact mais j'ai
 * l'impression qu'il n'enregistre pas mes réponses, du coup j'ai pris des
 * captures d'écran pour te renvoyer mes réponses et éviter de répondre une
 * fois de plus. D'ailleurs règle ce problème, les artefacts ont trop de durée
 * de vie limitée. »
 *
 * Une fiche vit hors du dépôt et hors de la base : la session suivante ne sait
 * même pas qu'elle existe si personne n'a collé son URL dans le CLAUDE.md.
 * Deux fiches lui ont posé LA MÊME question le même soir, et il a répondu deux
 * choses différentes. Ici, la question est une ligne de `dev_log` que le hook
 * de démarrage injecte dans CHAQUE session, et sa réponse en est une autre.
 *
 * CE QUI EST REPRIS DES FICHES, parce qu'il l'a demandé trois fois :
 *   — un champ de commentaire PAR question, jamais un seul en bas de page —
 *     « je n'ai que des choix de propositions, aucun commentaire ni fichier à
 *     t'envoyer pour affiner mes réponses » ;
 *   — la recommandation de la session marquée sur l'option ;
 *   — le POURQUOI de la question, sans quoi il ne peut pas juger ;
 *   — une photo par question, pour la capture d'écran qu'il envoyait faute de
 *     mieux ;
 *   — et la séparation entre DÉCIDER et FAIRE : pour une action, il ne choisit
 *     pas, il dit où il en est (fait / pas encore / ça bloque).
 *
 * CE QUI N'EST PAS REPRIS : le compteur « 0 / 14 » qui restait à zéro pendant
 * qu'il répondait. Chaque réponse part immédiatement en base et la question
 * disparaît de la liste — il n'y a pas de bouton final, donc rien à perdre.
 */
interface CeQuiAttendTaDecisionProps {
  messages: DevLogEntry[]
  devItems: DevItem[]
  onRepondre: (
    question: DevLogEntry,
    option: OptionDecision | null,
    commentaire: string,
    photo: File | null,
  ) => Promise<void>
  onEtat: (id: string, etat: EtatAction) => Promise<void>
}

export function CeQuiAttendTaDecision({
  messages,
  devItems,
  onRepondre,
  onEtat,
}: CeQuiAttendTaDecisionProps) {
  const enAttente = useMemo(() => questionsEnAttente(messages), [messages])
  const titreParItem = useMemo(
    () => new Map(devItems.map((i) => [i.id, i.title])),
    [devItems],
  )

  // Rien en attente : la carte n'existe pas. Un titre suivi de « rien à
  // décider » occupe une place en haut du cockpit pour ne rien dire.
  if (enAttente.length === 0) return null

  const actions = enAttente.filter((e) => e.kind === "action").length

  return (
    <CarteRepliable
      ouverteParDefaut
      titre={
        <>
          <HelpCircle className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
          Ce qui attend ta décision
        </>
      }
      badge={
        <Badge variant="destructive" className="shrink-0">
          {enAttente.length}
          {actions > 0 ? ` dont ${actions} à faire` : ""}
        </Badge>
      }
    >
      <CardContent className="flex flex-col gap-3">
        {enAttente.map((question) => (
          <Point
            key={question.id}
            question={question}
            chantier={question.item_id ? titreParItem.get(question.item_id) : undefined}
            onRepondre={onRepondre}
            onEtat={onEtat}
          />
        ))}
      </CardContent>
    </CarteRepliable>
  )
}

function Point({
  question,
  chantier,
  onRepondre,
  onEtat,
}: {
  question: DevLogEntry
  chantier: string | undefined
  onRepondre: CeQuiAttendTaDecisionProps["onRepondre"]
  onEtat: CeQuiAttendTaDecisionProps["onEtat"]
}) {
  const options = useMemo(() => optionsDe(question), [question])
  const [choisie, setChoisie] = useState<OptionDecision | null>(null)
  const [commentaire, setCommentaire] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const champFichier = useRef<HTMLInputElement>(null)

  const estAction = question.kind === "action"
  const prete = reponsePrete(choisie, commentaire) || (estAction && !!question.etat)

  async function envoyer() {
    if (!prete) return
    setEnvoi(true)
    try {
      await onRepondre(question, choisie, commentaire, photo)
      // Pas de remise à zéro : la question sort de la liste, le composant
      // disparaît avec elle. Réinitialiser ici ferait clignoter le champ.
    } catch {
      // Déjà signalé par un toast : on garde ce qu'il a écrit plutôt que de
      // le perdre. C'est exactement ce que la fiche faisait perdre.
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={estAction ? "destructive" : "default"} className="shrink-0">
          {estAction ? "À faire par toi" : "Tu décides"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {courtAuteur(question.author)} · {ago(question.created_at)}
        </span>
        {chantier && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">— {chantier}</span>
        )}
      </div>

      <p className="text-sm">{question.body}</p>

      {/* Sans le pourquoi, il choisit au hasard ou ne répond pas. */}
      {question.pourquoi && (
        <p className="text-xs text-muted-foreground">Pourquoi : {question.pourquoi}</p>
      )}

      {estAction ? (
        <>
          <div className="flex gap-1.5">
            {ETATS_ACTION.map(({ valeur, libelle }) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={question.etat === valeur}
                aria-label={`${libelle} — ${question.body.slice(0, 60)}`}
                onClick={() => onEtat(question.id, valeur).catch(alreadyNotified)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                  question.etat === valeur
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
          {question.etat === "bloque" && (
            <p className="text-xs text-destructive">
              Dis en deux mots où ça coince, et joins une capture : c'est ce qui manquait aux
              fiches.
            </p>
          )}
        </>
      ) : (
        options.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              {options.map((option) => (
                <button
                  key={option.cle}
                  type="button"
                  aria-pressed={choisie?.cle === option.cle}
                  onClick={() => setChoisie(choisie?.cle === option.cle ? null : option)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                    choisie?.cle === option.cle
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {option.recommande && <Sparkles className="size-3" />}
                  {option.libelle}
                </button>
              ))}
            </div>
            {/* Ce que le choix implique : l'option retenue si elle en dit
                quelque chose, sinon celle qu'on recommande. Une option qu'on
                ne peut pas juger est acceptée sans être relue. */}
            {(choisie ?? options.find((o) => o.recommande))?.aide && (
              <p className="text-xs text-muted-foreground">
                {choisie ? "" : "Ce qu'on te recommande — "}
                {(choisie ?? options.find((o) => o.recommande))!.libelle} :{" "}
                {(choisie ?? options.find((o) => o.recommande))!.aide}
              </p>
            )}
          </div>
        )
      )}

      {/* UN champ par question, sans exception. Il l'a demandé trois fois :
          c'est dans ses commentaires que se trouve ce qui change réellement le
          travail, et un champ unique en bas de page ne dit plus à quoi il
          répond. */}
      <Textarea
        rows={2}
        value={commentaire}
        placeholder={estAction ? "Ce qui coince, ou rien du tout." : "Ton commentaire (facultatif)"}
        aria-label={`Ton commentaire sur : ${question.body.slice(0, 60)}`}
        onChange={(e) => setCommentaire(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={champFichier}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={`Joindre une photo à : ${question.body.slice(0, 60)}`}
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        <Button variant="outline" size="sm" onClick={() => champFichier.current?.click()}>
          <Camera className="size-3.5" />
          {photo ? "Changer la photo" : "Joindre une photo"}
        </Button>
        {photo && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{photo.name}</span>
            <button
              type="button"
              aria-label="Retirer la photo"
              onClick={() => {
                setPhoto(null)
                if (champFichier.current) champFichier.current.value = ""
              }}
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        <Button
          size="sm"
          className="ml-auto"
          disabled={!prete || envoi}
          aria-label={`Répondre à : ${question.body.slice(0, 60)}`}
          onClick={envoyer}
        >
          <Send className="size-3.5" />
          {envoi ? "Envoi…" : "Répondre"}
        </Button>
      </div>

      {/* Ce qui partira, mot pour mot : la fiche du 5 sept. n'enregistrait que
          les champs de texte, et rien ne le disait. Ici il voit sa réponse
          avant de l'envoyer. */}
      {prete && !estAction && (
        <p className="text-xs text-muted-foreground">
          Ta réponse : « {corpsReponse(choisie, commentaire)} »
        </p>
      )}
    </div>
  )
}
