import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { JarvisCore } from "@/components/JarvisCore"
import { themesDe } from "@/components/cockpit/CockpitBoard"
import { MOTEUR_OCCUPE, useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis"
import { messageErreurServeurVocal } from "@/lib/erreurServeurVocal"
import { supabase } from "@/lib/supabase"
import { AgendaError, agendaApi } from "@/lib/googleCalendar"
import {
  apresRafale,
  delaiAvantRafaleSuivante,
  peutEcouterEnVeille,
  sansAccuse,
  texteAAfficherEnVeille,
} from "@/lib/veille"
import { chercherMotCle } from "@/lib/motCle"
import { interpreterLocalement } from "@/lib/commandeLocale"
import { withTimeout } from "@/lib/withTimeout"
import { noterEcoute } from "@/lib/journalEcoute"
import { demarrerSessionLive, type SessionLive } from "@/lib/live/sessionLive"
import { ecrireModeLive, lireModeLive } from "@/lib/livePrefs"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
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
  // Numéro de prise du micro : incrémenté à chaque fois qu'une interaction
  // (appui, mot-clé reconnu) prend la main. La veille compare avant/après sa
  // rafale : s'il a changé, elle ne touche plus à rien.
  const priseRef = useRef(0)

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
    if (local) {
      noterEcoute("reponse", { delai_ms: 0, source: "locale", actions: local.length })
      return local
    }
    const t0 = Date.now()

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
    // Ce que la phrase a coûté en attente, pour que « c'est lent » se lise
    // dans le journal au lieu de se discuter.
    noterEcoute("reponse", {
      delai_ms: Date.now() - t0,
      source: "modele",
      erreur: error ? String((error as { message?: string }).message ?? error).slice(0, 80) : null,
    })

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

    const reply = await executerActions(actions, originalTranscript)

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
   * Exécute les actions d'une phrase et rend ce que Jarvis doit dire. Partagé
   * entre le micro classique (runTurn) et le mode Live (outil commande_jarvis) :
   * une seule source de vérité pour ce que Jarvis sait faire.
   */
  async function executerActions(actions: VoiceAction[], originalTranscript: string): Promise<string> {
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
    return reply
  }

  // --- Mode conversation Live (prototype, décision de Raphaël du 4 sept.) ---
  // Le cœur ouvre une conversation Gemini Live au lieu du micro fait main :
  // audio en continu, fin de tour et interruption gérées par Google. Les
  // actions passent par le même chemin que la dictée (executerActions).
  const [modeLive, setModeLive] = useState(lireModeLive)
  useRelireApresRestauration(() => setModeLive(lireModeLive()))
  const liveRef = useRef<SessionLive | null>(null)

  function basculerModeLive() {
    const suivant = !modeLive
    setModeLive(suivant)
    ecrireModeLive(suivant)
    if (!suivant) arreterLive()
  }

  function arreterLive() {
    liveRef.current?.arreter()
    liveRef.current = null
  }

  async function demarrerLive() {
    priseRef.current++
    setLastUserText(null)
    setLastReply(null)
    liveRef.current = await demarrerSessionLive({
      onEntendu: (texte) => setLastUserText(texte),
      onReponse: (texte) => setLastReply(texte),
      onCommande: async (demande) => {
        setLastUserText(demande)
        const actions = await resolveTranscript(demande)
        // Une question de précision ne peut pas ouvrir un second micro : on
        // la rend au modèle, qui la posera de vive voix.
        if (actions[0]?.action === "clarify") return actions[0].message ?? "Peux-tu préciser ?"
        return await executerActions(actions, demande)
      },
      onEtat: (etat, detail) => {
        if (etat === "connexion") setStatus("processing")
        else if (etat === "ecoute") setStatus("listening")
        else if (etat === "parle") setStatus("speaking")
        else {
          liveRef.current = null
          if (detail) {
            setLastReply(detail)
            setStatus("error")
          } else {
            setStatus("idle")
          }
        }
      },
    })
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

  async function startListening(nettoyer: (t: string) => string = (t) => t) {
    priseRef.current++
    try {
      setStatus("listening")
      const transcript = nettoyer(await listen("command", { onTexte: setLastUserText }))
      await conduireConversation(transcript)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue."
      setLastReply(message)
      setStatus("error")
    }
  }

  async function handleClick() {
    if (modeLive) {
      if (liveRef.current) {
        arreterLive()
        setStatus("idle")
      } else if (status === "idle" || status === "error" || status === "wake-listening") {
        if (status === "wake-listening") stopListening()
        await demarrerLive()
      }
      return
    }

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
   * La veille : écoute du mot-clé « Jarvis » — SEULEMENT quand l'app est
   * réellement à l'écran, et quand personne d'autre ne se sert du micro.
   *
   * Pas de service en arrière-plan (décision de Raphaël, reportée). Et pas
   * non plus d'écoute « app derrière une autre » : la WebView continue de
   * tourner quand l'activité est en pause, Android refuse alors le micro,
   * et la boucle relançait un démarrage refusé toutes les 150 ms — le micro
   * que Raphaël voyait clignoter pendant qu'il dictait à un autre assistant.
   * La politique est dans src/lib/veille.ts, vérifiée sans appareil.
   */
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden")
  useEffect(() => {
    const relire = () => setVisible(document.visibilityState !== "hidden")
    const cacher = () => setVisible(false)
    document.addEventListener("visibilitychange", relire)
    window.addEventListener("pageshow", relire)
    window.addEventListener("focus", relire)
    // Pas « blur » : la fenêtre de permission d'Android le déclenche, et
    // couperait l'écoute qui vient justement de demander le micro.
    window.addEventListener("pagehide", cacher)
    return () => {
      document.removeEventListener("visibilitychange", relire)
      window.removeEventListener("pageshow", relire)
      window.removeEventListener("focus", relire)
      window.removeEventListener("pagehide", cacher)
    }
  }, [])

  const veilleActive = wakeWordEnabled && visible && !modeLive
  useEffect(() => {
    if (!veilleActive) return
    let cancelled = false

    async function wakeLoop() {
      let echecDemarrage = false
      let rafalesMuettes = 0
      while (!cancelled) {
        if (!peutEcouterEnVeille({ actif: true, visible: true, statut: statusRef.current })) {
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
        const prise = priseRef.current
        setStatus("wake-listening")
        let transcript: string | null = null
        echecDemarrage = false
        try {
          // arreterSi coupe la rafale dès que « Jarvis » est reconnu dans un
          // résultat partiel. onTexte n'affiche que ce qui suit le mot-clé :
          // une phrase qui ne nous est pas adressée ne s'affiche pas.
          transcript = await listen("wake", {
            arreterSi: (texte) => chercherMotCle(texte).trouve,
            onTexte: (texte) => {
              const demande = texteAAfficherEnVeille(texte)
              if (demande !== null) setLastUserText(demande)
            },
          })
        } catch (err) {
          // Silence : normal. Démarrage refusé : on recule avant de
          // réessayer, au lieu de harceler le service.
          echecDemarrage = err instanceof Error && err.message === MOTEUR_OCCUPE
        }
        if (cancelled) return
        rafalesMuettes = transcript ? 0 : rafalesMuettes + 1

        const { suite, demande } = apresRafale({
          priseAvant: prise,
          priseApres: priseRef.current,
          transcript,
        })
        if (suite === "laisser") {
          // Un appui sur le cœur a pris la main pendant la rafale : c'est son
          // tour, pas le nôtre. Avant, on remettait ici l'état au repos par-
          // dessus son écoute, et la boucle repartait aussitôt en concurrence.
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
        if (suite === "conversation") {
          // « Jarvis, ajoute une tâche » : la demande est déjà là.
          priseRef.current++
          setStatus("idle")
          await conduireConversation(demande)
        } else if (suite === "oui") {
          // « Jarvis » seul : on dit « Oui ? » PENDANT que le micro s'ouvre,
          // pas avant. Le service met une bonne demi-seconde à démarrer, la
          // confirmation en dure autant : les deux en même temps, c'est une
          // seconde de moins avant que Raphaël puisse parler.
          bargeInRef.current = false
          void speak("Oui ?", voiceIndex ?? undefined)
          await startListening(sansAccuse)
        } else {
          setStatus("idle")
        }
        if (!cancelled) {
          await new Promise((r) => setTimeout(r, delaiAvantRafaleSuivante(echecDemarrage, rafalesMuettes)))
        }
      }
    }

    wakeLoop()
    return () => {
      cancelled = true
      // L'app passe derrière une autre : on rend le micro tout de suite, on
      // n'attend pas la fin de la rafale.
      if (statusRef.current === "wake-listening") {
        stopListening()
        setStatus("idle")
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veilleActive])

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
      {status === "listening" && !liveRef.current && (
        <p className="text-sm text-muted-foreground">
          {micReady ? "Je t'écoute — touche le cœur quand tu as fini." : "Préparation du micro..."}
        </p>
      )}
      {liveRef.current && (status === "listening" || status === "speaking") && (
        <p className="text-sm text-muted-foreground">
          Conversation en cours — parle, coupe-moi si tu veux, touche le cœur pour arrêter.
        </p>
      )}
      {modeLive && status === "processing" && !liveRef.current && (
        <p className="text-sm text-muted-foreground">Connexion à la conversation…</p>
      )}
      {/* Prototype Live, à côté du micro classique : les deux pistes avancent
          en parallèle (décision de Raphaël, 4 sept.), on mesure, on tranche. */}
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={modeLive} onChange={basculerModeLive} className="size-3.5 accent-primary" />
        Mode conversation Live (essai)
      </label>
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
