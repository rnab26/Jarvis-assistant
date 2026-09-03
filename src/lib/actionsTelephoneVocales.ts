import { Capacitor } from "@capacitor/core"
import { ActionsTelephone, trouverApplication, type CommandeMedia } from "@/lib/actionsTelephone"
import type { Contact } from "@/types/database"

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

const SUR_LE_TELEPHONE_SEULEMENT =
  "Ça, je ne peux le faire que depuis l'application installée sur ton téléphone — ici je n'ai pas accès à tes autres applications."

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

        if (action.app_name) {
          const { applications } = await ActionsTelephone.listerApplications()
          const trouvee = trouverApplication(applications, action.app_name)
          if (!trouvee) {
            return `Je ne trouve pas d'application qui s'appelle "${action.app_name}" sur ton téléphone.`
          }
          paquet = trouvee.paquet
          nomAffiche = trouvee.nom
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
        const canal = action.message_channel ?? "whatsapp"
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
        await ActionsTelephone.itineraire({ destination: action.destination })
        return `Je t'ouvre l'itinéraire vers ${action.destination}.`
      }

      case "media_control": {
        await ActionsTelephone.commanderMedia({ commande: action.media_command })
        return MEDIA_DIT[action.media_command] ?? "C'est fait."
      }
    }
  } catch (e) {
    // Le plugin renvoie déjà une phrase compréhensible ("WhatsApp n'est pas
    // installé", "aucune application d'horloge n'a répondu") : la relayer
    // telle quelle vaut mieux qu'un échec muet.
    return e instanceof Error ? e.message : "Cette action n'a pas abouti."
  }
}
