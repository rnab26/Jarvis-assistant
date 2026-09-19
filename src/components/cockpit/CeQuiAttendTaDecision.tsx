import { Camera, ChevronDown, ChevronRight, HelpCircle, Mic, Send, Sparkles, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
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
import { ajouterSegmentDicte, constructeurDictee, messageErreurDictee } from "@/lib/dicteeChamp"
import { ago, courtAuteur, extraitAuMot } from "@/lib/journalBord"
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
 *
 * ET CHAQUE POINT EST REPLIÉ SUR SA QUESTION, mesuré sur ses vraies données :
 * un seul point déplié (la question, son pourquoi, trois options, le champ de
 * commentaire, la photo, le bouton) fait 616 points de haut sur un écran de
 * téléphone, et repoussait le tableau des chantiers à 1 382. Sa règle le dit
 * déjà — « une étape à la fois, ne montre pas un contrôle qui appartient à une
 * étape avant qu'elle soit atteinte » : lire ce qui l'attend vient avant
 * répondre à celui-là. La question, elle, reste lisible sans ouvrir : c'est
 * elle qui lui dit lequel ouvrir.
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
  /**
   * Mode simplifié (Paramètres › Le cockpit › Mode simplifié, ou le bouton en
   * tête du cockpit) : une question à la fois, dépliée d'emblée, avec un
   * bouton pour passer à la suivante. Plainte de Raphaël, 17 sept. 2026 :
   * « faut que ce soit plus clair, plus simple, plus synthétisé, questions,
   * réponses et on next ». Même carte, même `Point`, même `onRepondre` — pas
   * un second écran qui finirait par diverger.
   */
  uneALaFois?: boolean
  /** Lien direct depuis une notification ou un message (`?entree=<id>`,
   * chantier 332d87fd) : l'id d'une entrée `dev_log` SANS chantier — sinon
   * elle s'ouvre directement sur son chantier (`?chantier=<id>`), sa carte
   * montre déjà la question. En mode « une à la fois », elle devient celle
   * qu'on montre ; en liste, elle se déplie et se met en évidence. */
  entreeCible?: string | null
}

export function CeQuiAttendTaDecision({
  messages,
  devItems,
  onRepondre,
  onEtat,
  uneALaFois = false,
  entreeCible = null,
}: CeQuiAttendTaDecisionProps) {
  const enAttente = useMemo(() => questionsEnAttente(messages), [messages])
  const titreParItem = useMemo(
    () => new Map(devItems.map((i) => [i.id, i.title])),
    [devItems],
  )
  // Répondre à la question courante la fait sortir d'`enAttente` : l'indice
  // reste valide en le ramenant dans les bornes plutôt qu'en pointant dans le
  // vide — c'est ce qui fait avancer tout seul vers la suivante une fois
  // répondu, sans bouton à appuyer en plus.
  const [indice, setIndice] = useState(0)

  // Mode « une à la fois » : un lien direct doit montrer LA question visée,
  // pas celle où l'index en était resté.
  useEffect(() => {
    if (!entreeCible || !uneALaFois) return
    const i = enAttente.findIndex((q) => q.id === entreeCible)
    if (i >= 0) setIndice(i)
  }, [entreeCible, uneALaFois, enAttente])

  const titre = (
    <>
      <HelpCircle className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
      Ce qui attend ta décision
    </>
  )

  if (enAttente.length === 0) {
    // En mode simplifié, cette carte est TOUT ce qu'il voit : un retour
    // silencieux (comme en mode normal) laisserait un écran vide, sans dire
    // qu'il n'y a justement plus rien à faire.
    if (!uneALaFois) return null
    return (
      <CarteRepliable ouverteParDefaut titre={titre}>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Rien n'attend ta décision pour l'instant.
          </p>
        </CardContent>
      </CarteRepliable>
    )
  }

  const actions = enAttente.filter((e) => e.kind === "action").length
  const badge = (
    <Badge variant="destructive" className="shrink-0">
      {enAttente.length}
      {actions > 0 ? ` dont ${actions} à faire` : ""}
    </Badge>
  )

  if (uneALaFois) {
    const i = Math.min(indice, enAttente.length - 1)
    const question = enAttente[i]
    return (
      <CarteRepliable ouverteParDefaut titre={titre} badge={badge}>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Question {i + 1} sur {enAttente.length}
            </span>
            {enAttente.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIndice((n) => (n + 1) % enAttente.length)}
              >
                Suivante
                <ChevronRight className="size-3.5" />
              </Button>
            )}
          </div>
          <Point
            key={question.id}
            question={question}
            chantier={question.item_id ? titreParItem.get(question.item_id) : undefined}
            onRepondre={onRepondre}
            onEtat={onEtat}
            forceOuvert
            misEnEvidence={question.id === entreeCible}
          />
        </CardContent>
      </CarteRepliable>
    )
  }

  return (
    <CarteRepliable ouverteParDefaut titre={titre} badge={badge}>
      <CardContent className="flex flex-col gap-3">
        {enAttente.map((question) => (
          <Point
            key={question.id}
            question={question}
            chantier={question.item_id ? titreParItem.get(question.item_id) : undefined}
            onRepondre={onRepondre}
            onEtat={onEtat}
            misEnEvidence={question.id === entreeCible}
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
  forceOuvert = false,
  misEnEvidence = false,
}: {
  question: DevLogEntry
  chantier: string | undefined
  onRepondre: CeQuiAttendTaDecisionProps["onRepondre"]
  onEtat: CeQuiAttendTaDecisionProps["onEtat"]
  /** Mode « une question à la fois » : la seule montrée, pas la peine de la
   * déplier au clic — elle l'est déjà. */
  forceOuvert?: boolean
  /** Lien direct (`?entree=<id>`, chantier 332d87fd) : cette question précise
   * se déplie, défile jusqu'à elle et se met en évidence. */
  misEnEvidence?: boolean
}) {
  const options = useMemo(() => optionsDe(question), [question])
  const [ouvertState, setOuvert] = useState(() => misEnEvidence)
  const ouvert = forceOuvert || ouvertState
  const [choisie, setChoisie] = useState<OptionDecision | null>(null)
  const [commentaire, setCommentaire] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const champFichier = useRef<HTMLInputElement>(null)
  const [enEvidence, setEnEvidence] = useState(false)
  const conteneurRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!misEnEvidence) return
    setOuvert(true)
    setEnEvidence(true)
    conteneurRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    const minuteur = setTimeout(() => setEnEvidence(false), 2500)
    return () => clearTimeout(minuteur)
  }, [misEnEvidence])

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

  const enTete = (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        {!forceOuvert &&
          (ouvert ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          ))}
        <Badge variant={estAction ? "destructive" : "default"} className="shrink-0">
          {estAction ? "À faire par toi" : "Tu décides"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {courtAuteur(question.author)} · {ago(question.created_at)}
        </span>
        {estAction && question.etat && (
          <Badge variant="outline" className="shrink-0">
            {ETATS_ACTION.find((e) => e.valeur === question.etat)?.libelle}
          </Badge>
        )}
        {chantier && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">— {chantier}</span>
        )}
      </span>
      {/* La question reste lisible sans ouvrir : c'est elle qui lui dit
          lequel ouvrir. COUPÉE, en revanche — mesuré le 17 sept. 2026 : ses
          cinq points en attente faisaient 697, 561, 146, 110 et 86
          caractères, et la carte montait à 924 points de haut pour QUATRE
          points repliés, poussant « Où j'en suis » hors du premier écran.
          Replier ne suffit pas si la ligne repliée porte 697 caractères. Le
          texte entier est deux lignes plus bas, une fois ouvert : c'est là
          qu'il en a besoin, pour répondre. */}
      <span className="text-sm">{ouvert ? question.body : extraitAuMot(question.body)}</span>
    </>
  )

  return (
    <div
      ref={conteneurRef}
      className={`flex flex-col gap-2 rounded-lg border p-2.5 ${
        enEvidence ? "ring-2 ring-primary" : ""
      }`}
    >
      {/* En mode « une question à la fois », elle est déjà ouverte et seule à
          l'écran : un bouton qui a l'air de replier quelque chose sans rien
          faire serait exactement le défaut corrigé ailleurs dans ce cockpit
          (Raphaël, 17 sept. 2026 — des lignes qui ont l'air cliquables et ne
          mènent nulle part). */}
      {forceOuvert ? (
        <div className="flex flex-col gap-1 text-left">{enTete}</div>
      ) : (
        <button
          type="button"
          aria-expanded={ouvert}
          aria-label={`Répondre : ${question.body.slice(0, 60)}`}
          onClick={() => setOuvert(!ouvert)}
          className="flex flex-col gap-1 text-left"
        >
          {enTete}
        </button>
      )}

      {ouvert && (
      <>
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
          répond. Le micro y dicte directement : le plus simple pour répondre
          depuis un téléphone, sans manœuvre — sa demande du 17 sept. 2026. */}
      <div className="relative">
        <Textarea
          rows={2}
          value={commentaire}
          placeholder={estAction ? "Ce qui coince, ou rien du tout." : "Ton commentaire (facultatif)"}
          aria-label={`Ton commentaire sur : ${question.body.slice(0, 60)}`}
          onChange={(e) => setCommentaire(e.target.value)}
          className="pr-9"
        />
        <BoutonDictee
          cible={question.body}
          onResultat={(segment) => setCommentaire((actuel) => ajouterSegmentDicte(actuel, segment))}
        />
      </div>

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
      </>
      )}
    </div>
  )
}

/**
 * Le micro du champ de commentaire. Un appui, une écoute, un résultat ajouté
 * au texte — l'API navigateur directement, en one-shot : pas le moteur
 * d'écoute de Jarvis (veille, mot-clé, session Capacitor), démesuré pour
 * dicter dans un champ.
 */
function BoutonDictee({
  cible,
  onResultat,
}: {
  cible: string
  onResultat: (segment: string) => void
}) {
  const [enEcoute, setEnEcoute] = useState(false)
  const recoRef = useRef<SpeechRecognition | null>(null)

  // Coupe le micro si la question disparaît (répondue, ou la carte se
  // referme) pendant qu'on dicte encore.
  useEffect(() => {
    return () => {
      recoRef.current?.abort()
      recoRef.current = null
    }
  }, [])

  function demarrer() {
    const Ctor = constructeurDictee()
    if (!Ctor) {
      toast.error("La dictée n'est pas disponible sur ce navigateur.", {
        description: "Écris ton commentaire directement dans le champ.",
      })
      return
    }
    const reco = new Ctor()
    reco.lang = "fr-FR"
    reco.continuous = false
    reco.interimResults = false
    reco.maxAlternatives = 1

    reco.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) onResultat(transcript)
    }
    reco.onerror = (event) => {
      const message = messageErreurDictee(event.error)
      if (message) toast.error(message)
    }
    reco.onend = () => {
      setEnEcoute(false)
      recoRef.current = null
    }

    try {
      reco.start()
      recoRef.current = reco
      setEnEcoute(true)
    } catch {
      toast.error("Impossible de démarrer le micro, réessaie.")
    }
  }

  function arreter() {
    recoRef.current?.stop()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="absolute right-1 top-1"
      aria-pressed={enEcoute}
      aria-label={
        enEcoute
          ? "En écoute… appuie pour arrêter"
          : `Dicter ton commentaire sur : ${cible.slice(0, 60)}`
      }
      onClick={enEcoute ? arreter : demarrer}
    >
      <Mic className={`size-4 ${enEcoute ? "animate-pulse text-destructive" : "text-muted-foreground"}`} />
    </Button>
  )
}
