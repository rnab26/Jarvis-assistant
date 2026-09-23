import { Capacitor } from "@capacitor/core"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { JarvisCore } from "@/components/JarvisCore"
import { pastilleQuota, type Consommation } from "@/lib/consommationModele"
import { cn } from "@/lib/utils"
import { themesDe } from "@/components/cockpit/CockpitBoard"
import { MOTEUR_OCCUPE, useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis"
import { messageErreurServeurVocal } from "@/lib/erreurServeurVocal"
import { supabase } from "@/lib/supabase"
import { AgendaError, agendaApi } from "@/lib/googleCalendar"
import { GmailError, gmailApi, type Brouillon } from "@/lib/googleGmail"
import { estConfirmationEnvoiMail } from "@/lib/confirmationEnvoiMail"
import {
  apresRafale,
  delaiApresOccupe,
  delaiAvantRafaleSuivante,
  enRefroidissement,
  focusPerduPendantEcoute,
  peutEcouterEnVeille,
  renonceApresRefus,
  REFROIDISSEMENT_APRES_FIN_MS,
  sansAccuse,
  texteAAfficherEnVeille,
} from "@/lib/veille"
import { chercherMotCle } from "@/lib/motCle"
import { interpreterLocalement } from "@/lib/commandeLocale"
import { completionExpiree } from "@/lib/tacheDateEtCategorie"
import { completerPlutotQueCreer, estUneReprise, phraseRepriseAction } from "@/lib/repriseDictee"
import { estConfirmationEnvoi } from "@/lib/confirmationEnvoi"
import { estDejaAnnoncee } from "@/lib/annonceDejaDite"
import { enregistrerEchangeLocal } from "@/lib/echangeLocal"
import { signalerErreur } from "@/lib/erreurs"
import {
  cibleDeLAction,
  echecDeLAction,
  echecSignalePar,
  satisfactionSignaleePar,
  signalementDicte,
  type TourJarvis,
} from "@/lib/retours"
import { noterCeQuiMarche } from "@/lib/ceQuiMarche"
import { delaiAvantAction } from "@/lib/enchainementActions"
import { JarvisWidget } from "@/lib/jarvisWidgetPlugin"
import {
  appPreferee,
  canalMessagesPrefere,
  cibleAnnoncee,
  dernierAppelTelephone,
  executerActionTelephone,
  marquerMessagePrepareCommeProgramme,
  messagePrepareEnAttente,
  questionAppPreferee,
  type ActionTelephone,
  type CategorieAppTelephone,
} from "@/lib/actionsTelephoneVocales"
import {
  estCorrectionMessage,
  estDemandeRelectureMessage,
  phraseCorrectionMessage,
  phraseRelectureMessage,
} from "@/lib/correctionMessage"
import {
  estAnnulationMessageAnnonce,
  peutAnnoncerMaintenant,
  phraseAnnonceMessage,
  prochainMessageAAnnoncer,
} from "@/lib/messageAnnonce"
import { destinataireManquant } from "@/lib/destinataireProgramme"
import {
  envoiAutoActif,
  estReponseNon,
  estReponseOui,
  phraseRelecture,
  DELAI_OUVERTURE_MS,
} from "@/lib/confirmationEnvoiVocale"
import { agirSurEcran } from "@/lib/controleEcran"
import { withTimeout } from "@/lib/withTimeout"
import { noterEcoute } from "@/lib/journalEcoute"
import {
  attenteActive,
  CLE_ATTENTE_TRANSCRIPTION,
  lireAttente,
  phraseEcoute,
} from "@/lib/attenteTranscription"
import { maintenirSessionLive, type SessionLive } from "@/lib/live/sessionLive"
import { liveActifQuelquePart } from "@/lib/live/etatLiveNatif"
import { prechaufferConnexionLive } from "@/lib/live/prechauffage"
import { consigneQuestionApp, suiteDeLaQuestion, type QuestionEnAttente } from "@/lib/questionAppLive"
import { retourOuAveu } from "@/lib/retourVide"
import { majEnCours, sAbonnerMaj } from "@/lib/majEnCours"
import { ecrireModeLive, lireModeLive } from "@/lib/livePrefs"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import type { DevItem } from "@/types/database"
import {
  type DevSectionsVoiceApi,
  executeVoiceAction,
  memoireChantierEnAttente,
  memoireDerniereCreation,
  memoireTacheEnAttente,
  type ContactsApi,
  type DevItemsApi,
  type DocumentsApi,
  type EntrainementApi,
  type GmailApi,
  type MessagesProgrammesApi,
  type PlaceRemindersApi,
  type PronunciationsApi,
  type NotesApi,
  type TasksApi,
  type VoiceSettingApi,
  type VoiceAction,
  type WidgetApi,
} from "@/lib/voiceActions"

type Status = "idle" | "wake-listening" | "listening" | "processing" | "speaking" | "error"

/** Temps laissé à la Edge Function pour répondre avant de le dire. */
const REPONSE_MAX_MS = 25000

/**
 * Une action qui touche une app du téléphone sans savoir laquelle utiliser,
 * et qu'on ne lui a encore jamais demandé — musique, itinéraire ou canal de
 * message. `null` si l'action n'a pas besoin de le savoir ou que la
 * préférence est déjà connue : ne pas redemander.
 */
function questionAmbigueAppTelephone(
  action: VoiceAction,
): { message: string; category: CategorieAppTelephone } | null {
  if (action.action === "open_app" && action.music_query && !action.app_name && !appPreferee("musique")) {
    return { message: questionAppPreferee("musique"), category: "musique" }
  }
  if (action.action === "navigate_to" && !action.app_name && !appPreferee("navigation")) {
    return { message: questionAppPreferee("navigation"), category: "navigation" }
  }
  if (action.action === "send_message" && !action.message_channel && !canalMessagesPrefere()) {
    return { message: questionAppPreferee("messages"), category: "messages" }
  }
  if (action.action === "ask_ai" && !action.app_name && !appPreferee("ia")) {
    return { message: questionAppPreferee("ia"), category: "ia" }
  }
  return null
}

interface MicButtonProps {
  tasksApi: TasksApi
  devItemsApi: DevItemsApi
  devSectionsApi: DevSectionsVoiceApi
  documentsApi: DocumentsApi
  contactsApi: ContactsApi
  placeRemindersApi: PlaceRemindersApi
  messagesProgrammesApi: MessagesProgrammesApi
  pronunciationsApi: PronunciationsApi
  /** Ses notes personnelles, pour « crée une note », « lis mes notes »
   * (chantier 447560d1). */
  notesApi: NotesApi
  voiceSettingApi: VoiceSettingApi
  widgetApi: WidgetApi
  entrainementApi: EntrainementApi
  wakeWordEnabled: boolean
  /** Combien de démarrages refusés d'affilée avant que la veille renonce
   * d'elle-même — 0 = jamais. Voir `renonceApresRefus` (src/lib/veille.ts) et
   * Paramètres › Voix et écoute › Mot-clé de réveil. */
  seuilAbandonVeille?: number
  /** Ce que Jarvis a consommé aujourd'hui, pour la ligne sous le cœur.
   * `null` = pas encore lu, ou lecture en échec — on n'affiche alors RIEN. */
  consommation: Consommation | null
  /** Pour que « active le mot-clé » / « désactive la géolocalisation »
   * touchent le VRAI hook (React + persistance), voir ReglagesVoixApi. */
  setWakeWordEnabled: (v: boolean) => void
  setGeofenceEnabled: (v: boolean) => void
  voiceIndex: number | null
  /** Annonce à voix haute le résultat (succès/échec) d'une action déjà
   * exécutée. Ne coupe jamais une question qui attend une réponse — voir
   * VOICE_CONFIRMER_RESULTAT_KEY dans voicePrefs.ts. */
  confirmerResultatVoix: boolean
  /** Durée pendant laquelle le micro reste ouvert après une réponse de
   * Jarvis, pour enchaîner sans retoucher le bouton. 0 = désactivé. */
  suiteMs: number
  /** Appelé quand un échange se termine et que le statut revient au repos
   * — utilisé par la fenêtre de l'appui long pour se refermer d'elle-même,
   * jamais par l'app normale. */
  onIdle?: () => void
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
  devSectionsApi,
  documentsApi,
  contactsApi,
  placeRemindersApi,
  messagesProgrammesApi,
  pronunciationsApi,
  notesApi,
  voiceSettingApi,
  widgetApi,
  entrainementApi,
  wakeWordEnabled,
  seuilAbandonVeille = 0,
  consommation,
  setWakeWordEnabled,
  setGeofenceEnabled,
  voiceIndex,
  confirmerResultatVoix,
  suiteMs,
  onIdle,
}: MicButtonProps) {
  const { listen, stop: stopListening, isSupported, ready: micReady } = useSpeechRecognition()
  const { speak, stop: stopSpeaking } = useSpeechSynthesis()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>("idle")
  // Ne prévenir qu'un vrai retour au repos APRÈS un échange, jamais le repos
  // initial du montage — sinon la fenêtre de l'appui long se refermerait
  // avant même d'avoir écouté quoi que ce soit.
  const dejaActifRef = useRef(false)
  useEffect(() => {
    if (status !== "idle") {
      dejaActifRef.current = true
      return
    }
    if (dejaActifRef.current) onIdle?.()
  }, [status, onIdle])
  // Chantier ba140853 : la connexion à live-jeton est déjà chaude au moment
  // où il ouvre le Live, pour la première fois de la session — voir
  // prechauffage.ts pour la mesure qui justifie ça.
  useEffect(() => {
    prechaufferConnexionLive()
  }, [])
  const [lastUserText, setLastUserText] = useState<string | null>(null)
  // L'ÉCRAN FIGÉ PENDANT QU'IL PARLE (chantier 53d99720). Le micro est ouvert
  // en moins de 50 ms (mesuré), mais le premier mot d'Android met 1 à 3 s à
  // arriver : entre les deux, rien ne bouge, et un écran figé pendant qu'on
  // parle se lit comme un micro qui n'écoute pas. Ce drapeau dit seulement
  // « le délai est passé sans un mot » ; la phrase, elle, vit dans le module
  // pur `attenteTranscription.ts`.
  const [attenteDepassee, setAttenteDepassee] = useState(false)
  useEffect(() => {
    // Le délai est relu À CHAQUE écoute, pas une fois au montage : ce
    // composant reste monté d'un écran à l'autre, et une valeur lue une seule
    // fois ne bougerait plus tant qu'il n'a pas redémarré l'app — le réglage
    // de Paramètres n'aurait servi à rien jusque-là.
    if (status !== "listening" || !micReady || lastUserText) {
      setAttenteDepassee(false)
      return
    }
    let brut: string | null = null
    try {
      brut = localStorage.getItem(CLE_ATTENTE_TRANSCRIPTION)
    } catch {
      // Stockage refusé (navigation privée, données bloquées) : on garde le
      // défaut plutôt que d'éteindre la phrase sans le dire.
    }
    const delai = lireAttente(brut)
    if (!attenteActive(delai)) return
    const minuteur = setTimeout(() => setAttenteDepassee(true), delai)
    return () => clearTimeout(minuteur)
  }, [status, micReady, lastUserText])
  const [lastReply, setLastReply] = useState<string | null>(null)
  /**
   * La phrase qui n'a pas abouti, gardée pour pouvoir la renvoyer TELLE QUELLE.
   *
   * Le 15 sept. 2026, une dictée de 43 secondes (104 résultats partiels, 19
   * sessions de reconnaissance — mesuré dans `journal_ecoute`) a été perdue
   * parce que le `fetch` a été rejeté avant la réponse. Redicter 43 secondes
   * mot pour mot n'est pas une option ; le texte est déjà à l'écran, il
   * manquait seulement de quoi le renvoyer.
   *
   * Gardée à part de `lastUserText`, qui bouge à chaque résultat partiel de
   * l'écoute suivante : on veut la phrase EXACTE qui est partie, pas ce que
   * l'affichage montrait à l'instant du renvoi.
   */
  const [phraseARejouer, setPhraseARejouer] = useState<string | null>(null)
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
  // En Live, « avec quelle application ? » est posée par le modèle et la
  // réponse revient au tour suivant : on garde ici la demande à rejouer.
  // Volontairement une ref et pas un état : personne ne l'affiche, et un
  // rendu de plus pendant que Google tient le micro ne sert à rien.
  const questionAppRef = useRef<QuestionEnAttente | null>(null)

  // La dernière phrase que les règles locales ont reconnue toute seule.
  //
  // Une commande traitée sur l'appareil ne passe jamais par voice-command,
  // donc personne n'écrit sa ligne dans `echanges` : elle disparaissait de
  // l'historique, et deux chantiers dictés le 5 sept. ont été perdus comme ça
  // (chantier 5c3182c5). On retient laquelle, pour l'écrire une fois que la
  // réponse est connue — et une seule fois : une phrase résolue par le
  // serveur, déjà écrite là-bas, ne doit pas se retrouver en double.
  const derniereLocaleRef = useRef<string | null>(null)

  /** Garde la trace d'une commande que l'appareil a traitée sans le serveur. */
  function tracerSiLocale(transcript: string, reponse: string | null) {
    if (derniereLocaleRef.current !== transcript) return
    derniereLocaleRef.current = null
    enregistrerEchangeLocal(transcript, reponse)
  }

  // Le tour précédent, pour pouvoir lui attribuer un reproche.
  //
  // « Tu n'as pas lancé la musique que je t'ai demandée » — l'exemple vécu de
  // Raphaël le 3 sept. : aucune exception n'avait été levée, l'action avait
  // « réussi », et ce reproche partait dans le vide. C'est le SEUL témoin d'un
  // échec que Jarvis croit être une réussite (chantier 25a58902).
  const dernierTourRef = useRef<TourJarvis | null>(null)
  // Le tour déjà salué d'un « parfait » (son `at`) : un second compliment sur
  // la même action ne compte pas deux fois dans `ce_qui_marche`.
  const tourSalueRef = useRef<number | null>(null)

  // Le brouillon de réponse Gmail préparé (prepare_email_reply), en attente
  // d'un « envoie » — même raison d'être que dernierTourRef : un mail part
  // vers l'extérieur en son nom, rien ne s'envoie sans qu'il l'ait validé.
  const brouillonMailRef = useRef<Brouillon | null>(null)

  /** Ce que la phrase courante dit du tour précédent — le plus souvent rien. */
  function constaterEchec(phrase: string, source: "voix" | "live") {
    // Un signalement EXPLICITE (« note ce problème de comportement… »,
    // chantier 519e8fff) ne dépend d'AUCUN tour précédent — indépendant du
    // reste de cette fonction, il se vérifie sur la phrase seule.
    const signalement = signalementDicte(phrase)
    if (signalement) {
      signalerErreur(signalement.categorie, signalement.titre, {
        detail: signalement.detail,
        contexte: signalement.contexte,
        source,
        correctionSuggeree: signalement.correctionSuggeree,
      })
    }

    // L'inverse d'une plainte (chantier c2fd0205) : « parfait », « ça
    // marche » juste après une action. Retenu dans `ce_qui_marche`, que les
    // sessions lisent au démarrage pour ne pas casser ce qui lui convient.
    //
    // Le tour précédent N'EST PAS oublié ici, contrairement à une plainte :
    // « parfait, vas-y envoie-le » après un message préparé est AUSSI la
    // confirmation d'envoi, et `estConfirmationEnvoi` a besoin de ce tour
    // juste après. On retient seulement qu'il a déjà été salué, pour ne pas
    // compter deux fois « parfait… super » sur la même action.
    const satisfaction = satisfactionSignaleePar(phrase, dernierTourRef.current, Date.now())
    if (satisfaction) {
      if (tourSalueRef.current !== dernierTourRef.current?.at) {
        tourSalueRef.current = dernierTourRef.current?.at ?? null
        noterCeQuiMarche(satisfaction.titre, {
          paroles: satisfaction.paroles,
          contexte: satisfaction.contexte,
        })
      }
      return
    }

    const echec = echecSignalePar(phrase, dernierTourRef.current, Date.now())
    if (!echec) return
    // Une fois signalé, on oublie le tour : sinon deux reproches d'affilée sur
    // la même chose compteraient deux fois, et le registre exagérerait.
    dernierTourRef.current = null
    signalerErreur(echec.categorie, echec.titre, {
      detail: echec.detail,
      contexte: echec.contexte,
      source,
      correctionSuggeree: echec.correctionSuggeree,
    })
  }

  /** Retient ce qui vient d'être fait, au cas où la phrase suivante le conteste. */
  function retenirLeTour(transcript: string, actions: VoiceAction[], reponse: string | null) {
    dernierTourRef.current = {
      transcript,
      actions: actions.map((a) => a.action),
      cible: cibleDeLAction(actions[0] as unknown as Record<string, unknown>),
      reponse,
      at: Date.now(),
    }
  }

  /**
   * Envoie un transcript à la Edge Function et renvoie les actions à exécuter.
   * Une phrase peut en contenir plusieurs ("ajoute une tâche et marque
   * l'autre comme faite") : elles reviennent dans l'ordre dicté.
   */
  async function resolveTranscript(transcript: string): Promise<VoiceAction[]> {
    // « Envoie-le », « vas-y », « c'est bon » après un message préparé : un
    // CLIC, pas un second brouillon (chantier 21cf48d2). AVANT toute autre
    // règle et avant le serveur, qui ne voit jamais le tour précédent —
    // c'est justement pour ça que la reconnaissance doit se faire ici, avec
    // dernierTourRef, que le serveur n'a pas.
    if (estConfirmationEnvoi(dernierTourRef.current, transcript, Date.now())) {
      const confirmation: VoiceAction[] = [
        { action: "screen_action", screen_command: "clic", screen_target: "Envoyer" },
      ]
      noterEcoute("reponse", { delai_ms: 0, source: "locale", actions: confirmation.length })
      derniereLocaleRef.current = transcript
      return confirmation
    }

    // Même défaut, pour un mail préparé (prepare_email_reply) : le serveur ne
    // voit jamais qu'un brouillon vient d'être relu, donc « envoie » tout seul
    // doit être reconnu ICI (confirmationEnvoiMail.ts).
    if (estConfirmationEnvoiMail(dernierTourRef.current, transcript, Date.now())) {
      const confirmation: VoiceAction[] = [{ action: "send_email" }]
      noterEcoute("reponse", { delai_ms: 0, source: "locale", actions: confirmation.length })
      derniereLocaleRef.current = transcript
      return confirmation
    }

    // « annule », « laisse tomber » après l'ANNONCE d'un message programmé
    // (messageAnnonce.ts) : on annule l'envoi et on le dit — jamais un
    // silence, jamais un second brouillon. `messageProgrammeId` n'est posé
    // QUE par cette annonce-là (jamais par une préparation normale), donc sa
    // seule présence suffit à distinguer ce cas de « annule » dans n'importe
    // quel autre contexte — d'où la même fenêtre de fraîcheur (90 s) que la
    // correction et la relecture ci-dessous, sur le même dernierTourRef.
    {
      const prepareAnnonce = messagePrepareEnAttente()
      const frais = dernierTourRef.current && Date.now() - dernierTourRef.current.at <= 90_000
      if (
        frais &&
        prepareAnnonce?.messageProgrammeId &&
        estAnnulationMessageAnnonce({ id: prepareAnnonce.messageProgrammeId }, transcript)
      ) {
        try {
          await messagesProgrammesApi.annulerMessage(prepareAnnonce.messageProgrammeId)
        } catch {
          // On le dit quand même : rien de pire ici qu'un silence après
          // avoir déjà annoncé le message.
        }
        const dit = prepareAnnonce.cible
          ? `D'accord, je n'envoie rien à ${prepareAnnonce.cible}.`
          : "D'accord, je n'envoie rien."
        const annulation: VoiceAction[] = [{ action: "chat", message: dit }]
        noterEcoute("reponse", { delai_ms: 0, source: "locale", actions: annulation.length })
        derniereLocaleRef.current = transcript
        return annulation
      }
    }

    // La RELECTURE d'un message WhatsApp/SMS préparé (« relis-le moi »,
    // « qu'est-ce que t'as écrit ? ») : Jarvis dit le texte tel qu'il est,
    // sans y toucher ni l'envoyer — chantier ed32cbcc. Même raison que les
    // deux confirmations ci-dessus : reconnu ICI avec dernierTourRef, que le
    // serveur ne voit jamais.
    if (estDemandeRelectureMessage(dernierTourRef.current, transcript, Date.now())) {
      const prepare = messagePrepareEnAttente()
      if (prepare) {
        const relecture: VoiceAction[] = [
          { action: "chat", message: phraseRelectureMessage(prepare.cible, prepare.texte) },
        ]
        noterEcoute("reponse", { delai_ms: 0, source: "locale", actions: relecture.length })
        derniereLocaleRef.current = transcript
        return relecture
      }
    }

    // La CORRECTION d'un message WhatsApp/SMS préparé (« remplace X par Y »,
    // « enlève la dernière phrase ») : on récrit le MÊME brouillon plutôt que
    // d'en ouvrir un second ou de laisser l'ancien partir tel quel — chantier
    // ed32cbcc. Seul le serveur sait récrire un texte : on lui repasse la
    // phrase avec le contexte qu'il n'a jamais eu (même principe que la
    // correction de la relecture AVANT ouverture, confirmationEnvoiVocale.ts).
    if (estCorrectionMessage(dernierTourRef.current, transcript, Date.now())) {
      const prepare = messagePrepareEnAttente()
      if (prepare) {
        const recrites = await resolveTranscript(
          phraseCorrectionMessage(prepare.cible, prepare.texte, transcript, prepare.canal),
        )
        // Le DESTINATAIRE ne doit JAMAIS changer sur une correction — seul le
        // texte change. On le réimpose depuis le brouillon d'origine plutôt
        // que de laisser le modèle le redéduire d'un prompt qui ne porte que
        // son NOM : « composer le numéro de quelqu'un d'autre est l'erreur
        // qu'on ne rattrape pas » (chercherContact.ts).
        const [premiere, ...reste] = recrites
        if (premiere && premiere.action === "send_message") {
          return [
            {
              ...premiere,
              contact_id: prepare.contact_id,
              contact_name: prepare.contact_name,
              phone_number: prepare.phone_number,
              message_channel: prepare.forceWhatsAppBusiness ? "whatsapp_business" : prepare.canal,
            },
            ...reste,
          ]
        }
        return recrites
      }
    }

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
      sequences: entrainementApi.sequences,
      categories: tasksApi.categories,
      tacheEnAttente: memoireTacheEnAttente(),
      sections: devSectionsApi.sections,
      chantierEnAttente: memoireChantierEnAttente(),
      notes: notesApi.notes.map((n) => ({ id: n.id, title: n.title, content: n.content })),
    })
    if (local) {
      noterEcoute("reponse", { delai_ms: 0, source: "locale", actions: local.length })
      derniereLocaleRef.current = transcript
      return local
    }
    // Le serveur écrira lui-même la ligne dans `echanges` : rien à tracer ici,
    // et surtout pas la phrase précédente.
    derniereLocaleRef.current = null
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
          // Les sections DÉCLARÉES, et pas seulement les thèmes portés par un
          // chantier : une section créée d'avance et encore vide était
          // invisible pour Jarvis, qui en fabriquait une jumelle au lieu d'y
          // ranger (chantier a4348872). L'id sert au renommage.
          sections: devSectionsApi.sections.map((s) => ({ id: s.id, nom: s.nom })),
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
          // LA TÂCHE QUI ATTEND ENCORE UNE RÉPONSE, quand il y en a une.
          //
          // Le 15 sept. à 17:32:57, Jarvis venait de proposer une catégorie
          // pour « rappeler Dan Marciano ». Il a répondu « non mets-le dans
          // la catégor » — phrase coupée par la reconnaissance vocale, donc
          // aucune catégorie à reconnaître sur l'appareil. Partie au serveur,
          // elle est revenue en « Dans quelle catégorie souhaites-tu que je
          // déplace la tâche pour la banque Apoalim ? » : une tâche créée
          // SEPT HEURES plus tôt. Le serveur n'avait aucun moyen de savoir
          // laquelle attendait — `resolveTranscript` ne lui envoie que la
          // phrase courante, jamais le tour précédent (même défaut que pour
          // la confirmation d'un envoi, chantier 21cf48d2).
          //
          // Quelques dizaines de caractères, et SEULEMENT quand une tâche
          // attend vraiment : `null` le reste du temps, comme `ceQuiLAttend`
          // qui ne rend rien plutôt qu'un titre vide.
          tacheEnAttente: (() => {
            const attente = memoireTacheEnAttente()
            if (!attente || completionExpiree(attente, Date.now())) return null
            return {
              id: attente.taskId,
              titre: attente.titre,
              sans_date: attente.sansDate,
              // ON NE LUI DIT PAS LE NOM DE LA CATÉGORIE SUGGÉRÉE, et c'est
              // tout le correctif (chantier 902bf94b, mesuré le 16 sept.).
              //
              // Tant qu'il le connaissait, le modèle le reposait — même
              // devant un « non » qui le refusait, et même sous un INTERDIT
              // en toutes lettres : trois versions déployées, trois fois la
              // même réponse. Privé de ce nom, il ne peut plus le reposer, et
              // il fait exactement ce qu'on attend : il redemande en NOMMANT
              // la tâche. Mesuré aussi dans l'autre sens — quand la phrase
              // porte un nom de catégorie, il range sans rien demander.
              //
              // C'est du code, pas de la prose : il ne peut pas désobéir à ce
              // qu'il ne reçoit pas.
              categorie_a_valider: attente.suggestion !== null,
            }
          })(),
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
    // Seulement au premier tour : les tours suivants rejouent une phrase
    // construite par l'app (question de précision, préférence d'application),
    // pas une phrase de Raphaël — les prendre pour une redite serait faux.
    if (round === 0) constaterEchec(transcript, "voix")
    setStatus("processing")
    const brutes = await resolveTranscript(transcript)
    // IL REDIT SA PHRASE EN L'ALLONGEANT : on COMPLÈTE la tâche qu'il vient
    // de dicter, on n'en crée pas une seconde (repriseDictee.ts).
    //
    // Mesuré sur ses 298 vraies dictées : six paires où la seconde contient
    // la première mot pour mot, toutes le même phénomène — un résultat final
    // rendu trop tôt par le service de reconnaissance —, aucun faux positif.
    // `deciderDoublonTache` voyait bien la ressemblance et REFUSAIT la
    // seconde ; mais c'est elle qui porte l'échéance à 15 h, et la refuser
    // perdait ce qu'il venait d'ajouter.
    //
    // Calculé ICI parce que c'est la seule couche qui tient la phrase
    // PRÉCÉDENTE (`dernierTourRef`) — le serveur ne la voit jamais, comme
    // pour la confirmation d'un envoi (chantier 21cf48d2).
    const reprise = estUneReprise(dernierTourRef.current, transcript, Date.now())
    const actions =
      (reprise ? completerPlutotQueCreer(brutes, memoireDerniereCreation(), Date.now()) : null) ?? brutes

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

    // Musique sans application nommée, itinéraire, ou message sans canal :
    // ambigu de la même façon que ci-dessus, mais qui touche une app du
    // téléphone plutôt que Jarvis lui-même — sinon Android ouvrirait son
    // sélecteur ("Terminer l'action avec…"), ce que Raphaël a signalé ne pas
    // vouloir. On le demande une fois, on retient directement la réponse
    // (pas besoin du modèle : c'est un nom d'appli ou "SMS"/"WhatsApp", pas
    // une phrase à interpréter), puis on rejoue la demande initiale — la
    // préférence connue lui suffit maintenant.
    const question = actions.length === 1 ? questionAmbigueAppTelephone(premiere) : null
    if (question && round < 3) {
      setLastReply(question.message)
      setStatus("speaking")
      bargeInRef.current = false
      await speak(question.message, voiceIndex ?? undefined)
      if (bargeInRef.current) return false

      setStatus("listening")
      const reponse = await listen("command", { onTexte: setLastUserText })
      setLastUserText(reponse)
      await executerActionTelephone({ action: "set_app_preference", category: question.category, app_name: reponse }, [])
      return await runTurn(originalTranscript, originalTranscript, round + 1)
    }

    // La relecture vocale avant l'envoi WhatsApp (chantier ed32cbcc), décidée
    // par Raphaël le 5 sept. au soir — décochée par défaut dans Paramètres.
    // Réglée, Jarvis dit le destinataire ET le texte AVANT d'ouvrir WhatsApp,
    // et n'appuie sur Envoyer que sur un « oui » entendu. Sans elle : rien ne
    // change, le message se prépare comme avant et attend un « envoie » une
    // fois WhatsApp déjà ouvert (confirmationEnvoi.ts).
    if (
      Capacitor.isNativePlatform() &&
      premiere.action === "send_message" &&
      actions.length === 1 &&
      round < 3 &&
      (premiere.message_channel ?? canalMessagesPrefere() ?? "whatsapp") === "whatsapp" &&
      envoiAutoActif()
    ) {
      const messageAction = premiere
      const cible = cibleAnnoncee(messageAction, contactsApi.contacts)
      const relecture = phraseRelecture(cible, messageAction.message_text)
      setLastReply(relecture)
      setStatus("speaking")
      bargeInRef.current = false
      await speak(relecture, voiceIndex ?? undefined)
      if (bargeInRef.current) return false

      setStatus("listening")
      const reponse = await listen("command", { onTexte: setLastUserText })
      setLastUserText(reponse)

      if (estReponseNon(reponse)) {
        const dit = "D'accord, je n'envoie rien."
        setLastReply(dit)
        if (confirmerResultatVoix) {
          setStatus("speaking")
          bargeInRef.current = false
          await speak(dit, voiceIndex ?? undefined)
          if (bargeInRef.current) return false
        }
        if (suiteMs > 0) return true
        setStatus("idle")
        return false
      }

      if (!estReponseOui(reponse)) {
        // Ni oui ni non : une correction du texte, pas une réponse fermée.
        // On la repasse par le pipeline habituel plutôt que de deviner ici
        // ce qu'il veut changer — c'est le même principe que la boucle de
        // clarification ci-dessus.
        const combined = `Message proposé${cible ? ` à ${cible}` : ""} sur WhatsApp : "${messageAction.message_text}". Réponse de Raphaël à la relecture : "${reponse}". Rédige le message WhatsApp en conséquence.`
        return await runTurn(combined, originalTranscript, round + 1)
      }

      // « oui » : on prépare vraiment, PUIS on appuie nous-mêmes sur Envoyer.
      // Pas de fenêtre d'annulation passive ici (sauterFenetre) : la relecture
      // qu'on vient de faire EST la confirmation, la redire une seconde fois
      // par-dessus n'apporterait rien.
      let clic: string
      try {
        await executerActionTelephone(messageAction, contactsApi.contacts, { sauterFenetre: true })
        await new Promise((r) => setTimeout(r, DELAI_OUVERTURE_MS))
        clic = (await agirSurEcran("clic", "Envoyer")).message
      } catch (e) {
        const echec = echecDeLAction("send_message", cible, transcript, e)
        signalerErreur(echec.categorie, echec.titre, {
          detail: echec.detail,
          contexte: echec.contexte,
          source: "voix",
        })
        clic = "Je n'ai pas réussi à l'envoyer."
      }
      tracerSiLocale(transcript, clic)
      retenirLeTour(transcript, [messageAction], clic)

      setLastReply(clic)
      if (confirmerResultatVoix) {
        setStatus("speaking")
        bargeInRef.current = false
        await speak(clic, voiceIndex ?? undefined)
        if (bargeInRef.current) return false
      }
      if (suiteMs > 0) return true
      setStatus("idle")
      return false
    }

    // « Prévenir puis refaire » (chantier e4886791, réponse de Raphaël le
    // 17 sept. 2026) : quand il redit sa phrase en l'allongeant APRÈS
    // qu'une musique/vidéo est déjà lancée ou qu'un itinéraire est déjà
    // ouvert, Jarvis le dit avant de relancer — sinon deux ouvertures
    // d'application coup sur coup, sans un mot. `reprise` (calculé
    // ci-dessus) garde ça hors des demandes NEUVES de la même famille.
    const annoncePrevenir = phraseRepriseAction(reprise, actions, dernierAppelTelephone(), Date.now())
    if (annoncePrevenir) {
      setLastReply(annoncePrevenir)
      setStatus("speaking")
      bargeInRef.current = false
      await speak(annoncePrevenir, voiceIndex ?? undefined)
      if (bargeInRef.current) return false
      setStatus("processing")
    }

    const reply = await executerActions(actions, originalTranscript)
    tracerSiLocale(transcript, reply)
    retenirLeTour(transcript, actions, reply)

    setLastReply(reply)
    // La fenêtre d'annulation vient peut-être déjà de dire ces mots
    // (« J'ouvre Waze. ») pendant le décompte : ne pas les relire une
    // seconde fois. Le texte reste affiché, seule la voix se tait ici — et
    // se tait aussi complètement quand confirmerResultatVoix est coupé
    // (chantier d9bc1275) : le texte reste affiché sous le cœur dans les
    // deux cas, seule la voix change.
    if (confirmerResultatVoix && !estDejaAnnoncee(reply)) {
      setStatus("speaking")
      bargeInRef.current = false
      await speak(reply, voiceIndex ?? undefined)
      if (bargeInRef.current) return false
    }
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
    let derniereAction: string | null = null
    // Objet frais à chaque phrase : brouillonEnAttente doit lire l'état
    // COURANT de la ref, pas celui du premier rendu qui a monté MicButton.
    const gmailVoiceApi: GmailApi = {
      ...gmailApi,
      // Une réponse dictée n'attache jamais de fichier : pieces_jointes: []
      // rend l'appel compatible avec le type plus large de googleGmail.ts,
      // qui accepte des pièces jointes en plus d'un simple brouillon.
      envoyerMessage: (brouillon, confirme) =>
        gmailApi.envoyerMessage({ ...brouillon, pieces_jointes: [] }, confirme),
      brouillonEnAttente: brouillonMailRef.current,
      retenirBrouillon: (b) => {
        brouillonMailRef.current = b
      },
    }
    for (const action of actions) {
      // Une action qui ouvre une autre application (YouTube, Waze, WhatsApp…)
      // ne se voit pas à l'écran instantanément : lire ou cliquer trop tôt
      // trouve encore l'écran précédent, en silence (chantier b57b30ce).
      const delai = delaiAvantAction(derniereAction, action.action)
      if (delai > 0) await new Promise((resolve) => setTimeout(resolve, delai))
      derniereAction = action.action
      const cible = cibleDeLAction(action as unknown as Record<string, unknown>)
      try {
        reponses.push(
          await executeVoiceAction(
            action,
            tasksApi,
            devItemsApi,
            devSectionsApi,
            documentsApi,
            contactsApi,
            placeRemindersApi,
            pronunciationsApi,
            voiceSettingApi,
            widgetApi,
            agendaApi,
            { setWakeWordEnabled, setGeofenceEnabled },
            entrainementApi,
            gmailVoiceApi,
            { navigateVersParametres: (cible) => navigate(`/settings?section=${cible}`) },
            messagesProgrammesApi,
            notesApi,
          ),
        )
        // Le capteur générique (chantier d50d5f34) : CHAQUE action exécutée par
        // Jarvis, réussie ou non, plutôt qu'instrumenter un par un chacun de la
        // trentaine de cas de `executeVoiceAction`. `screen_action` et quelques
        // autres ont déjà leur propre trace plus détaillée (ecran_action,
        // musique_resultat…) dans `controleEcran.ts`/`actionsTelephoneVocales.ts`
        // — celle-ci est le filet qui couvre TOUT le reste (add_task,
        // add_dev_item, set_setting, open_app…), jamais capté nulle part avant.
        noterEcoute("action_executee", { action: action.action, cible, reussi: true })
      } catch (e) {
        noterEcoute("action_executee", { action: action.action, cible, reussi: false })
        // L'agenda et Gmail sont les seuls domaines qui dépendent d'un
        // service extérieur : compte Google pas encore branché, accès
        // retiré, Google qui refuse. Ces messages-là sont écrits pour être
        // dits — les avaler ferait croire que Jarvis n'a pas entendu la
        // demande.
        // Une action qui lève, c'est un échec sans le moindre doute : on le
        // range avant de laisser l'erreur remonter, sinon elle ne laisse
        // qu'un message rouge de cinq secondes à l'écran.
        const echec = echecDeLAction(action.action, cible, originalTranscript, e)
        signalerErreur(echec.categorie, echec.titre, {
          detail: echec.detail,
          contexte: echec.contexte,
          source: "voix",
        })
        if (e instanceof AgendaError || e instanceof GmailError) reponses.push(e.message)
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

    // AUCUNE ACTION N'A RENDU DE PHRASE. Vu deux fois dans son journal le
    // 6 sept. sur « réponds à mel ma femme » puis « envoyer le message
    // maintenant » : le modèle Live recevait "" et comblait le silence en
    // annonçant que le message était parti. On avoue au lieu de se taire, et
    // on SIGNALE — sinon on aurait juste rendu Jarvis poli sur un défaut
    // qu'on n'aurait plus jamais retrouvé.
    const retour = retourOuAveu(reply)
    if (retour.vide) {
      signalerErreur("action", "Une action n'a rien répondu", {
        detail: `actions : ${actions.map((a) => a.action).join(", ") || "(aucune)"}`,
        contexte: originalTranscript,
        source: "voix",
      })
    }
    return retour.texte
  }

  // --- Mode conversation Live (prototype, décision de Raphaël du 4 sept.) ---
  // Le cœur ouvre une conversation Gemini Live au lieu du micro fait main :
  // audio en continu, fin de tour et interruption gérées par Google. Les
  // actions passent par le même chemin que la dictée (executerActions).
  const [modeLive, setModeLive] = useState(lireModeLive)
  useRelireApresRestauration(() => setModeLive(lireModeLive()))
  const liveRef = useRef<SessionLive | null>(null)
  // Lu depuis la boucle de veille, qui vit dans un effet : une ref, pas l'état.
  const modeLiveRef = useRef(modeLive)
  modeLiveRef.current = modeLive
  // Horodatage jusqu'auquel le mot-clé se tait après un « terminé » (voix ou
  // appui) — voir REFROIDISSEMENT_APRES_FIN_MS. 0 = jamais déclenché.
  const refroidissementRef = useRef(0)

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

  /** Ce que le modèle Live sait de Raphaël à l'ouverture. Compact : c'est
   * lu à chaque tour de la conversation. */
  function contexteLive(): string {
    const aujourdhui = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    const categories = new Map(tasksApi.categories.map((c) => [c.id, c.name]))
    const taches = tasksApi.tasks
      .filter((t) => t.status !== "done")
      .slice(0, 40)
      .map((t) => {
        const cat = t.category_id ? categories.get(t.category_id) : null
        const quand = t.due_date ? ` (pour le ${t.due_date}${t.due_time ? ` à ${t.due_time}` : ""})` : ""
        return `- ${t.title}${cat ? ` [${cat}]` : ""}${quand}`
      })
    const chantiers = devItemsApi.devItems
      .filter((i) => !i.archived_at)
      .slice(0, 30)
      .map((i) => `- ${i.title}${i.theme ? ` [${i.theme}]` : ""} (${i.status}, priorité ${i.priority})`)
    const contacts = contactsApi.contacts.slice(0, 40).map((c) => `- ${c.name}${c.notes ? ` : ${extrait(c.notes)}` : ""}`)
    return [
      `Date du jour : ${aujourdhui}.`,
      `Tâches à faire de Raphaël (${taches.length}) :\n${taches.join("\n") || "- aucune"}`,
      `Chantiers du cockpit Jarvis en cours (${chantiers.length}) :\n${chantiers.join("\n") || "- aucun"}`,
      `Contacts (${contacts.length}) :\n${contacts.join("\n") || "- aucun"}`,
    ].join("\n\n")
  }

  async function demarrerLive(premierMessage?: string) {
    priseRef.current++
    setLastUserText(premierMessage ?? null)
    setLastReply(null)
    liveRef.current = await maintenirSessionLive({
      contexte: contexteLive(),
      premierMessage,
      onEntendu: (texte) => setLastUserText(texte),
      onReponse: (texte) => setLastReply(texte),
      onCommande: async (demande) => {
        setLastUserText(demande)
        constaterEchec(demande, "live")

        // Une question « avec quelle application ? » posée au tour précédent
        // attend peut-être sa réponse ici (chantier d3b6eeb4).
        const suite = suiteDeLaQuestion(questionAppRef.current, demande, Date.now())
        let aRejouer = demande
        if (suite.suite !== "normale") questionAppRef.current = null
        if (suite.suite === "enregistrer") {
          await executerActionTelephone(
            { action: "set_app_preference", category: suite.categorie as CategorieAppTelephone, app_name: suite.app },
            [],
          )
          // La préférence est connue : on rejoue la demande d'origine, qui
          // ne sera plus ambiguë.
          aRejouer = suite.demande
          setLastUserText(aRejouer)
        }

        // Le rendu courant, pas celui de l'ouverture : une tâche ajoutée
        // pendant la conversation doit se voir à la commande suivante.
        const actions = await derniersRef.current.resolveTranscript(aRejouer)
        // Une question de précision ne peut pas ouvrir un second micro : on
        // la rend au modèle, qui la posera de vive voix.
        if (actions[0]?.action === "clarify") return actions[0].message ?? "Peux-tu préciser ?"

        // Même chose pour l'app du téléphone : sans la question, Android
        // ouvrirait son sélecteur « Terminer l'action avec… ». On mémorise
        // la demande pour la rejouer quand il aura répondu.
        const question = actions.length === 1 ? questionAmbigueAppTelephone(actions[0]) : null
        if (question) {
          questionAppRef.current = { demande: aRejouer, categorie: question.category, poseeAt: Date.now() }
          return consigneQuestionApp(question.message)
        }

        const reponse = await derniersRef.current.executerActions(actions, aRejouer)
        tracerSiLocale(aRejouer, reponse)
        retenirLeTour(aRejouer, actions, reponse)
        return reponse
      },
      onEtat: (etat, detail, parRaphael) => {
        if (etat === "connexion") setStatus("processing")
        else if (etat === "ecoute") setStatus("listening")
        else if (etat === "parle") setStatus("speaking")
        else {
          liveRef.current = null
          // Une réouverture rapprochée (il rouvre juste après avoir raccroché)
          // profite d'une connexion déjà chaude plutôt que d'en rouvrir une.
          prechaufferConnexionLive()
          // « Terminé » (voix ou appui) : il vient de dire qu'il n'a plus
          // besoin de Jarvis maintenant, le mot-clé se tait un moment avant
          // de recommencer à réclamer le micro (chantier voix/écoute,
          // 7 sept.). Une fermeture par Google ou une panne (parRaphael
          // faux) n'a rien à voir avec sa volonté : elle ne déclenche rien.
          if (parRaphael) refroidissementRef.current = Date.now() + REFROIDISSEMENT_APRES_FIN_MS
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
      setPhraseARejouer(transcript)
      const enchainer = await runTurn(transcript)
      // Le tour est allé au bout : plus rien à renvoyer. On l'efface ICI et
      // pas au prochain appui, sinon un bouton « Réessayer » survivrait à une
      // commande réussie et rejouerait une action déjà faite.
      setPhraseARejouer(null)
      if (!enchainer) return

      // Même raison qu'au premier appui : la phrase d'avant ne doit pas
      // rester sous « Toi : » pendant qu'il dit la suivante. Sa réponse à
      // Jarvis, elle, reste affichée — c'est elle qui donne le contexte.
      setLastUserText(null)
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
      // LE TEXTE DU TOUR PRÉCÉDENT NE SURVIT PAS À UN NOUVEL APPUI. Sans ça,
      // « Toi : <sa phrase d'avant> » restait affiché pendant la seconde à
      // trois secondes que met Android à rendre son premier mot : il relisait
      // son ancienne phrase en croyant voir la nouvelle, et ne pouvait pas
      // savoir si celle qu'il était en train de dire était prise.
      setLastUserText(null)
      setStatus("listening")
      const transcript = nettoyer(await listen("command", { onTexte: setLastUserText }))
      await conduireConversation(transcript)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue."
      setLastReply(message)
      setStatus("error")
    }
  }

  /**
   * Renvoyer la phrase qui n'a pas abouti, sans la redicter.
   *
   * ON NE RETENTE JAMAIS TOUT SEUL, et c'est le point à ne pas défaire : le
   * 15 sept. 2026, la requête qui « a échoué » côté téléphone avait en réalité
   * reçu un `200` du serveur 310 ms plus tard. Un renvoi automatique aurait
   * exécuté la demande DEUX fois — deux chantiers, deux messages, deux
   * alarmes. C'est à Raphaël de décider, et la phrase affichée le lui dit
   * (« je ne sais pas si ta demande est passée »).
   *
   * Le renvoi repasse par `conduireConversation`, pas par un chemin à lui :
   * une seconde route finirait par ne plus exécuter les actions pareil.
   */
  async function rejouerLaPhrase() {
    const phrase = phraseARejouer
    if (!phrase) return
    priseRef.current++
    try {
      setStatus("processing")
      await conduireConversation(phrase)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue."
      setLastReply(message)
      setStatus("error")
    }
  }

  // Un appui sur le widget d'écran d'accueil doit lancer l'écoute
  // directement — pas seulement ouvrir l'app, en laissant Raphaël retoucher
  // le micro derrière. MainActivity pose le drapeau au moment de l'intent ;
  // on ne le consomme qu'une fois, au montage, sinon un retour au premier
  // plan sans rapport relancerait l'écoute.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    JarvisWidget.getPendingListen()
      .then(({ demarrer, demarreeA }) => {
        if (!demarrer) return
        // Combien de temps entre l'ouverture (widget ou appui long) et le
        // premier démarrage d'écoute — chantier 7b8e68a7 : « ça bug, ressort »
        // sans un mot capté au micro, et il n'y avait aucun moyen de savoir
        // si le micro s'ouvre trop tard pour l'entendre commencer à parler.
        if (demarreeA) {
          noterEcoute("ecoute_auto_demarree", { delai_ms: Date.now() - demarreeA })
        }
        derniersRef.current.startListening()
      })
      .catch(() => {
        // Ancienne app pas encore mise à jour, ou plugin absent : tant pis,
        // l'appui aura simplement ouvert l'app comme avant.
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleClick() {
    // Un appui est une reprise en main : il relance la veille qui avait
    // renoncé. Il ne la CONDITIONNE jamais — si le micro est toujours pris,
    // cette écoute-ci échouera et la boucle renoncera à nouveau, en le
    // disant. Poser le drapeau ici plutôt que dans chaque branche ci-dessous :
    // tous les chemins de cette fonction sont une prise en main.
    setVeilleAbandonnee(false)
    // Et le compteur repart de zéro : sans ça, la boucle relancée renoncerait
    // au premier refus suivant, puisque la ref survit maintenant au
    // remontage de l'effet.
    echecsOccupeRef.current = 0
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

  // En mode Live aussi : dire « Jarvis » ouvre la conversation. Pendant la
  // conversation, l'état n'est jamais au repos, donc la veille attend.
  const veilleActive = wakeWordEnabled && visible

  // LA VEILLE A RENONCÉ : le service de reconnaissance a refusé le micro tant
  // de fois d'affilée qu'insister ne fait plus que jouer la tonalité de
  // Samsung toutes les quatre secondes. Sa décision du 9 sept. 2026 : « il
  // vaut mieux que le micro s'arrête et qu'on réactive jarvis manuellement ».
  // L'état sert à l'AFFICHAGE et à couper la boucle ; un appui sur le cœur le
  // remet à faux, ce qui remonte la boucle (il est dans ses dépendances).
  const [veilleAbandonnee, setVeilleAbandonnee] = useState(false)
  // Relu à chaque tour de boucle, jamais capturé au montage : il change
  // depuis Paramètres pendant que la veille tourne.
  const seuilAbandonRef = useRef(seuilAbandonVeille)
  seuilAbandonRef.current = seuilAbandonVeille
  // LE COMPTEUR DE REFUS VIT HORS DE LA BOUCLE, et c'est tout ce qui fait
  // marcher `renonceApresRefus`. Mesuré le 18 sept. 2026 sur son journal :
  // `rafale_fin` portait UNE chaîne ininterrompue de 159 refus « occupe » sur
  // six heures — micro mort — pendant que la cadence repartait de 700 ms
  // toutes les 5 à 13 rafales. Le compteur était une variable LOCALE de
  // `wakeLoop`, et l'effet qui porte la boucle se remonte dès que
  // `veilleActive` change (l'app passe en arrière-plan, l'écran s'éteint, il
  // change de fenêtre). Chaque remontage le remettait à zéro : le seuil de 20
  // n'était jamais atteint, et la veille n'a pas renoncé une seule fois.
  //
  // La ref compte donc EXACTEMENT ce que le journal compte — des rafales
  // consécutives toutes refusées, sans limite de temps entre elles, puisque
  // c'est sur cette mesure-là que le seuil a été calibré (la plus longue
  // chaîne qui se rétablit toute seule fait 26). Une rafale qui N'EST PAS un
  // refus la remet à zéro : une pièce calme rend « silence », donc le
  // compteur ne monte jamais quand tout va bien.
  const echecsOccupeRef = useRef(0)

  // Une mise à jour qui s'installe suspend la veille (voir majEnCours.ts et
  // peutEcouterEnVeille). L'état sert à l'AFFICHAGE, la ref à la boucle —
  // qui est montée une fois et ne verrait jamais un état changé après coup.
  const [majEnCoursEtat, setMajEnCoursEtat] = useState(majEnCours)
  const majEnCoursRef = useRef(majEnCoursEtat)
  majEnCoursRef.current = majEnCoursEtat
  useEffect(() => {
    setMajEnCoursEtat(majEnCours())
    return sAbonnerMaj(setMajEnCoursEtat)
  }, [])
  // LES FONCTIONS APPELÉES DEPUIS UN EFFET PASSENT PAR CETTE REF, JAMAIS EN
  // DIRECT. La boucle de veille (et les deux lanceurs ci-dessous) vivent
  // dans des effets montés une seule fois : ce qu'ils appellent en direct
  // est figé au rendu où l'effet a démarré — le premier, quand les tâches,
  // chantiers et contacts n'étaient pas encore chargés. Bug réel du 4 sept.
  // 2026 : « Jarvis, quelles sont mes tâches ? » répondait « Aucune tâche
  // trouvée » avec dix-neuf tâches en base, en Live comme en classique, alors
  // qu'un appui sur le cœur (rendu courant) les voyait. Reproduit par
  // scripts/verifier-ecoute-web.mjs, banc du cœur.
  const derniersRef = useRef({ demarrerLive, conduireConversation, startListening, handleClick, resolveTranscript, executerActions })
  derniersRef.current = { demarrerLive, conduireConversation, startListening, handleClick, resolveTranscript, executerActions }
  useEffect(() => {
    if (!veilleActive || veilleAbandonnee) return
    let cancelled = false

    async function wakeLoop() {
      let echecDemarrage = false
      let rafalesMuettes = 0
      // Compte SÉPARÉMENT des rafalesMuettes : un démarrage refusé (service
      // pas encore libéré) n'a jamais eu la moindre chance d'entendre quoi
      // que ce soit, donc ne doit ni gonfler le recul du silence (une pièce
      // calme qui suit une chaîne de refus n'a pas à hériter d'un recul de
      // 8 s), ni se contenter du recul fixe qui les a mesurément laissés se
      // répéter en chaîne — voir delaiApresOccupe dans src/lib/veille.ts.
      while (!cancelled) {
        if (
          !peutEcouterEnVeille({
            actif: true,
            visible: true,
            statut: statusRef.current,
            // Relu à CHAQUE tour, pas capturé au montage : une mise à jour
            // commence après le démarrage de la boucle, pas avant.
            majEnCours: majEnCoursRef.current,
            // Relu à CHAQUE tour aussi, et depuis le natif : une conversation
            // Live ouverte dans L'AUTRE fenêtre (ProtectedShell ou
            // AssistantOverlayPage) ne se voit dans aucun état React d'ici.
            liveAilleurs: await liveActifQuelquePart(),
          }) || enRefroidissement(Date.now(), refroidissementRef.current)
        ) {
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
        echecsOccupeRef.current = echecDemarrage ? echecsOccupeRef.current + 1 : 0
        if (renonceApresRefus(echecsOccupeRef.current, seuilAbandonRef.current)) {
          // On s'arrête là, et on le DIT (voir plus bas, sous le cœur) :
          // continuer reviendrait à réclamer un micro que quelque chose
          // d'autre tient, toutes les quatre secondes, indéfiniment — mesuré
          // le 17 sept. 2026, 229 refus d'affilée sur 2 h 22 sans une seule
          // écoute réelle, pendant qu'à l'écran une pastille clignotante
          // promettait « Dis "Jarvis" quand tu veux ».
          noterEcoute("veille_abandon", {
            echecs: echecsOccupeRef.current,
            seuil: seuilAbandonRef.current,
            raison: "refus_repetes",
          })
          setStatus("idle")
          setVeilleAbandonnee(true)
          return
        }
        // Un démarrage refusé n'a rien écouté : il ne compte pas comme une
        // rafale silencieuse, sans quoi un vrai silence qui suit une chaîne
        // de refus hériterait à tort d'un recul déjà remonté à plusieurs
        // secondes.
        rafalesMuettes = echecDemarrage ? rafalesMuettes : transcript ? 0 : rafalesMuettes + 1

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
        if (modeLiveRef.current && (suite === "conversation" || suite === "oui")) {
          // Mode Live : le mot-clé ouvre la conversation, et ce qui a été
          // dit après lui part comme premier message.
          //
          // « Jarvis » seul (chantier a392a832, 17 sept.) : sa demande, mot
          // pour mot — « on regarde pas toujours l'application […] et à
          // partir du moment où c'est dispo, il dit oui, qu'est-ce qu'il y a
          // […] comme une conversation humaine ». En mode classique, ce cas
          // dit déjà « Oui ? » (voir plus bas) ; en Live, demarrerLive()
          // ouvrait la session en silence — rien ne disait qu'elle était
          // prête, donc rien ne l'invitait à parler s'il ne regardait pas
          // l'écran. Même timing que le mode classique : dit PENDANT que la
          // connexion s'ouvre, pas avant (ouvrir un jeton Live prend
          // 1 à 4 s, cf. _shared notes sur ms_jeton — le silence aurait duré
          // bien plus longtemps que pour le micro classique).
          if (suite === "oui") void speak("Oui ?", voiceIndex ?? undefined)
          await derniersRef.current.demarrerLive(suite === "conversation" ? demande : undefined)
        } else if (suite === "conversation") {
          // « Jarvis, ajoute une tâche » : la demande est déjà là.
          priseRef.current++
          setStatus("idle")
          await derniersRef.current.conduireConversation(demande)
        } else if (suite === "oui") {
          // « Jarvis » seul : on dit « Oui ? » PENDANT que le micro s'ouvre,
          // pas avant. Le service met une bonne demi-seconde à démarrer, la
          // confirmation en dure autant : les deux en même temps, c'est une
          // seconde de moins avant que Raphaël puisse parler.
          bargeInRef.current = false
          void speak("Oui ?", voiceIndex ?? undefined)
          await derniersRef.current.startListening(sansAccuse)
        } else {
          setStatus("idle")
        }
        if (!cancelled) {
          const delai = echecDemarrage
            ? delaiApresOccupe(echecsOccupeRef.current)
            : delaiAvantRafaleSuivante(false, rafalesMuettes)
          // CE QUE LA BOUCLE PENSE, pas ce que le journal déduit. Mesuré le
          // 18 sept. 2026 : `rafale_fin` montrait UNE chaîne ininterrompue de
          // 159 refus « occupe » sur six heures, et pourtant la cadence
          // repartait de 700 ms toutes les 5 à 13 rafales — donc
          // le compteur de refus retombait à zéro, et le seuil de 20
          // (`renonceApresRefus`) n'était JAMAIS atteint. Impossible de dire
          // POURQUOI depuis la base : `echecDemarrage` et le compteur ne sont
          // écrits nulle part, on ne pouvait que les déduire des écarts entre
          // deux rafales — et un écart porte aussi le temps de la relève.
          // Même méthode que `ms_ouverture`/`ms_premier_mot` (15 sept.) : on
          // mesure d'abord, on recode ensuite.
          //
          // SEULEMENT PENDANT UNE CHAÎNE DE REFUS : une pièce calme n'écrit
          // rien du tout, sinon on doublerait le volume de `journal_ecoute`
          // pour la situation normale.
          if (echecDemarrage) {
            // NE REMETS PAS ICI UNE SONDE `isListening()` DU PLUGIN pour
            // savoir qui tient le micro. Essayé le 18 sept. 2026 au matin,
            // et c'était un CONTRÔLE MORT : `onError` du plugin appelle
            // `stopListening()`, qui met son drapeau `listening` à faux — au
            // moment où on lirait la sonde, juste après un démarrage refusé,
            // elle vaut donc faux PAR CONSTRUCTION. Mesuré : 69 refus, 69
            // fois `false`, ce qui se lit comme « ce n'est pas nous » alors
            // que ça ne dit rien du tout. Trancher demande de savoir si le
            // micro BRUT est libre (une tentative d'`AudioRecord` côté
            // natif) — donc une vraie APK, et un cadrage avec Raphaël.
            noterEcoute("veille_recul", {
              echecs: echecsOccupeRef.current,
              muettes: rafalesMuettes,
              delai_ms: delai,
              seuil: seuilAbandonRef.current,
            })
          }
          await new Promise((r) => setTimeout(r, delai))
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
        // Le micro était réellement ouvert au moment où l'app a perdu le
        // premier plan (document.visibilityState, lu en direct plutôt que
        // via `visible` : cette fermeture peut aussi venir d'ailleurs, par
        // exemple le mot-clé désactivé depuis Paramètres pendant que l'app
        // reste affichée, et ce cas-là n'a rien d'un conflit). Voir
        // focusPerduPendantEcoute dans veille.ts pour le détail du
        // raisonnement et sa limite connue (l'écran partagé, une fenêtre
        // d'assistance par-dessus une autre app, ne se voient pas d'ici).
        if (focusPerduPendantEcoute(statusRef.current, document.visibilityState === "hidden")) {
          setVeilleAbandonnee(true)
          noterEcoute("veille_abandon", { raison: "focus_perdu" })
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veilleActive, veilleAbandonnee])

  // L'ANNONCE d'un message programmé (messages_programmes, chantier
  // ed32cbcc) : Jarvis le dit de lui-même la prochaine fois qu'il a la
  // parole. PAS une notification — sa réponse du 4 sept. à la fiche « Quand
  // Jarvis doit te déranger » est NON à ça pour ce cas précis (voir l'en-tête
  // de src/lib/notifications/prefs.ts) : l'annonce ne vit que dans une
  // conversation active, app ouverte, jamais par une alerte système. La
  // décision (quand, quoi) est dans messageAnnonce.ts, pure ; ici on ne fait
  // que la brancher, en vérifiant périodiquement pendant que l'app tourne.
  //
  // MÊME REF, MÊME RAISON que derniersRef juste au-dessus : l'intervalle est
  // monté une seule fois, ce qu'il lirait en direct serait figé au premier
  // rendu (tâches, contacts pas encore chargés).
  const annonceMessageRef = useRef({
    contacts: contactsApi.contacts,
    speak,
    muted: voiceSettingApi.muted,
    voiceIndex,
  })
  annonceMessageRef.current = { contacts: contactsApi.contacts, speak, muted: voiceSettingApi.muted, voiceIndex }
  const derniereAnnonceMessageRef = useRef<number | null>(null)
  // Verrou simple : `messagesAAnnoncer()` est un aller-retour réseau, et sans
  // lui deux tours de l'intervalle pourraient s'y engager en même temps
  // (l'un n'ayant pas encore posé `derniereAnnonceMessageRef` que l'autre
  // aurait pu lire) — annonçant deux fois le même message.
  const annonceEnCoursRef = useRef(false)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let annule = false

    async function verifier() {
      if (annule || annonceEnCoursRef.current) return
      const courant = annonceMessageRef.current
      if (
        !peutAnnoncerMaintenant({
          statut: statusRef.current,
          voixCoupee: courant.muted,
          derniereAnnonceIlYA_ms:
            derniereAnnonceMessageRef.current === null ? null : Date.now() - derniereAnnonceMessageRef.current,
        })
      ) {
        return
      }

      annonceEnCoursRef.current = true
      try {
        await annoncerSiDu(courant)
      } finally {
        annonceEnCoursRef.current = false
      }
    }

    async function annoncerSiDu(courant: (typeof annonceMessageRef)["current"]) {
      let dus: Awaited<ReturnType<typeof messagesProgrammesApi.messagesAAnnoncer>>
      try {
        dus = await messagesProgrammesApi.messagesAAnnoncer()
      } catch {
        return
      }
      if (annule) return
      const prochain = prochainMessageAAnnoncer(dus, new Date())
      if (!prochain) return

      derniereAnnonceMessageRef.current = Date.now()
      try {
        await messagesProgrammesApi.marquerAnnonce(prochain.id)
      } catch {
        // Sans conséquence : l'annonce a quand même lieu, et « annule »
        // n'a besoin que du texte et du destinataire, pas de ce marquage.
      }

      const dit = phraseAnnonceMessage(prochain)
      setLastUserText(null)
      setLastReply(dit)
      setStatus("speaking")
      bargeInRef.current = false
      await courant.speak(dit, courant.voiceIndex ?? undefined)
      if (annule || bargeInRef.current) {
        if (!annule) setStatus("idle")
        return
      }

      // Sans destinataire (le nom s'est perdu en programmant), l'annonce
      // vient de dire où le choisir : on ne prépare RIEN (chantier a122a936).
      if (!prochain.telephone && destinataireManquant(prochain.destinataire)) {
        if (!annule) setStatus("idle")
        return
      }

      // Prépare VRAIMENT le brouillon (WhatsApp/SMS) — c'est ce même
      // brouillon que « envoie-le », « remplace X par Y » et « relis-le
      // moi » (déjà reconnus juste au-dessus pour un message préparé à
      // l'oral) sauront retrouver, sans rien inventer de plus.
      const action: ActionTelephone = {
        action: "send_message",
        message_text: prochain.texte,
        contact_id: prochain.contact_id ?? undefined,
        // LE NUMÉRO VÉRIFIÉ AU MOMENT DE PROGRAMMER, quand on l'a (chantier
        // a122a936) : c'est lui qui « garantit » le destinataire — on ne
        // redevine pas à l'heure dite ce qui a été tranché devant lui.
        phone_number: prochain.telephone ?? undefined,
        // Sinon (message d'avant ce correctif, ou contact resté « à
        // vérifier ») : `destinataire` — ce qu'il a dit à l'oral — sert à le
        // retrouver dans le répertoire, exactement comme contact_name ailleurs.
        // Avec un numéro, il ne sert plus qu'à NOMMER le destinataire.
        contact_name: prochain.contact_id ? undefined : (prochain.contact_nom ?? prochain.destinataire),
        message_channel: prochain.canal ?? undefined,
      }
      // sauterFenetre: l'annonce qu'on vient de dire EST déjà la
      // confirmation (même principe que la relecture avant ouverture,
      // confirmationEnvoiVocale.ts) : la fenêtre d'annulation passive
      // redirait une seconde phrase, suivie d'un silence, pour rien.
      let reponsePreparation: string
      try {
        reponsePreparation = await executerActionTelephone(action, courant.contacts, { sauterFenetre: true })
      } catch {
        reponsePreparation = "Je n'ai pas réussi à préparer ce message."
      }
      marquerMessagePrepareCommeProgramme(prochain.id)
      retenirLeTour(dit, [action], reponsePreparation)

      setLastReply(reponsePreparation)
      if (!annule) setStatus("idle")
    }

    const id = setInterval(() => void verifier(), 45_000)
    return () => {
      annule = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ouverture avec ?mic=1 (ex: depuis un widget ou le bouton latéral
  // réassigné, Phase 3) : lance directement l'écoute sans avoir à taper
  // sur le bouton.
  const [searchParams, setSearchParams] = useSearchParams()
  const autoStarted = useRef(false)
  useEffect(() => {
    if (searchParams.get("mic") === "1" && !autoStarted.current) {
      autoStarted.current = true
      setSearchParams({}, { replace: true })
      derniersRef.current.handleClick()
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
          {phraseEcoute({ pret: micReady, aDuTexte: !!lastUserText, attenteDepassee })}
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
      {/* LE QUOTA, À CÔTÉ DU CŒUR — sa demande, « leger ». Une ligne, jamais
          une carte : celle-là existe déjà dans Paramètres, et la redoubler ici
          serait la redondance qu'il refuse. Ce qu'on met sous le cœur est un
          repère, de quoi lever les yeux — pas de quoi analyser.

          SEULEMENT AU REPOS : pendant qu'il parle ou que Jarvis répond,
          l'écran doit dire ce qui se passe, pas une statistique. Et
          `pastilleQuota` se tait d'elle-même quand il n'y a rien à dire — pas
          encore lu, aucune phrase aujourd'hui, ou un simple refus par minute
          qui se lève tout seul en soixante secondes. */}
      {(status === "idle" || status === "wake-listening") &&
        (() => {
          const pastille = pastilleQuota(consommation)
          if (!pastille) return null
          return (
            <p
              data-quota={pastille.ton}
              className={cn(
                "text-[11px]",
                pastille.ton === "rouge"
                  ? "font-medium text-destructive"
                  : pastille.ton === "orange"
                    ? "font-medium text-amber-600 dark:text-amber-500"
                    : "text-muted-foreground",
              )}
            >
              {pastille.texte}
            </p>
          )
        })()}
      {/* Tant que le mot-clé est activé, on le dit — même entre deux rafales
          d'écoute. Raphaël signalait le 3 sept. qu'il ne savait jamais ce qui
          était réellement actif : un indicateur qui n'apparaît qu'une fraction
          du temps revient à ne rien indiquer. */}
      {wakeWordEnabled && (status === "wake-listening" || status === "idle") && (
        veilleAbandonnee ? (
          // La pastille clignotante disait « Dis "Jarvis" quand tu veux »
          // pendant que le micro était pris — mesuré le 17 sept. 2026 :
          // 2 h 22 à le promettre sans qu'une seule écoute s'ouvre. Ce qu'on
          // affiche ici n'accuse rien qu'on n'ait pas constaté : depuis le
          // téléphone, on sait que le service a refusé, pas QUI le tient.
          <p className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-destructive">
              Le micro est pris par autre chose — j'ai arrêté d'insister.
            </span>
            <span>Touche le cœur pour reprendre.</span>
          </p>
        ) : majEnCoursEtat ? (
          // Le DIRE plutôt que de rester muet : une veille suspendue sans un
          // mot se lit exactement comme un mot-clé qui ne marche pas — le
          // défaut qu'il signalait le 3 sept. (« je ne sais jamais ce qui est
          // réellement actif »).
          <p className="text-xs text-muted-foreground">
            Mise à jour en cours — je me remets à l'écoute juste après.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            {modeLive ? "Dis « Jarvis » pour lancer la conversation" : "Dis « Jarvis » quand tu veux"}
          </p>
        )
      )}
      {(lastUserText || lastReply) && (
        <div className="flex max-w-xs flex-col items-center gap-2 text-center text-sm">
          {lastUserText && <p className="text-muted-foreground">Toi : {lastUserText}</p>}
          {lastReply && <p>Jarvis : {lastReply}</p>}
          {/* Le seul chemin pour ne pas redicter ce qui n'a pas abouti. Il ne
              s'affiche QUE sur un échec : proposer « Réessayer » après une
              commande réussie inviterait à la faire deux fois. */}
          {status === "error" && phraseARejouer && (
            <Button size="sm" variant="outline" onClick={() => void rejouerLaPhrase()}>
              Réessayer sans redicter
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
