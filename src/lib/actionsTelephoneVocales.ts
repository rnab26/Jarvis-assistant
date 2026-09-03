import { Capacitor } from "@capacitor/core"
import { ActionsTelephone, trouverApplication, type CommandeMedia } from "@/lib/actionsTelephone"
import { ecrireReglage } from "@/lib/reglages"
import type { Contact } from "@/types/database"

/** Les catégories du téléphone où Jarvis doit choisir une application sans
 * qu'on la lui nomme à chaque fois — apprises une fois, retenues ensuite. */
export type CategorieAppTelephone = "musique" | "navigation" | "messages" | "ia"

/** Les actions vocales qui sortent de Jarvis pour aller dans une autre app. */
export type ActionTelephone =
  | { action: "open_app"; app_name?: string; music_query?: string }
  | {
      action: "send_message"
      message_channel?: "whatsapp" | "sms"
      message_text: string
      contact_id?: string
      phone_number?: string
    }
  | { action: "call_contact"; contact_id?: string; phone_number?: string }
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
export const CLES_APP: Record<"musique" | "navigation" | "ia", string> = {
  musique: "jarvis_app_musique",
  navigation: "jarvis_app_navigation",
  ia: "jarvis_app_ia",
}
export const CLE_CANAL_MESSAGES = "jarvis_canal_messages"

/** L'application que Raphaël a retenue pour la musique, la navigation ou une
 * IA tierce, si on la lui a déjà demandée une fois. Lu par MicButton pour
 * savoir s'il faut la lui demander avant d'exécuter — seule source de
 * vérité pour "quelle app pour X", avec CLES_APP ci-dessus. */
export function appPreferee(categorie: "musique" | "navigation" | "ia"): string | null {
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
        let nomCible = action.app_name || (action.music_query ? appPreferee("musique") ?? undefined : undefined)

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

        await ActionsTelephone.ouvrirApplication({ paquet, recherche: action.music_query })
        if (action.music_query) {
          return nomAffiche
            ? `Je lance ${action.music_query} sur ${nomAffiche}.`
            : `Je lance ${action.music_query}.`
        }
        return `J'ouvre ${nomAffiche}.`
      }

      case "send_message": {
        // Sans canal précisé ("envoie un message à Dylan..."), utiliser celui
        // retenu — MicButton l'a demandé une fois s'il n'était pas encore
        // connu. "whatsapp" reste le repli si on arrive quand même ici sans
        // rien savoir (ex. le tour de clarification a expiré).
        const canal = action.message_channel ?? canalMessagesPrefere() ?? "whatsapp"
        const numero = numeroDe(contacts, action.contact_id, action.phone_number)
        const nom = nomDe(contacts, action.contact_id)

        if (canal === "sms" && !numero) {
          return nom
            ? `Je n'ai pas le numéro de ${nom}. Dis-le-moi une fois et je le retiens.`
            : "Il me faut un numéro pour envoyer un SMS."
        }

        if (canal === "sms") {
          await ActionsTelephone.preparerSms({ texte: action.message_text, numero: numero ?? undefined })
        } else {
          await ActionsTelephone.preparerWhatsApp({
            texte: action.message_text,
            numero: numero ?? undefined,
          })
        }

        const ou = canal === "sms" ? "en SMS" : "sur WhatsApp"
        if (nom && numero) return `Message prêt pour ${nom} ${ou}, tu n'as plus qu'à envoyer.`
        if (canal === "whatsapp") return `Message écrit, WhatsApp va te demander à qui l'envoyer.`
        return `Message prêt ${ou}, tu n'as plus qu'à envoyer.`
      }

      case "call_contact": {
        const numero = numeroDe(contacts, action.contact_id, action.phone_number)
        const nom = nomDe(contacts, action.contact_id)
        if (!numero) {
          return nom
            ? `Je n'ai pas le numéro de ${nom}. Dis-le-moi une fois et je le retiens.`
            : "Il me faut un numéro pour passer l'appel."
        }
        // Première fois : on demande la permission d'appeler, pour ne pas se
        // contenter éternellement de composer alors qu'il a demandé mieux.
        await ActionsTelephone.demanderPermissionAppel().catch(() => ({ granted: false }))
        const { direct } = await ActionsTelephone.composer({ numero })
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
        return `Je pose la question à ${trouvee.nom}, tu n'as plus qu'à envoyer. Elle répondra directement là-bas, je ne peux pas te ramener sa réponse ici.`
      }
    }
  } catch (e) {
    // Le plugin renvoie déjà une phrase compréhensible ("WhatsApp n'est pas
    // installé", "aucune application d'horloge n'a répondu") : la relayer
    // telle quelle vaut mieux qu'un échec muet.
    return e instanceof Error ? e.message : "Cette action n'a pas abouti."
  }
}
