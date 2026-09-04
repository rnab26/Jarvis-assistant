import { GoogleGenAI, Modality, Type, type FunctionDeclaration, type LiveServerMessage, type Session } from "@google/genai"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import { noterEcoute } from "@/lib/journalEcoute"
import { LecteurAudio, capturerMicro, type CaptureMicro } from "@/lib/live/audio"

/**
 * Une conversation Live avec Gemini : l'audio part en continu, Google décide
 * quand Raphaël a fini de parler, répond en voix, et se tait s'il le coupe.
 *
 * Ce qu'on ne réécrit PAS ici : la détection de voix, la fin de tour,
 * l'interruption, la transcription. C'était tout l'objet du mode « micro fait
 * main » et de ses rustines (décision de Raphaël du 4 sept. : prototype en
 * parallèle, derrière un réglage).
 *
 * Ce qui reste à Jarvis : ses ACTIONS. Le modèle Live ne connaît qu'un outil,
 * `commande_jarvis`, qu'il appelle avec la demande telle qu'elle a été dite ;
 * l'app la traite exactement comme une commande dictée (règles locales, puis
 * voice-command), et rend au modèle ce qu'il doit dire. Une seule source de
 * vérité pour ce que Jarvis sait faire.
 */

export interface EvenementsLive {
  /** Ce que Raphaël a dit, transcrit par Google (peut arriver par morceaux). */
  onEntendu: (texte: string, fini: boolean) => void
  /** Ce que Jarvis répond, transcrit (par morceaux). */
  onReponse: (texte: string, fini: boolean) => void
  /** Une demande à exécuter par l'app ; rend la phrase à dire. */
  onCommande: (demande: string) => Promise<string>
  onEtat: (etat: "connexion" | "ecoute" | "parle" | "fermee", detail?: string) => void
  /**
   * Ce que Jarvis sait de Raphaël à l'ouverture : ses tâches, ses chantiers,
   * ses contacts, la date. Test du 4 sept. : sans ça, le modèle répondait
   * « je n'ai accès à rien » et se présentait comme un produit Google — il
   * n'avait aucune raison de croire qu'il était Jarvis. Donné en clair dans
   * la consigne, ça évite aussi un aller-retour serveur pour « quelles sont
   * mes tâches ? ».
   */
  contexte: string
}

export interface SessionLive {
  arreter: () => void
  /** Se résout quand la session est close, avec la raison et qui l'a close. */
  finie: Promise<{ raison?: string; parRaphael: boolean }>
}

/** Google ferme une session audio au bout de 15 minutes (doc Live). On en
 * rouvre une sans que ça se voie, tant que c'est lui qui a coupé, pas
 * Raphaël — et jamais en boucle sur une vraie panne. */
const RECONNEXIONS_MAX = 12
/** En dessous, une fermeture par Google est une panne, pas une limite. */
const DUREE_MIN_POUR_RECONNECTER_MS = 30000

const OUTIL_COMMANDE: FunctionDeclaration = {
  name: "commande_jarvis",
  description:
    "Fait agir Jarvis : créer, modifier, supprimer ou consulter ses tâches, chantiers, contacts, documents, rappels, son agenda Google, ses mails ; mettre de la musique, appeler, préparer un message, poser une alarme, lancer un itinéraire, régler la voix. Passe la demande telle qu'elle a été dite, sans la reformuler. Ne l'appelle pas pour une simple conversation ni pour ce qui est déjà dans le contexte fourni.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      demande: { type: Type.STRING, description: "La demande, mot pour mot." },
    },
    required: ["demande"],
  },
}

const CONSIGNE_LIVE = `Tu es Jarvis, l'assistant vocal personnel de Raphaël — une application qu'il a fait développer, pas un produit Google. Si on te demande qui tu es ou où tu vis : tu es Jarvis, tu vis dans son application, et tu as accès à ses données ci-dessous.
Tu parles français, de façon courte et naturelle : c'est une conversation à voix haute, pas un texte. Une ou deux phrases suffisent presque toujours.
TU AS ACCÈS à ses tâches, ses chantiers, ses contacts, sa date du jour : ils sont dans le contexte ci-dessous, réponds directement avec. Ne dis JAMAIS « je n'ai pas accès » : si l'information n'est pas dans le contexte (agenda, mails, documents), appelle l'outil commande_jarvis avec la question telle quelle.
Quand Raphaël te demande de FAIRE quelque chose (ajouter, modifier, terminer une tâche ou un chantier, noter un rendez-vous, un rappel, appeler, envoyer un message, mettre de la musique, régler ta voix…), appelle l'outil commande_jarvis avec sa demande telle quelle, puis dis-lui simplement ce que l'outil a rendu — c'est l'outil qui fait foi, pas toi.
Pour le reste (questions générales, discussion, conseil), réponds directement.
Si tu n'as pas compris, dis-le en un mot et laisse-le reformuler.`

/** Temps laissé à la fonction serveur pour rendre un jeton. */
const JETON_MAX_MS = 15000

/**
 * Ouvre une session. Rend de quoi l'arrêter ; les événements arrivent au fil
 * de l'eau. Toute panne se traduit par onEtat("fermee", raison).
 */
export async function demarrerSessionLive(ev: EvenementsLive): Promise<SessionLive> {
  ev.onEtat("connexion")
  const debut = Date.now()

  // 1. Un jeton éphémère, jamais la clé.
  const { data, error } = await withTimeout(supabase.functions.invoke<{ jeton: string; modele: string }>("live-jeton"), JETON_MAX_MS)
  if (error || !data?.jeton) {
    const raison = error ? String((error as { message?: string }).message ?? error) : "pas de jeton"
    noterEcoute("live_echec", { etape: "jeton", detail: raison.slice(0, 120) })
    ev.onEtat("fermee", `Impossible d'ouvrir la conversation : ${raison}`)
    return { arreter: () => {}, finie: Promise.resolve({ raison, parRaphael: false }) }
  }

  const lecteur = new LecteurAudio()
  let capture: CaptureMicro | null = null
  let session: Session | null = null
  let fermee = false
  let parRaphael = false
  let reponseEnCours = ""
  let entenduEnCours = ""
  let resoudreFin: (v: { raison?: string; parRaphael: boolean }) => void = () => {}
  const finie = new Promise<{ raison?: string; parRaphael: boolean }>((resolve) => {
    resoudreFin = resolve
  })

  const fermer = (raison?: string) => {
    if (fermee) return
    fermee = true
    capture?.arreter()
    lecteur.fermer()
    try {
      session?.close()
    } catch {
      // déjà fermée
    }
    noterEcoute("live_fin", { duree_ms: Date.now() - debut, raison: raison ?? null, par_raphael: parRaphael })
    ev.onEtat("fermee", raison)
    resoudreFin({ raison, parRaphael })
  }

  const surMessage = (m: LiveServerMessage) => {
    const contenu = m.serverContent
    if (contenu?.interrupted) {
      // Raphaël a coupé Jarvis : on se tait tout de suite.
      lecteur.vider()
      reponseEnCours = ""
      ev.onEtat("ecoute")
    }
    if (contenu?.inputTranscription?.text) {
      entenduEnCours += contenu.inputTranscription.text
      ev.onEntendu(entenduEnCours, contenu.inputTranscription.finished === true)
      if (contenu.inputTranscription.finished) entenduEnCours = ""
    }
    if (contenu?.outputTranscription?.text) {
      reponseEnCours += contenu.outputTranscription.text
      ev.onReponse(reponseEnCours, false)
    }
    for (const part of contenu?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        lecteur.jouer(part.inlineData.data)
        ev.onEtat("parle")
      }
    }
    if (contenu?.turnComplete) {
      if (reponseEnCours) ev.onReponse(reponseEnCours, true)
      reponseEnCours = ""
      ev.onEtat("ecoute")
    }
    if (m.toolCall?.functionCalls?.length) {
      void (async () => {
        const reponses = []
        for (const appel of m.toolCall!.functionCalls!) {
          const demande = String((appel.args as { demande?: unknown } | undefined)?.demande ?? "")
          let resultat: string
          try {
            resultat = demande ? await ev.onCommande(demande) : "Je n'ai pas compris la demande."
          } catch (e) {
            resultat = `Ça n'a pas marché : ${e instanceof Error ? e.message : String(e)}`
          }
          noterEcoute("live_commande", { demande: demande.slice(0, 80), resultat: resultat.slice(0, 80) })
          reponses.push({ id: appel.id, name: appel.name, response: { resultat } })
        }
        if (!fermee) session?.sendToolResponse({ functionResponses: reponses })
      })()
    }
    if (m.goAway) fermer("Google a demandé de fermer la session.")
  }

  try {
    // 2. La session, ouverte par l'app elle-même avec le jeton.
    const ai = new GoogleGenAI({ apiKey: data.jeton, httpOptions: { apiVersion: "v1alpha" } })
    session = await ai.live.connect({
      model: data.modele,
      callbacks: {
        onmessage: surMessage,
        onerror: (e) => fermer(`Erreur de connexion : ${e.message || "inconnue"}`),
        onclose: (e) => fermer(e.reason ? `Session fermée : ${e.reason}` : undefined),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: `${CONSIGNE_LIVE}\n\n${ev.contexte}`,
        tools: [{ functionDeclarations: [OUTIL_COMMANDE] }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: { languageCode: "fr-FR" },
      },
    })

    // 3. Le micro, en continu. Google décide du reste.
    capture = await capturerMicro((paquet) => {
      if (!fermee) session?.sendRealtimeInput({ audio: { data: paquet, mimeType: "audio/pcm;rate=16000" } })
    })
    noterEcoute("live_debut", { modele: data.modele, delai_ms: Date.now() - debut })
    ev.onEtat("ecoute")
  } catch (e) {
    const raison = e instanceof Error ? e.message : String(e)
    noterEcoute("live_echec", { etape: "connexion", detail: raison.slice(0, 120) })
    fermer(`Impossible d'ouvrir la conversation : ${raison}`)
  }

  return {
    arreter: () => {
      parRaphael = true
      fermer()
    },
    finie,
  }
}

/**
 * Une conversation qui dure : la session est rouverte quand Google la ferme
 * (limite des 15 minutes), sans que Raphaël ait à retoucher le cœur. Il ne
 * voit qu'une conversation. Une fermeture rapide (moins de 30 s) ou répétée
 * est une panne : on s'arrête et on le dit.
 */
export async function maintenirSessionLive(ev: EvenementsLive): Promise<SessionLive> {
  let courante: SessionLive | null = null
  let arretDemande = false
  let reconnexions = 0

  const boucle = async () => {
    while (!arretDemande) {
      const debut = Date.now()
      courante = await demarrerSessionLive({
        ...ev,
        onEtat: (etat, detail) => {
          // La fermeture par Google est absorbée ici : le cœur reste sur
          // « conversation en cours » pendant qu'on rouvre.
          if (etat === "fermee" && !arretDemande && !detail && Date.now() - debut >= DUREE_MIN_POUR_RECONNECTER_MS && reconnexions < RECONNEXIONS_MAX) {
            ev.onEtat("connexion")
            return
          }
          ev.onEtat(etat, detail)
        },
      })
      const fin = await courante.finie
      if (arretDemande || fin.parRaphael) return
      const duree = Date.now() - debut
      if (fin.raison || duree < DUREE_MIN_POUR_RECONNECTER_MS || reconnexions >= RECONNEXIONS_MAX) return
      reconnexions++
      noterEcoute("live_reconnexion", { numero: reconnexions, apres_ms: duree })
    }
  }
  void boucle()

  return {
    arreter: () => {
      arretDemande = true
      courante?.arreter()
    },
    finie: Promise.resolve({ parRaphael: true }),
  }
}
