import { GoogleGenAI, type LiveServerMessage, type Session } from "@google/genai"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import { noterEcoute } from "@/lib/journalEcoute"
import { LecteurAudio, capturerMicro, type CaptureMicro } from "@/lib/live/audio"
import { demandeFinDeConversation } from "@/lib/live/finConversation"
import { retourOuAveu } from "@/lib/retourVide"
import { lireClotureLive } from "@/lib/livePrefs"
import { definirLiveActifNatif } from "@/lib/live/etatLiveNatif"

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
  /** `parRaphael` n'accompagne que "fermee" : vrai quand c'est lui qui a
   * clos (appui, ou « terminé » à la voix), faux quand c'est Google ou une
   * panne — la reprise automatique ne s'applique qu'aux secondes. */
  onEtat: (etat: "connexion" | "ecoute" | "parle" | "fermee", detail?: string, parRaphael?: boolean) => void
  /**
   * Ce que Jarvis sait de Raphaël à l'ouverture : ses tâches, ses chantiers,
   * ses contacts, la date. Test du 4 sept. : sans ça, le modèle répondait
   * « je n'ai accès à rien » et se présentait comme un produit Google — il
   * n'avait aucune raison de croire qu'il était Jarvis. Donné en clair dans
   * la consigne, ça évite aussi un aller-retour serveur pour « quelles sont
   * mes tâches ? ».
   */
  contexte: string
  /** Une demande déjà entendue avant l'ouverture (« Jarvis, ajoute une
   * tâche ») : envoyée en texte dès la connexion, Jarvis y répond sans
   * qu'on la redise. */
  premierMessage?: string
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

/**
 * La consigne, le contexte et l'outil sont verrouillés DANS LE JETON par la
 * fonction live-jeton — pas ici. Vérifié le 4 sept. : avec un jeton
 * éphémère, une configuration envoyée à la connexion est ignorée par
 * Google ; Jarvis disait « je n'ai pas accès à tes tâches » alors que
 * l'app les lui donnait. L'app envoie donc son contexte à la fonction, qui
 * le scelle. Le nom de l'outil doit rester identique des deux côtés.
 */
const NOM_OUTIL = "commande_jarvis"

/** Temps laissé à la fonction serveur pour rendre un jeton. */
const JETON_MAX_MS = 15000

/**
 * Au-delà, on cesse d'attendre le micro et on ferme la conversation en le
 * disant.
 *
 * MESURÉ, PAS SUPPOSÉ (chantier ba140853, 8 sept. 2026). Sur ses 60 dernières
 * ouvertures Live, `ms_micro` est petit — 333 ms au minimum, un seul cas
 * au-dessus de deux secondes. Ce cas-là a duré **106 833 ms**, une minute
 * quarante-sept. Pendant tout ce temps la session était OUVERTE côté Google
 * et Jarvis n'entendait rien : l'écran disait « connexion », rien ne bougeait,
 * et rien n'expliquait pourquoi.
 *
 * `capturerMicro` était le seul appel de cette ouverture à n'être borné par
 * rien — le jeton l'est (JETON_MAX_MS), et partout ailleurs dans le projet les
 * appels au natif passent par `borner()`. getUserMedia peut attendre
 * indéfiniment : une fenêtre de permission restée ouverte, un micro tenu par
 * une autre application.
 *
 * Quinze secondes est large exprès : la fenêtre de permission d'Android
 * attend légitimement une réponse, et la couper trop tôt ferait échouer une
 * première ouverture parfaitement normale.
 */
const MICRO_MAX_MS = 15000

/**
 * Ouvre une session. Rend de quoi l'arrêter ; les événements arrivent au fil
 * de l'eau. Toute panne se traduit par onEtat("fermee", raison).
 */
export async function demarrerSessionLive(ev: EvenementsLive): Promise<SessionLive> {
  ev.onEtat("connexion")
  const debut = Date.now()

  // Réglable depuis Paramètres (chantier b68f3b21, 6 sept. 2026) : interrupteur,
  // liste des formules, délai d'adieu. Lu une fois à l'ouverture — un
  // changement en cours de conversation s'appliquera à la suivante, comme
  // tous les réglages relus au montage de MicButton.
  const clotureLive = lireClotureLive()
  /** `null` (pas de personnalisation) devient `undefined` : c'est ce que
   * demandeFinDeConversation() attend pour utiliser sa liste par défaut. Un
   * tableau vide, lui, reste un tableau vide — c'est la liste qu'il a choisie. */
  const formulesCloture = clotureLive.formules ?? undefined
  const clotureVocaleDemandee = (texte: string) => clotureLive.actif && demandeFinDeConversation(texte, formulesCloture)

  // LA DERNIÈRE COUPE, et elle doit fermer la question (chantier ba140853).
  //
  // Mesuré le 8 sept. 2026 sur ses deux ouvertures de 13h16 et 13h18, la
  // première fois que le découpage du serveur est remonté :
  //
  //     ms_jeton 3561 | ms_serveur 589 | auth 281 | lectures  97 | google 211
  //     ms_jeton 1684 | ms_serveur 572 | auth 251 | lectures 121 | google 200
  //
  // Le temps DANS la fonction est le même à 17 ms près. L'écart de 1877 ms est
  // entièrement dehors. Ce n'est donc ni Google, ni nos lectures, ni le
  // démarrage à froid de l'isolat — tout ça est déjà écarté, ne le recherchez
  // pas.
  //
  // Reste deux choses entre l'app et la fonction, et il faut les séparer :
  // `auth.getSession()`, que supabase-js appelle avant CHAQUE appel d'Edge
  // Function (lu dans `fetchWithAuth`, version 2.114) et qui renouvelle le
  // jeton quand il approche de l'expiration ; et le réseau lui-même, où une
  // poignée de main TCP+TLS neuve coûte une à deux secondes sur un réseau
  // mobile alors qu'une connexion réutilisée ne coûte rien.
  //
  // ON L'APPELLE DONC NOUS-MÊMES, ET ON LE CHRONOMÈTRE. Ce n'est pas un appel
  // de plus : supabase-js le refera juste après, mais sur une session déjà
  // fraîche, donc pour rien. `ms_jeton - ms_session - ms_serveur` est alors le
  // réseau pur.
  //
  // CE QU'ELLE A RENDU, RELU LE 9 SEPT. SUR SES VRAIES OUVERTURES — et il faut
  // lire ces quatre lignes en entier avant d'en conclure quoi que ce soit :
  //
  //     09-08 21:10  jeton 1393 | session 4 | serveur 569
  //     09-08 21:14  jeton 1253 | session 4 | serveur 439
  //     09-08 21:24  jeton 1497 | session 1 | serveur 601
  //     09-08 21:50  jeton 1653 | session 1 | serveur 663
  //
  // `ms_session` vaut 1 à 4 ms : `getSession()` est une lecture en mémoire,
  // pas un aller-retour réseau. Reste 810 à 989 ms hors de la fonction et hors
  // du jeton d'auth — le réseau nu.
  //
  // MAIS CES QUATRE OUVERTURES SONT TOUTES DANS LE MODE RAPIDE (1253-1653 ms).
  // IL N'EXISTE ENCORE AUCUN ÉCHANTILLON EN MODE LENT AVEC `ms_session`, donc
  // la piste du renouvellement de jeton est AFFAIBLIE, PAS MORTE : c'est
  // justement dans le cas rare qu'un renouvellement se produirait. Ne l'écarte
  // pas sur ces quatre lignes ; il faut une ouverture à ~3500-4300 ms qui porte
  // `ms_session`. Ce que la fréquence suggère (un jeton dure une heure, la
  // lenteur arrive une fois sur deux) reste un indice, pas une preuve.

  const lecteur = new LecteurAudio()
  let capture: CaptureMicro | null = null
  let session: Session | null = null
  let fermee = false
  let parRaphael = false
  let reponseEnCours = ""
  let entenduEnCours = ""
  // Raphaël a dit « terminé » : le micro ne part plus, on laisse Jarvis
  // finir sa phrase d'adieu, puis on ferme — comme s'il avait appuyé.
  let finDemandee = false
  let resoudreFin: (v: { raison?: string; parRaphael: boolean }) => void = () => {}
  const finie = new Promise<{ raison?: string; parRaphael: boolean }>((resolve) => {
    resoudreFin = resolve
  })

  /** Le micro est lancé plus bas, dès que le jeton est là — voir le bloc qui
   * l'explique. Déclaré ici parce que `fermer()`, juste en dessous, doit
   * pouvoir le rendre même s'il n'a pas encore répondu. */
  let micro: Promise<CaptureMicro> | null = null
  let microDemarreAt = 0
  let microPretAt = 0
  /** Rendre le micro quand on sort sans jamais s'en servir. `arreter()` est
   * sans effet s'il a déjà été appelé, donc l'appeler des deux côtés est sûr. */
  const rendreLeMicro = () => void micro?.then((c) => c.arreter()).catch(() => {})

  const avantSession = Date.now()
  await supabase.auth.getSession().catch(() => null)
  const msSession = Date.now() - avantSession

  // 1. Un jeton éphémère, jamais la clé.
  const { data, error } = await withTimeout(
    supabase.functions.invoke<{
      jeton: string
      modele: string
      /** Le découpage du temps passé DANS la fonction (chantier ba140853).
       * Absent d'une version déployée plus ancienne : ne rien supposer. */
      temps?: { auth: number; lectures: number; google: number; serveur: number }
    }>("live-jeton", { body: { contexte: ev.contexte } }),
    JETON_MAX_MS,
  )
  if (error || !data?.jeton) {
    const raison = error ? String((error as { message?: string }).message ?? error) : "pas de jeton"
    noterEcoute("live_echec", { etape: "jeton", detail: raison.slice(0, 120) })
    ev.onEtat("fermee", `Impossible d'ouvrir la conversation : ${raison}`)
    return { arreter: () => {}, finie: Promise.resolve({ raison, parRaphael: false }) }
  }

  // Le jeton est obtenu : on retient QUAND, pour pouvoir séparer les trois
  // temps d'une ouverture (voir live_debut plus bas).
  const jetonObtenuAt = Date.now()

  // LE MICRO PART MAINTENANT, EN MÊME TEMPS QUE LA CONNEXION À GOOGLE. Rien
  // dans `getUserMedia` ni dans `AudioContext` ne dépend de la session : la
  // seule raison pour laquelle il partait après elle est l'ordre d'écriture.
  //
  // MESURÉ, PAS SUPPOSÉ (chantier ba140853, ses 25 dernières ouvertures) :
  // `ms_micro` vaut 333 à 986 ms d'ordinaire et 2926 ms le 8 sept. à 21h10,
  // `ms_connexion` 630 à 1516 ms, et les trois segments rendaient compte
  // EXACTEMENT du total (résidu vérifié à zéro sur 60 ouvertures). Le micro
  // était donc de l'attente pure, ajoutée au reste. La mener en parallèle la
  // retire du chemin critique sans rien parier sur la cause de la lenteur
  // réseau, qui reste ouverte.
  //
  // POURQUOI PAS ENCORE PLUS TÔT, avant le jeton — et c'est le point à ne pas
  // défaire : `handleClick` (MicButton) appelle `stopListening()` SANS
  // l'attendre juste avant d'ouvrir le Live. Le service de reconnaissance
  // d'Android tient encore le micro à cet instant, et deux preneurs du même
  // micro, c'est `getUserMedia` qui échoue — soit « Le micro n'a pas répondu »
  // sur une ouverture parfaitement normale. L'aller-retour du jeton (1253 ms
  // au minimum sur ses vraies ouvertures) est le coussin qui laisse le service
  // lâcher. Rien ici ne peut le vérifier : il n'y a pas d'appareil.
  //
  // LES PAQUETS PRODUITS AVANT LA SESSION SONT PERDUS, et c'est sans
  // conséquence : `ev.onEtat("ecoute")` n'est dit qu'à la toute fin, donc
  // Raphaël n'est pas encore invité à parler — comme aujourd'hui, où le micro
  // n'est pas même ouvert. La garde qui les jette (`session?.`) existait déjà.
  microDemarreAt = Date.now()
  micro = withTimeout(
    capturerMicro((paquet) => {
      if (!fermee && !finDemandee) session?.sendRealtimeInput({ audio: { data: paquet, mimeType: "audio/pcm;rate=16000" } })
    }),
    MICRO_MAX_MS,
  ).then((c) => {
    microPretAt = Date.now()
    return c
  })
  /** Le micro peut échouer pendant qu'on ouvre encore la session : sans ce
   * `catch`, ce serait un rejet non géré. Le VRAI traitement (le message qui
   * parle du micro et pas du serveur) est plus bas, à l'`await`. */
  micro.catch(() => {})

  const fermer = (raison?: string) => {
    if (fermee) return
    fermee = true
    // `capture` est encore nul si on ferme AVANT que le micro (lancé en
    // parallèle, plus haut) ait répondu : sans `rendreLeMicro`, il resterait
    // ouvert tout seul derrière nous.
    capture?.arreter()
    rendreLeMicro()
    lecteur.fermer()
    try {
      session?.close()
    } catch {
      // déjà fermée
    }
    noterEcoute("live_fin", { duree_ms: Date.now() - debut, raison: raison ?? null, par_raphael: parRaphael, a_la_voix: finDemandee })
    // Une clôture voulue n'est pas une panne : rien à afficher.
    ev.onEtat("fermee", parRaphael ? undefined : raison, parRaphael)
    resoudreFin({ raison, parRaphael })
  }

  /** Clôture à la voix : Jarvis finit de parler, puis la session se ferme. */
  const clore = async () => {
    const limite = Date.now() + clotureLive.delaiMs
    while (!fermee && lecteur.enCours && Date.now() < limite) await new Promise((r) => setTimeout(r, 100))
    parRaphael = true
    fermer("clôture à la voix")
  }
  const surFinDemandee = () => {
    if (finDemandee) return
    finDemandee = true
    // Si Google ne rend jamais la fin du tour, on ferme quand même.
    setTimeout(() => void clore(), clotureLive.delaiMs)
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
      if (clotureVocaleDemandee(entenduEnCours)) surFinDemandee()
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
      // Ce tour est clos : ce qui a été entendu ne s'additionne pas au
      // suivant. Et si la transcription n'a jamais été marquée finie, c'est
      // ici qu'un « terminé » est reconnu.
      if (clotureVocaleDemandee(entenduEnCours)) surFinDemandee()
      entenduEnCours = ""
      if (finDemandee) void clore()
      else ev.onEtat("ecoute")
    }
    if (m.toolCall?.functionCalls?.length) {
      void (async () => {
        const reponses = []
        for (const appel of m.toolCall!.functionCalls!) {
          const demande = String((appel.args as { demande?: unknown } | undefined)?.demande ?? "")
          let resultat: string
          let vide = false
          try {
            if (!demande) {
              resultat = "Je n'ai pas compris la demande."
            } else {
              // JAMAIS DE CHAÎNE VIDE AU MODÈLE. Sans rien à rapporter il
              // comble — et le 6 sept. il a comblé en annonçant à Raphaël que
              // son message était parti. La source est corrigée dans
              // executerActions ; ce filet-ci reste parce qu'il n'y a aucune
              // raison de refaire confiance au silence.
              const brut = await ev.onCommande(demande)
              const retour = retourOuAveu(brut)
              resultat = retour.texte
              vide = retour.vide
            }
          } catch (e) {
            resultat = `Ça n'a pas marché : ${e instanceof Error ? e.message : String(e)}`
          }
          // `vide` est noté comme un DÉFAUT, pas comme un cas normal : c'est
          // par cette ligne qu'on retrouvera l'action muette.
          noterEcoute("live_commande", { demande: demande.slice(0, 80), resultat: resultat.slice(0, 80), vide })
          reponses.push({ id: appel.id, name: appel.name ?? NOM_OUTIL, response: { resultat } })
        }
        if (!fermee) session?.sendToolResponse({ functionResponses: reponses })
      })()
    }
    if (m.goAway) fermer("Google a demandé de fermer la session.")
  }

  // Quelle étape a échoué, pour que `live_echec` ne dise plus « connexion »
  // quand c'est le micro. Tout ce chantier consiste à savoir OÙ le temps
  // passe : un journal qui range deux pannes différentes sous le même nom
  // fait perdre exactement ce qu'on essaie de gagner.
  let etape = "connexion"

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
      // Rien ici : tout est dans le jeton (voir NOM_OUTIL).
      config: {},
    })

    const connectee = Date.now()

    // 3. Le micro, en continu. Google décide du reste.
    //
    // BORNÉ : voir MICRO_MAX_MS. Une conversation ouverte où le micro n'est
    // jamais venu est le pire des états — elle a l'air de marcher. Sa règle
    // du 6 sept. vaut ici comme ailleurs : on ne laisse pas croire qu'on
    // écoute quand on n'écoute pas.
    etape = "micro"
    // Le micro a été LANCÉ tout en haut, avant le jeton (voir le bloc qui
    // l'explique). Ici on ne fait plus que l'attendre : d'ordinaire il est
    // déjà prêt, et cet `await` ne coûte rien.
    const avantAttenteMicro = Date.now()
    capture = await micro!.catch(() => {
      // ET PAS LE MESSAGE DE `withTimeout`, qui parle du SERVEUR : « Le
      // serveur ne répond pas, vérifie ta connexion » enverrait chercher une
      // panne de réseau alors que c'est le micro qui n'est jamais venu. Un
      // diagnostic faux coûte plus cher qu'une absence de diagnostic.
      throw new Error("Le micro n'a pas répondu. Une autre application le tient peut-être.")
    })
    // `contexte` : la taille de ce que Jarvis sait à l'ouverture. Zéro ou
    // presque = une conversation aveugle (bug du 4 sept.), à voir d'ici.
    //
    // LES TROIS TEMPS SÉPARÉMENT, et c'est le point (chantier ba140853).
    // Raphaël dit le Live « beaucoup plus lent » dans l'app que sur le web,
    // avec le début de phrase perdu. Or `delai_ms` seul ne permet PAS de le
    // constater : mesuré le 5 sept. sur le journal réel, sa médiane est de
    // 3370 ms dans l'app contre 3269 ms sur le web — la même. Le total ne
    // dit pas OÙ le temps passe, et ces trois étapes n'ont aucune raison de
    // se comporter pareil dans une WebView Android :
    //   ms_jeton    — notre Edge Function (réseau, démarrage à froid) ;
    //   ms_connexion — le WebSocket jusqu'à Google ;
    //   ms_micro    — getUserMedia + AudioContext, le seul des trois qui
    //                 dépend vraiment de la WebView, et le seul pendant
    //                 lequel Jarvis a l'air ouvert sans rien capter — donc
    //                 le suspect nº 1 pour le début de phrase perdu.
    // Sans ces trois nombres, la prochaine session en serait réduite à
    // deviner, comme celle-ci.
    noterEcoute("live_debut", {
      modele: data.modele,
      delai_ms: Date.now() - debut,
      ms_jeton: jetonObtenuAt - debut,
      // LE DÉCOUPAGE DE `ms_jeton`, rendu par la fonction elle-même. Sur ses
      // 25 dernières ouvertures (6-7 sept.), ms_jeton est BIMODAL : ~1200 à
      // 1900 ms, ou ~3500 à 4300 ms, presque rien entre les deux. Une marche
      // pareille a une cause, et il fallait savoir laquelle des cinq étapes
      // la porte. `ms_serveur` est le temps dans la fonction ; la différence
      // avec ms_jeton est le réseau du téléphone plus le démarrage à froid de
      // l'isolat, qu'on ne peut pas chronométrer de l'intérieur.
      ms_serveur: data.temps?.serveur ?? null,
      // Voir le bloc au-dessus de l'appel : la dernière coupe de ms_jeton.
      ms_session: msSession,
      ms_auth: data.temps?.auth ?? null,
      ms_lectures: data.temps?.lectures ?? null,
      ms_google: data.temps?.google ?? null,
      ms_connexion: connectee - jetonObtenuAt,
      // ATTENTION EN RELISANT CES NOMBRES : depuis le 9 sept. 2026, les trois
      // segments ne s'additionnent PLUS pour faire `delai_ms`. Le micro part
      // en même temps que le jeton, donc `ms_micro` (sa durée propre) recouvre
      // les deux autres. Ce qu'il coûte VRAIMENT sur le chemin critique, c'est
      // `ms_micro_attente` : ce qu'on a encore attendu une fois la session
      // ouverte. Il doit être proche de zéro ; s'il ne l'est pas, le micro est
      // plus lent que les deux allers-retours réseau réunis, et c'est lui le
      // sujet. Une ouverture sans `ms_micro_attente` est d'AVANT ce changement
      // et se lit avec l'ancienne règle.
      ms_micro: microPretAt ? microPretAt - microDemarreAt : null,
      ms_micro_attente: Date.now() - avantAttenteMicro,
      premier: ev.premierMessage ? 1 : 0,
      contexte: ev.contexte.length,
    })
    ev.onEtat("ecoute")
    if (ev.premierMessage) {
      ev.onEntendu(ev.premierMessage, true)
      session.sendClientContent({ turns: ev.premierMessage, turnComplete: true })
    }
  } catch (e) {
    const raison = e instanceof Error ? e.message : String(e)
    noterEcoute("live_echec", { etape, detail: raison.slice(0, 120) })
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

  // Le drapeau natif couvre TOUTE la durée de la conversation maintenue, y
  // compris les reconnexions transparentes de Google : sans ce wrapper, un
  // simple rechargement de session ferait retomber le drapeau à faux pour
  // quelques centaines de ms à chaque fois. Voir etatLiveNatif.ts —
  // c'est ce qui manquait pour que la boucle de veille de l'AUTRE fenêtre
  // (ProtectedShell/AssistantOverlayPage) sache qu'une conversation Live
  // tourne ici et se taise, au lieu de continuer à réclamer le micro toutes
  // les ~7-8 s pendant qu'on parle ailleurs.
  definirLiveActifNatif(true)

  const boucle = async () => {
    try {
      while (!arretDemande) {
        const debut = Date.now()
        courante = await demarrerSessionLive({
          ...ev,
          premierMessage: reconnexions === 0 ? ev.premierMessage : undefined,
          onEtat: (etat, detail, parRaphael) => {
            // La fermeture par Google est absorbée ici : le cœur reste sur
            // « conversation en cours » pendant qu'on rouvre. Pas celle de
            // Raphaël (appui ou « terminé ») : elle est définitive.
            if (etat === "fermee" && !parRaphael && !arretDemande && !detail && Date.now() - debut >= DUREE_MIN_POUR_RECONNECTER_MS && reconnexions < RECONNEXIONS_MAX) {
              ev.onEtat("connexion")
              return
            }
            ev.onEtat(etat, detail, parRaphael)
          },
        })
        const fin = await courante.finie
        if (arretDemande || fin.parRaphael) return
        const duree = Date.now() - debut
        if (fin.raison || duree < DUREE_MIN_POUR_RECONNECTER_MS || reconnexions >= RECONNEXIONS_MAX) return
        reconnexions++
        noterEcoute("live_reconnexion", { numero: reconnexions, apres_ms: duree })
      }
    } finally {
      definirLiveActifNatif(false)
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
