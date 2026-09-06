import { Capacitor } from "@capacitor/core"
import { ActionsTelephone, trouverApplication, type CommandeMedia } from "@/lib/actionsTelephone"
import { phraseMusique, type ResultatOuverture } from "@/lib/actionsTelephoneMusique"
import {
  annonceAction,
  delaiAnnulation,
  passeParLaFenetre,
} from "@/lib/actionsTelephoneFenetre"
import { attendreOuAnnuler } from "@/lib/actionsTelephoneToast"
import { ecrireReglage } from "@/lib/reglages"
import { noterEcoute } from "@/lib/journalEcoute"
import type { Contact } from "@/types/database"
import { noterQuestionEnvoyee } from "@/lib/questionEnAttente"
import { chercherContact } from "@/lib/chercherContact"
import { lireRepertoire } from "@/lib/repertoire"

/** Les catégories du téléphone où Jarvis doit choisir une application sans
 * qu'on la lui nomme à chaque fois — apprises une fois, retenues ensuite. */
export type CategorieAppTelephone = "musique" | "navigation" | "messages" | "ia" | "appels"

/** Les actions vocales qui sortent de Jarvis pour aller dans une autre app. */
export type ActionTelephone =
  | { action: "open_app"; app_name?: string; music_query?: string }
  | {
      action: "send_message"
      message_channel?: "whatsapp" | "sms"
      message_text: string
      contact_id?: string
      /** Le nom prononcé, quand il ne correspond à aucun contact enregistré :
       * c'est lui qu'on cherche dans le répertoire du téléphone. */
      contact_name?: string
      phone_number?: string
    }
  | { action: "call_contact"; contact_id?: string; contact_name?: string; phone_number?: string }
  | {
      action: "set_alarm"
      alarm_time?: string
      alarm_duration_seconds?: number
      alarm_label?: string | null
    }
  | { action: "navigate_to"; destination: string }
  | { action: "media_control"; media_command: CommandeMedia }
  | { action: "set_app_preference"; category: CategorieAppTelephone; app_name: string }
  | { action: "ask_ai"; question: string; app_name?: string }

const SUR_LE_TELEPHONE_SEULEMENT =
  "Ça, je ne peux le faire que depuis l'application installée sur ton téléphone — ici je n'ai pas accès à tes autres applications."

/** Exportées pour que Paramètres puisse afficher et effacer ces préférences :
 * elles étaient fixées une fois à la voix, puis invisibles et impossibles à
 * changer. Seule source de vérité pour ces clés — ne les recopie pas. */
export const CLES_APP: Record<"musique" | "navigation" | "ia" | "appels", string> = {
  musique: "jarvis_app_musique",
  navigation: "jarvis_app_navigation",
  ia: "jarvis_app_ia",
  // Ajoutée le 5 sept. 2026 au soir : sans application d'appel visée, Android
  // affiche « Terminer l'action avec… » dès que deux applications savent
  // téléphoner. Il a ZoiPer en plus du téléphone — c'était l'un des deux
  // appuis qu'il devait encore faire pour qu'un appel parte.
  appels: "jarvis_app_appels",
}
export const CLE_CANAL_MESSAGES = "jarvis_canal_messages"

/**
 * Lequel des deux WhatsApp, quand les deux sont installés.
 *
 * Raphaël, 6 sept. 2026 : « sur WhatsApp, ça prépare le message mais il n'y a
 * rien qui est envoyé » — et le message partait dans WhatsApp Business, pas
 * dans celui où il écrit. Le paquet est retenu ici plutôt que deviné : prendre
 * « la première application qui répond » est précisément ce qui a échoué.
 */
export const CLE_APP_WHATSAPP = "jarvis_app_whatsapp"

export function paquetWhatsAppPrefere(): string | null {
  try {
    return localStorage.getItem(CLE_APP_WHATSAPP)
  } catch {
    return null
  }
}

/** L'application que Raphaël a retenue pour la musique, la navigation ou une
 * IA tierce, si on la lui a déjà demandée une fois. Lu par MicButton pour
 * savoir s'il faut la lui demander avant d'exécuter — seule source de
 * vérité pour "quelle app pour X", avec CLES_APP ci-dessus. */
export function appPreferee(categorie: "musique" | "navigation" | "ia" | "appels"): string | null {
  try {
    return localStorage.getItem(CLES_APP[categorie])
  } catch {
    return null
  }
}

/** Même principe que ci-dessus, mais pour les messages : pas une app parmi
 * celles installées, un canal fixe (WhatsApp ou SMS). */
export function canalMessagesPrefere(): "whatsapp" | "sms" | null {
  try {
    const v = localStorage.getItem(CLE_CANAL_MESSAGES)
    return v === "whatsapp" || v === "sms" ? v : null
  } catch {
    return null
  }
}

const NOM_CATEGORIE: Record<CategorieAppTelephone, string> = {
  appels: "les appels",
  musique: "la musique",
  navigation: "les itinéraires",
  messages: "les messages",
  ia: "poser une question à une IA",
}

/** La question posée une seule fois par catégorie, tant qu'aucune préférence
 * n'est encore connue — lue par MicButton pour déclencher le même mécanisme
 * de clarification que la Edge Function, sans passer par elle. */
export function questionAppPreferee(categorie: CategorieAppTelephone): string {
  if (categorie === "messages") return "Tu préfères WhatsApp ou les SMS pour tes messages ?"
  return `Quelle application utilises-tu pour ${NOM_CATEGORIE[categorie]} ?`
}

/** Le numéro d'un contact, ou celui que Raphaël a dicté à voix haute. */
function numeroDe(contacts: Contact[], contactId?: string, dicte?: string): string | null {
  if (dicte && dicte.trim()) return dicte.trim()
  const contact = contacts.find((c) => c.id === contactId)
  return contact?.phone?.trim() || null
}

function nomDe(contacts: Contact[], contactId?: string): string | null {
  return contacts.find((c) => c.id === contactId)?.name ?? null
}

/**
 * Le numéro de quelqu'un, cherché dans le RÉPERTOIRE DU TÉLÉPHONE.
 *
 * Appelé seulement quand rien n'a été trouvé ailleurs : le répertoire n'est
 * lu qu'au moment où il sert, jamais copié. Rend un message tout prêt en cas
 * d'échec — et ce message distingue « je n'ai pas le droit de regarder » de
 * « je ne trouve personne à ce nom », parce que ce n'est pas la même chose à
 * faire ensuite.
 */
async function numeroDepuisTelephone(
  nomDit: string,
): Promise<{ numero: string; nom: string } | { echec: string }> {
  const lecture = await lireRepertoire()
  if (lecture.etat === "refuse") {
    return {
      echec:
        "Je n'ai pas accès à ton répertoire. Autorise les contacts pour Jarvis dans les réglages d'Android, et je trouverai les numéros tout seul.",
    }
  }
  if (lecture.etat === "indisponible") {
    return { echec: `Je n'ai pas le numéro de ${nomDit}. Dis-le-moi une fois et je le retiens.` }
  }

  const trouvaille = chercherContact(nomDit, lecture.contacts)
  if (trouvaille.etat === "trouve") {
    return { numero: trouvaille.contact.numero, nom: trouvaille.contact.nom }
  }
  if (trouvaille.etat === "ambigu") {
    const noms = trouvaille.candidats.map((c) => c.nom).join(", ")
    return { echec: `J'en trouve plusieurs dans ton répertoire : ${noms}. Lequel ?` }
  }
  return { echec: `Je ne trouve personne qui s'appelle ${nomDit} dans ton répertoire.` }
}

const MEDIA_DIT: Record<CommandeMedia, string> = {
  play_pause: "C'est fait.",
  lecture: "Je relance la musique.",
  pause: "Je mets en pause.",
  suivant: "Morceau suivant.",
  precedent: "Morceau précédent.",
  stop: "J'arrête la musique.",
}

/** "10 minutes", "1 h 30" — pour annoncer un minuteur comme on le dit. */
function dureeLisible(secondes: number): string {
  const h = Math.floor(secondes / 3600)
  const m = Math.round((secondes % 3600) / 60)
  if (h > 0) return m > 0 ? `${h} h ${m}` : `${h} heure${h > 1 ? "s" : ""}`
  if (m > 0) return `${m} minute${m > 1 ? "s" : ""}`
  return `${secondes} seconde${secondes > 1 ? "s" : ""}`
}

/**
 * Lequel des deux WhatsApp utiliser.
 *
 * « à_choisir » n'est pas un échec : c'est la seule réponse honnête quand les
 * deux sont installés et qu'il n'a rien dit. Deviner, c'est un message écrit
 * dans une application qu'il n'ouvre jamais — et il l'a vécu.
 */
async function quelWhatsApp(): Promise<
  { etat: "ok"; paquet: string | null } | { etat: "a_choisir"; phrase: string }
> {
  const retenu = paquetWhatsAppPrefere()
  if (retenu) return { etat: "ok", paquet: retenu }

  let installes: { nom: string; paquet: string }[] = []
  try {
    installes = (await ActionsTelephone.listerApplicationsWhatsApp()).applications ?? []
  } catch {
    // APK antérieure à cette méthode : on garde le comportement par défaut du
    // plugin, qui vise le WhatsApp ordinaire.
    return { etat: "ok", paquet: null }
  }

  if (installes.length > 1) {
    return {
      etat: "a_choisir",
      phrase: `Tu as ${installes.map((a) => a.nom).join(" et ")} sur ton téléphone, et je ne sais pas lequel tu utilises. Choisis-le dans Paramètres, « Tes applications par défaut », et je m'en souviendrai.`,
    }
  }
  return { etat: "ok", paquet: installes[0]?.paquet ?? null }
}

/**
 * Ce que l'annonce nomme : l'application, la personne, la destination.
 *
 * C'est le seul mot qui permet de repérer une commande mal entendue.
 * « J'ouvre une application » ne dit rien ; « J'ouvre מכבי » se corrige en
 * une seconde — c'est exactement ce qui est arrivé le 5 sept.
 */
function cibleAnnoncee(action: ActionTelephone, contacts: Contact[]): string | null {
  switch (action.action) {
    case "open_app":
      return action.app_name || (action.music_query ? appPreferee("musique") : null)
    case "call_contact":
    case "send_message":
      return nomDe(contacts, action.contact_id) ?? action.contact_name ?? action.phone_number ?? null
    case "navigate_to":
      return action.destination
    case "ask_ai":
      return action.app_name || appPreferee("ia")
    default:
      return null
  }
}

/**
 * Exécute une action dans une autre application du téléphone et renvoie la
 * phrase que Jarvis dira.
 *
 * Ces actions PRÉPARENT le geste sans l'accomplir : le message s'affiche prêt
 * à partir, l'appel est composé. Ce n'est pas une limite technique qu'on
 * subit — c'est le comportement voulu. Envoyer un message ou lancer un appel
 * sur une phrase mal comprise ne se rattrape pas, et la règle de Raphaël est
 * explicite : rien ne part en son nom sans son accord. L'alarme et le
 * minuteur font exception : ils ne sortent pas du téléphone et se défont d'un
 * geste, donc ils se posent directement.
 */
export async function executerActionTelephone(
  action: ActionTelephone,
  contacts: Contact[],
): Promise<string> {
  if (!Capacitor.isNativePlatform()) return SUR_LE_TELEPHONE_SEULEMENT

  // La fenêtre d'annulation, pour les seules actions qui SORTENT de Jarvis.
  // Rien n'attend son accord : le décompte fini, ça part. C'est le compromis
  // du chantier 3f3ad20b — il a écarté toute confirmation bloquante, mais
  // quatre commandes mal entendues le 5 sept. ont ouvert des applications au
  // hasard, et il n'avait aucun moyen de les arrêter.
  const attente = delaiAnnulation()
  if (attente > 0 && passeParLaFenetre(action.action)) {
    const annonce = annonceAction(action.action, cibleAnnoncee(action, contacts))
    const continuer = await attendreOuAnnuler(annonce, attente)
    if (!continuer) {
      noterEcoute("action_annulee", { action: action.action })
      return "D'accord, j'annule."
    }
  }

  try {
    switch (action.action) {
      case "open_app": {
        let paquet: string | undefined
        let nomAffiche = action.app_name ?? ""
        // "mets-moi la musique X" sans application nommée : viser celle déjà
        // retenue plutôt que de laisser Android ouvrir son sélecteur
        // ("Terminer l'action avec…") — ce n'est jamais ce qui est demandé.
        // MicButton pose la question une fois, avant d'arriver ici, quand
        // aucune n'est encore connue ; ici on ne fait qu'appliquer et
        // qu'apprendre la réponse pour la prochaine fois.
        const preferee = action.music_query ? appPreferee("musique") : null
        let nomCible = action.app_name || preferee || undefined

        if (nomCible) {
          const { applications } = await ActionsTelephone.listerApplications()
          const trouvee = trouverApplication(applications, nomCible)
          if (!trouvee) {
            return `Je ne trouve pas d'application qui s'appelle "${nomCible}" sur ton téléphone.`
          }
          paquet = trouvee.paquet
          nomAffiche = trouvee.nom
          if (action.music_query) ecrireReglage(CLES_APP.musique, trouvee.nom)
        }

        // Diagnostic : signalé par Raphaël le 4 sept. (deux demandes de suite,
        // deux applications différentes sans rapport) — de quoi voir si
        // app_name vient du modèle, de la préférence retenue, ou de rien.
        if (action.music_query) {
          noterEcoute("open_app_musique", {
            app_name_modele: action.app_name ?? null,
            preference_retenue: preferee,
            app_choisie: nomAffiche || null,
            paquet_trouve: paquet ?? null,
          })
        }

        const retour = await ActionsTelephone.ouvrirApplication({
          paquet,
          recherche: action.music_query,
        })
        if (action.music_query) {
          // Le résultat réel part aussi dans le journal : c'est la seule
          // façon de savoir, depuis ici, ce qui se passe sur SON téléphone
          // sans avoir à le lui demander. Une APK antérieure à ce correctif
          // ne renvoie rien : on le note tel quel plutôt que de supposer.
          const resultat: ResultatOuverture | "inconnu" = retour?.resultat ?? "inconnu"
          noterEcoute("musique_resultat", {
            resultat,
            requete: action.music_query,
            app_choisie: nomAffiche || null,
            paquet_trouve: paquet ?? null,
          })
          if (resultat === "inconnu") {
            return nomAffiche
              ? `Je lance ${action.music_query} sur ${nomAffiche}.`
              : `Je lance ${action.music_query}.`
          }
          return phraseMusique(resultat, action.music_query, nomAffiche || null)
        }
        return `J'ouvre ${nomAffiche}.`
      }

      case "send_message": {
        // Sans canal précisé ("envoie un message à Dylan..."), utiliser celui
        // retenu — MicButton l'a demandé une fois s'il n'était pas encore
        // connu. "whatsapp" reste le repli si on arrive quand même ici sans
        // rien savoir (ex. le tour de clarification a expiré).
        const canal = action.message_channel ?? canalMessagesPrefere() ?? "whatsapp"
        let numero = numeroDe(contacts, action.contact_id, action.phone_number)
        let nom = nomDe(contacts, action.contact_id) ?? action.contact_name ?? null

        // Le répertoire du téléphone en second recours : c'est là que vivent
        // les vrais numéros. Lu seulement s'il en manque un, jamais copié.
        if (!numero && action.contact_name) {
          const r = await numeroDepuisTelephone(action.contact_name)
          if ("numero" in r) {
            numero = r.numero
            nom = r.nom
          } else if (canal === "sms") {
            return r.echec
          }
        }

        if (canal === "sms" && !numero) {
          return nom
            ? `Je n'ai pas le numéro de ${nom}. Dis-le-moi une fois et je le retiens.`
            : "Il me faut un numéro pour envoyer un SMS."
        }

        if (canal === "sms") {
          await ActionsTelephone.preparerSms({ texte: action.message_text, numero: numero ?? undefined })
        } else {
          // LEQUEL des deux WhatsApp ? Le 6 sept. 2026, ses messages
          // partaient dans WhatsApp Business : le chemin « lien wa.me » ne
          // visait aucune application, et Android choisissait. On vise
          // maintenant celui qu'il a retenu — et quand les deux sont
          // installés sans qu'il ait choisi, on DEMANDE au lieu de prendre le
          // premier : se tromper d'application, c'est un message qui n'arrive
          // jamais, sans que rien ne le dise.
          const choix = await quelWhatsApp()
          if (choix.etat === "a_choisir") return choix.phrase
          await ActionsTelephone.preparerWhatsApp({
            texte: action.message_text,
            numero: numero ?? undefined,
            paquet: choix.paquet ?? undefined,
          })
        }

        const ou = canal === "sms" ? "en SMS" : "sur WhatsApp"
        if (nom && numero) return `Message prêt pour ${nom} ${ou}, tu n'as plus qu'à envoyer.`
        if (canal === "whatsapp") return `Message écrit, WhatsApp va te demander à qui l'envoyer.`
        return `Message prêt ${ou}, tu n'as plus qu'à envoyer.`
      }

      case "call_contact": {
        let numero = numeroDe(contacts, action.contact_id, action.phone_number)
        let nom = nomDe(contacts, action.contact_id) ?? action.contact_name ?? null

        if (!numero && action.contact_name) {
          const r = await numeroDepuisTelephone(action.contact_name)
          if ("numero" in r) {
            numero = r.numero
            nom = r.nom
          } else {
            return r.echec
          }
        }

        if (!numero) {
          return nom
            ? `Je n'ai pas le numéro de ${nom}. Dis-le-moi une fois et je le retiens.`
            : "Il me faut un numéro pour passer l'appel."
        }
        // Première fois : on demande la permission d'appeler, pour ne pas se
        // contenter éternellement de composer alors qu'il a demandé mieux.
        await ActionsTelephone.demanderPermissionAppel().catch(() => ({ granted: false }))
        // L'application d'appel qu'il a choisie, s'il en a choisi une : sans
        // elle, Android affiche son sélecteur « Terminer l'action avec… » à
        // chaque appel, et il faut un appui de plus. Même mécanisme que la
        // musique et les itinéraires — une seule carte de réglages pour les
        // quatre, pas un second chemin.
        let paquetAppel: string | undefined
        const appAppels = appPreferee("appels")
        if (appAppels) {
          const { applications } = await ActionsTelephone.listerApplications()
          paquetAppel = trouverApplication(applications, appAppels)?.paquet
        }
        const { direct } = await ActionsTelephone.composer({ numero, paquet: paquetAppel })
        const qui = nom ?? "le numéro"
        if (direct) return nom ? `J'appelle ${nom}.` : "J'appelle."
        return `J'ai composé ${qui}, appuie pour lancer l'appel — autorise les appels dans les réglages si tu veux que je le fasse directement.`
      }

      case "set_alarm": {
        const libelle = action.alarm_label ?? undefined

        if (action.alarm_duration_seconds && action.alarm_duration_seconds > 0) {
          await ActionsTelephone.mettreMinuteur({
            secondes: Math.round(action.alarm_duration_seconds),
            libelle,
          })
          const duree = dureeLisible(Math.round(action.alarm_duration_seconds))
          return libelle ? `Minuteur de ${duree} lancé pour ${libelle}.` : `Minuteur de ${duree} lancé.`
        }

        const heures = /^(\d{1,2}):(\d{2})$/.exec(action.alarm_time ?? "")
        if (!heures) return "Il me manque l'heure de l'alarme."
        const heure = Number(heures[1])
        const minute = Number(heures[2])
        if (heure > 23 || minute > 59) return "Cette heure n'existe pas, redis-la-moi."

        await ActionsTelephone.mettreAlarme({ heure, minute, libelle })
        const quand = `${heure} h${minute ? ` ${String(minute).padStart(2, "0")}` : ""}`
        return libelle ? `Alarme à ${quand} pour ${libelle}.` : `Alarme réglée à ${quand}.`
      }

      case "navigate_to": {
        // Même bug que la musique, même correctif : "geo:" sans application
        // visée fait ouvrir à Android son sélecteur dès que Waze ET Google
        // Maps sont installés. On vise l'application retenue si on la
        // connaît ; sinon MicButton l'a déjà demandée avant d'arriver ici.
        let paquet: string | undefined
        const preferee = appPreferee("navigation")
        if (preferee) {
          const { applications } = await ActionsTelephone.listerApplications()
          paquet = trouverApplication(applications, preferee)?.paquet
        }
        await ActionsTelephone.itineraire({ destination: action.destination, paquet })
        return `Je t'ouvre l'itinéraire vers ${action.destination}.`
      }

      case "media_control": {
        await ActionsTelephone.commanderMedia({ commande: action.media_command })
        return MEDIA_DIT[action.media_command] ?? "C'est fait."
      }

      case "set_app_preference": {
        // Apprentissage direct, sans attendre une commande ambiguë :
        // "utilise Waze pour la navigation", "utilise WhatsApp pour les
        // messages". Même stockage que l'apprentissage automatique — une
        // seule source de vérité, quel que soit le chemin qui l'a remplie.
        if (action.category === "messages") {
          const canal = /sms|texto/i.test(action.app_name) ? "sms" : "whatsapp"
          ecrireReglage(CLE_CANAL_MESSAGES, canal)
          return canal === "sms"
            ? "Compris, je passerai par SMS pour tes messages."
            : "Compris, je passerai par WhatsApp pour tes messages."
        }

        const { applications } = await ActionsTelephone.listerApplications()
        const trouvee = trouverApplication(applications, action.app_name)
        if (!trouvee) {
          return `Je ne trouve pas d'application qui s'appelle "${action.app_name}" sur ton téléphone.`
        }
        ecrireReglage(CLES_APP[action.category], trouvee.nom)
        return `Compris, j'utiliserai ${trouvee.nom} pour ${NOM_CATEGORIE[action.category]}.`
      }

      case "ask_ai": {
        // Jarvis ne sait pas répondre à tout, mais peut relayer la question à
        // une IA déjà installée — WhatsApp/SMS pour un message. Elle part
        // déjà écrite, prête à envoyer, comme le reste : Jarvis prépare le
        // geste, ne l'accomplit pas à sa place.
        const nomCible = action.app_name || appPreferee("ia") || undefined
        if (!nomCible) {
          return "Je ne sais pas encore à quelle IA la poser. Dis-le-moi une fois et je m'en souviendrai."
        }

        const { applications } = await ActionsTelephone.listerApplications()
        const trouvee = trouverApplication(applications, nomCible)
        if (!trouvee) {
          return `Je ne trouve pas d'application qui s'appelle "${nomCible}" sur ton téléphone.`
        }
        if (action.app_name) ecrireReglage(CLES_APP.ia, trouvee.nom)

        await ActionsTelephone.envoyerTexte({ paquet: trouvee.paquet, texte: action.question })
        // On retient la question : quand il partagera la réponse vers Jarvis
        // (menu « Partager » d'Android), useShareReceiver la rapprochera de
        // celle-ci. C'est ce qui fait l'aller-retour, sans rien payer.
        noterQuestionEnvoyee(trouvee.nom, action.question)
        return `Je pose la question à ${trouvee.nom}. Quand tu as sa réponse, appuie longuement dessus et fais « Partager » vers Jarvis : je la garde avec ta question.`
      }
    }
  } catch (e) {
    // Le plugin renvoie déjà une phrase compréhensible ("WhatsApp n'est pas
    // installé", "aucune application d'horloge n'a répondu") : la relayer
    // telle quelle vaut mieux qu'un échec muet.
    return e instanceof Error ? e.message : "Cette action n'a pas abouti."
  }
}
