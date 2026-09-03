import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { JarvisCore } from "@/components/JarvisCore"
import { themesDe } from "@/components/cockpit/CockpitBoard"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis"
import { messageErreurServeurVocal } from "@/lib/erreurServeurVocal"
import { supabase } from "@/lib/supabase"
import { AgendaError, agendaApi } from "@/lib/googleCalendar"
import { chercherMotCle } from "@/lib/motCle"
import { interpreterLocalement } from "@/lib/commandeLocale"
import { withTimeout } from "@/lib/withTimeout"
import type { DevItem } from "@/types/database"
import {
  executeVoiceAction,
  type ContactsApi,
  type DevItemsApi,
  type DocumentsApi,
  type PlaceRemindersApi,
  type PronunciationsApi,
  type TasksApi,
  type VoiceSettingApi,
  type VoiceAction,
  type WidgetApi,
} from "@/lib/voiceActions"

type Status = "idle" | "wake-listening" | "listening" | "processing" | "speaking" | "error"

/** Temps laissé à la Edge Function pour répondre avant de le dire. */
const REPONSE_MAX_MS = 25000

interface MicButtonProps {
  tasksApi: TasksApi
  devItemsApi: DevItemsApi
  documentsApi: DocumentsApi
  contactsApi: ContactsApi
  placeRemindersApi: PlaceRemindersApi
  pronunciationsApi: PronunciationsApi
  voiceSettingApi: VoiceSettingApi
  widgetApi: WidgetApi
  wakeWordEnabled: boolean
  voiceIndex: number | null
  /** Durée pendant laquelle le micro reste ouvert après une réponse de
   * Jarvis, pour enchaîner sans retoucher le bouton. 0 = désactivé. */
  suiteMs: number
}

/** Début d'une note : de quoi reconnaître l'élément dont parle Raphaël sans
 * envoyer des paragraphes entiers à chaque commande. */
function extrait(notes: string | null) {
  if (!notes) return null
  const propre = notes.replace(/\s+/g, " ").trim()
  return propre.length > 180 ? `${propre.slice(0, 180)}…` : propre
}

/** Nombre de chantiers archivés encore envoyés au modèle. Assez pour que
 * « rouvre celui que j'ai terminé hier » marche, pas assez pour que la
 * facture grossisse à chaque chantier fini. */
const ARCHIVES_ENVOYEES = 15

/**
 * Ce que le modèle a besoin de savoir du cockpit — et rien de plus.
 *
 * Mesuré le 3 sept. 2026 : les 83 chantiers étaient renvoyés en entier à
 * CHAQUE phrase dictée, soit 32 799 caractères, dont 21 000 pour 55 chantiers
 * déjà archivés. C'était la moitié du coût d'une commande, et ça grossissait
 * de façon irréversible à chaque chantier livré.
 *
 * Les archivés restent nécessaires — Raphaël rouvre parfois quelque chose de
 * terminé — mais seulement les plus récents, et leur titre suffit à les
 * désigner : personne ne rouvre un chantier en citant une ligne de ses notes.
 */
function chantiersPourLeModele(items: DevItem[]) {
  const enCours = items.filter((i) => !i.archived_at)
  const archives = items
    .filter((i) => i.archived_at)
    .sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""))
    .slice(0, ARCHIVES_ENVOYEES)

  return [
    ...enCours.map((i) => ({
      id: i.id,
      title: i.title,
      notes: extrait(i.notes),
      status: i.status,
      priority: i.priority,
      theme: i.theme,
    })),
    ...archives.map((i) => ({
      id: i.id,
      title: i.title,
      status: "done",
      theme: i.theme,
      archive: true,
    })),
  ]
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function MicButton({
  tasksApi,
  devItemsApi,
  documentsApi,
  contactsApi,
  placeRemindersApi,
  pronunciationsApi,
  voiceSettingApi,
  widgetApi,
  wakeWordEnabled,
  voiceIndex,
  suiteMs,
}: MicButtonProps) {
  const { listen, stop: stopListening, isSupported, ready: micReady } = useSpeechRecognition()
  const { speak, stop: stopSpeaking } = useSpeechSynthesis()
  const [status, setStatus] = useState<Status>("idle")
  const [lastUserText, setLastUserText] = useState<string | null>(null)
  const [lastReply, setLastReply] = useState<string | null>(null)
  // Un tap pendant que Jarvis parle (barge-in) relance l'écoute lui-même ;
  // ce flag évite que le await speak(...) interrompu, une fois débloqué,
  // ne relance À SON TOUR une écoute en double (deux listen() concurrents).
  const bargeInRef = useRef(false)
  const statusRef = useRef<Status>("idle")
  statusRef.current = status

  /**
   * Envoie un transcript à la Edge Function et renvoie les actions à exécuter.
   * Une phrase peut en contenir plusieurs ("ajoute une tâche et marque
   * l'autre comme faite") : elles reviennent dans l'ordre dicté.
   */
  async function resolveTranscript(transcript: string): Promise<VoiceAction[]> {
    // D'ABORD SUR L'APPAREIL, ET SANS RIEN DEMANDER À PERSONNE.
    //
    // « Ce n'est pas vraiment de l'IA, c'est plus un assistant qui va faire
    // des commandes » — Raphaël, 3 sept. 2026, et il a raison : « ajoute une
    // tâche pour le plombier » n'a besoin d'aucun modèle de langage. Les
    // formulations qu'il emploie sont en nombre fini, src/lib/commandeLocale
    // les reconnaît sur place. C'est gratuit, instantané, ça marche hors
    // ligne, et ça ne s'arrête pas quand un crédit s'épuise.
    //
    // Ce que les règles ne reconnaissent pas continue vers le serveur : le
    // module rend la main plutôt que de deviner.
    const local = interpreterLocalement(transcript, {
      taches: tasksApi.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes,
        status: t.status,
      })),
      chantiers: devItemsApi.devItems.map((i) => ({
        id: i.id,
        title: i.title,
        notes: i.notes,
      })),
      contacts: contactsApi.contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
    })
    if (local) return local

    // Borné dans le temps, comme tout le reste des appels du projet :
    // supabase-js ne rejette JAMAIS sur coupure réseau, il retente et laisse
    // la promesse en attente. Sans cette borne, une commande partie de
    // travers laissait Jarvis figé sans un mot. Plus long que le défaut de
    // 8 s : la Edge Function interroge le modèle, quelques secondes sont
    // normales.
    const { data, error } = await withTimeout(
      supabase.functions.invoke<{
        action: VoiceAction
        actions?: VoiceAction[]
      }>("voice-command", {
        body: {
          transcript,
          categories: tasksApi.categories.map((c) => ({ id: c.id, name: c.name })),
          tasks: tasksApi.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            notes: extrait(t.notes),
            category_id: t.category_id,
            status: t.status,
            due_date: t.due_date,
            due_time: t.due_time,
          })),
          devItems: chantiersPourLeModele(devItemsApi.devItems),
          themes: themesDe(devItemsApi.devItems),
          documents: documentsApi.documents.map((d) => ({ name: d.name })),
          contacts: contactsApi.contacts.map((c) => ({ id: c.id, name: c.name, notes: c.notes, phone: c.phone })),
          placeReminders: placeRemindersApi.placeReminders.map((p) => ({
            id: p.id,
            place: p.place,
            reminder: p.reminder,
          })),
          pronunciations: pronunciationsApi.pronunciations.map((p) => ({
            id: p.id,
            entendu: p.entendu,
            veut_dire: p.veut_dire,
          })),
          widgetConfig: widgetApi.config,
          todayISO: new Date().toISOString().slice(0, 10),
        },
      }),
      REPONSE_MAX_MS,
    )

    if (error || !data) {
      // Pas error.message : supabase-js y met toujours la même phrase
      // ("Edge Function returned a non-2xx status code"), quelle que soit la
      // cause réelle, qui est dans le corps de la réponse.
      throw new Error(
        error ? await messageErreurServeurVocal(error) : "Réponse vide du serveur vocal.",
      )
    }
    return data.actions?.length ? data.actions : [data.action]
  }

  /**
   * Traite une commande vocale ; si l'action est "clarify", parle la
   * question puis réécoute automatiquement la réponse (en donnant à Claude
   * le contexte de la demande initiale) plutôt que de forcer l'utilisateur
   * à réappuyer sur le micro et tout redire.
   *
   * Renvoie true s'il faut rouvrir le micro pour la réplique suivante.
   */
  async function runTurn(
    transcript: string,
    originalTranscript = transcript,
    round = 0,
  ): Promise<boolean> {
    setStatus("processing")
    const actions = await resolveTranscript(transcript)

    // Quand quelque chose est ambigu, la Edge Function renvoie une seule
    // action clarify : on pose la question plutôt que d'exécuter à moitié.
    const premiere = actions[0]
    if (premiere.action === "clarify" && round < 3) {
      const action = premiere
      setLastReply(action.message)
      setStatus("speaking")
      bargeInRef.current = false
      await speak(action.message, voiceIndex ?? undefined)
      if (bargeInRef.current) return false // un tap a déjà repris la main entre-temps

      setStatus("listening")
      const answer = await listen("command", { onTexte: setLastUserText })
      setLastUserText(answer)
      const combined = `Demande initiale : "${originalTranscript}". Question posée : "${action.message}". Réponse de l'utilisateur : "${answer}".`
      return await runTurn(combined, originalTranscript, round + 1)
    }

    // Plusieurs demandes dans une phrase : on les exécute dans l'ordre dicté
    // et on n'annonce qu'une fois le tout, plutôt que de n'en traiter qu'une
    // en laissant croire que le reste a été fait.
    const reponses: string[] = []
    for (const action of actions) {
      try {
        reponses.push(
          await executeVoiceAction(
            action,
            tasksApi,
            devItemsApi,
            documentsApi,
            contactsApi,
            placeRemindersApi,
            pronunciationsApi,
            voiceSettingApi,
            widgetApi,
            agendaApi,
          ),
        )
      } catch (e) {
        // L'agenda est le seul domaine qui dépend d'un service extérieur :
        // compte Google pas encore branché, accès retiré, Google qui refuse.
        // Ces messages-là sont écrits pour être dits — les avaler ferait
        // croire que Jarvis n'a pas entendu la demande.
        if (e instanceof AgendaError) reponses.push(e.message)
        else throw e
      }
    }
    let reply = reponses.join(" ")

    // Rappels de lieu : déclenchés par la conversation elle-même (pas par le
    // GPS, pour ne pas consommer de batterie) — si l'utilisateur mentionne un
    // lieu enregistré dans sa phrase, quel que soit le domaine de l'action,
    // on glisse le rappel dans la réponse parlée.
    const normalizedTranscript = normalizeText(originalTranscript)
    const triggered = placeRemindersApi.placeReminders.filter((p) =>
      normalizedTranscript.includes(normalizeText(p.place)),
    )
    if (triggered.length > 0) {
      reply += ` Au fait, ${triggered.map((p) => p.reminder).join(" ")}`
    }

    setLastReply(reply)
    setStatus("speaking")
    bargeInRef.current = false
    await speak(reply, voiceIndex ?? undefined)
    if (bargeInRef.current) return false
    if (suiteMs > 0) return true
    setStatus("idle")
    return false
  }

  /**
   * Mène la discussion : la demande, la réponse de Jarvis, puis les
   * répliques suivantes tant que Raphaël enchaîne — sans avoir à retoucher
   * le micro entre deux phrases. Un silence après une réponse termine
   * simplement la conversation : ce n'est pas une erreur.
   */
  async function conduireConversation(premier: string) {
    let transcript = premier
    for (;;) {
      setLastUserText(transcript)
      const enchainer = await runTurn(transcript)
      if (!enchainer) return

      setStatus("listening")
      try {
        transcript = await listen("command", {
          premierMotMs: suiteMs,
          onTexte: setLastUserText,
        })
      } catch (err) {
        // Un silence après une réponse, c'est une conversation qui se termine :
        // on rend la main sans rien afficher. Une vraie panne (micro refusé,
        // moteur muet), en revanche, doit se voir — un retour silencieux à
        // l'état de repos laisserait croire que Jarvis a compris.
        const message = err instanceof Error ? err.message : ""
        if (message.startsWith("Je n'ai rien entendu")) {
          setStatus("idle")
        } else {
          setLastReply(message || "Le micro s'est arrêté.")
          setStatus("error")
        }
        return
      }
    }
  }

  async function startListening() {
    try {
      setStatus("listening")
      const transcript = await listen("command", { onTexte: setLastUserText })
      await conduireConversation(transcript)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue."
      setLastReply(message)
      setStatus("error")
    }
  }

  async function handleClick() {
    // Interruption ("barge-in") : si Jarvis est en train de parler, un tap
    // coupe la voix et relance directement l'écoute, sans devoir attendre
    // la fin de la phrase.
    if (status === "speaking") {
      bargeInRef.current = true
      stopSpeaking()
      await startListening()
      return
    }

    // Un tap pendant l'écoute vaut « j'ai fini » : on clôt le tour avec ce
    // qui a déjà été dit, sans attendre le délai de silence.
    if (status === "listening") {
      stopListening()
      return
    }

    // Un tap pendant l'écoute passive du mot-clé interrompt cette écoute et
    // enchaîne directement sur une écoute de commande normale.
    if (status === "wake-listening") {
      stopListening()
      await startListening()
      return
    }

    if (status !== "idle" && status !== "error") return
    await startListening()
  }

  /**
   * Écoute passive du mot-clé "Jarvis" tant que l'app est ouverte (pas de
   * service en arrière-plan — désactivé par défaut, à activer dans
   * Paramètres). Écoute par courtes rafales en mode "wake" (coupe sur un
   * silence court, contrairement à l'écoute de commande qui tolère de
   * longues pauses) pour ne pas laisser le micro "en attente" plusieurs
   * secondes après que l'utilisateur a dit "Jarvis". Redémarre en boucle
   * quand l'app est inactive (status "idle"), s'arrête dès qu'une
   * interaction (manuelle ou déclenchée par le mot-clé) est en cours.
   */
  useEffect(() => {
    if (!wakeWordEnabled) return
    let cancelled = false

    async function wakeLoop() {
      while (!cancelled) {
        // "error" compte comme un état de repos, et c'est capital : sans ça,
        // la moindre erreur tuait le réveil vocal pour de bon. Le cas le plus
        // fréquent n'a rien d'exceptionnel — Raphaël dit « Jarvis », Jarvis
        // répond « Oui ? », il n'enchaîne pas tout de suite : l'écoute rend
        // « Je n'ai rien entendu », le statut passe en "error" et n'en
        // revient jamais tout seul. La boucle attendait alors un "idle" qui
        // n'arrivait plus, et il fallait toucher le cœur pour repartir —
        // exactement ce qu'il décrivait.
        if (statusRef.current !== "idle" && statusRef.current !== "error") {
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
        setStatus("wake-listening")
        try {
          // arreterSi coupe la rafale dès que « Jarvis » est reconnu dans un
          // résultat partiel : plus besoin d'attendre la fin de la phrase.
          const transcript = await listen("wake", {
            arreterSi: (texte) => chercherMotCle(texte).trouve,
          })
          if (cancelled) return

          const { trouve, reste } = chercherMotCle(transcript)
          if (trouve) {
            if (reste.length > 3) {
              // « Jarvis, ajoute une tâche » : la demande est déjà là.
              setStatus("idle")
              await conduireConversation(reste)
            } else {
              // « Jarvis » seul : confirmation orale courte avant d'écouter
              // la demande, pour que l'utilisateur sache qu'il peut parler
              // sans avoir à toucher le bouton.
              setStatus("speaking")
              bargeInRef.current = false
              await speak("Oui ?", voiceIndex ?? undefined)
              if (bargeInRef.current || cancelled) return
              await startListening()
            }
          } else {
            setStatus("idle")
          }
        } catch {
          // Silence, erreur de reconnaissance, etc. : on relance simplement.
          if (!cancelled) setStatus("idle")
        }
        // Souffle minimum entre deux rafales : Android refuse un redémarrage
        // immédiat du service. 150 ms au lieu de 500 — c'est autant de temps
        // en moins pendant lequel le micro n'entend rien.
        if (!cancelled) await new Promise((r) => setTimeout(r, 150))
      }
    }

    wakeLoop()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeWordEnabled])

  // Ouverture avec ?mic=1 (ex: depuis un widget ou le bouton latéral
  // réassigné, Phase 3) : lance directement l'écoute sans avoir à taper
  // sur le bouton.
  const [searchParams, setSearchParams] = useSearchParams()
  const autoStarted = useRef(false)
  useEffect(() => {
    if (searchParams.get("mic") === "1" && !autoStarted.current) {
      autoStarted.current = true
      setSearchParams({}, { replace: true })
      handleClick()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (!isSupported) {
    return (
      <p className="text-sm text-muted-foreground">
        Le micro n'est pas supporté par ce navigateur (utilise Chrome sur Android).
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Le cœur EST le bouton : c'est lui qui réagit à ce qui se passe, plutôt
          qu'une icône qui changerait de dessin. */}
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "processing"}
        aria-label={
          status === "speaking"
            ? "Interrompre Jarvis"
            : status === "listening"
              ? "J'ai fini de parler"
              : "Commande vocale"
        }
        className="rounded-full transition-transform active:scale-95 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <JarvisCore etat={status} taille={76} />
      </button>
      {status === "listening" && (
        <p className="text-sm text-muted-foreground">
          {micReady ? "Je t'écoute — touche le cœur quand tu as fini." : "Préparation du micro..."}
        </p>
      )}
      {/* Tant que le mot-clé est activé, on le dit — même entre deux rafales
          d'écoute. Raphaël signalait le 3 sept. qu'il ne savait jamais ce qui
          était réellement actif : un indicateur qui n'apparaît qu'une fraction
          du temps revient à ne rien indiquer. */}
      {wakeWordEnabled && (status === "wake-listening" || status === "idle") && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Dis « Jarvis » quand tu veux
        </p>
      )}
      {(lastUserText || lastReply) && (
        <div className="max-w-xs text-center text-sm">
          {lastUserText && <p className="text-muted-foreground">Toi : {lastUserText}</p>}
          {lastReply && <p>Jarvis : {lastReply}</p>}
        </div>
      )}
    </div>
  )
}
