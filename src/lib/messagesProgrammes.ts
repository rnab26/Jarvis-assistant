import { supabase } from "@/lib/supabase"

/**
 * Les messages que Raphaël demande d'envoyer plus tard.
 *
 * « Jarvis renvoie un message au client de Melissa, Dylan, demain matin à 10h
 * pour lui demander où en est son chantier. »
 *
 * CE QUE CE MODULE NE FAIT PAS : envoyer. Il n'y a pas d'`envoyer()` ici, et
 * c'est volontaire. Décision de Raphaël du 3 sept. : on reste sur le téléphone,
 * rien ne part sans qu'il appuie. À l'heure dite, Jarvis parle, annonce le
 * message, et attend sa réponse. Le geste d'envoi lui-même appartient à
 * actionsTelephone (ouverture de WhatsApp ou des SMS avec le texte déjà écrit).
 *
 * `marquerAnnonce` et `marquerEnvoye` sont donc deux étapes distinctes : un
 * message annoncé qu'il n'a pas validé ne doit jamais compter comme envoyé,
 * sinon il disparaît de sa liste sans être parti.
 */

export type StatutMessage = "prevu" | "annonce" | "envoye" | "annule"

/** Tous les statuts — pour l'écran « Programmé » (chantier 0c0193e3), qui
 * doit TOUT montrer, à la différence de `listerMessagesProgrammes()` appelée
 * sans argument (« qu'ai-je en attente ? »), qui ne veut que ce qui reste à
 * traiter. */
export const TOUS_LES_STATUTS: StatutMessage[] = ["prevu", "annonce", "envoye", "annule"]

/** Ce que l'écran affiche pour chaque statut. */
export function libelleStatut(statut: StatutMessage): string {
  switch (statut) {
    case "prevu":
      return "Prévu"
    case "annonce":
      return "Annoncé"
    case "envoye":
      return "Envoyé"
    case "annule":
      return "Annulé"
  }
}

export type MessageProgramme = {
  id: string
  canal: "whatsapp" | "sms" | null
  contact_id: string | null
  /** Toujours la façon dont il l'a nommé à l'oral — c'est ce qu'on lui relit. */
  destinataire: string
  texte: string
  envoyer_a: string
  statut: StatutMessage
  annonce_a: string | null
  created_at: string
}

const CHAMPS =
  "id, canal, contact_id, destinataire, texte, envoyer_a, statut, annonce_a, created_at"

export async function programmerMessage(entree: {
  destinataire: string
  texte: string
  envoyer_a: string
  /** Absent tant qu'il ne l'a pas dit : le canal se tranche au moment d'envoyer. */
  canal?: "whatsapp" | "sms" | null
  contact_id?: string | null
}): Promise<MessageProgramme | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data, error } = await supabase
    .from("messages_programmes")
    .insert({
      user_id: auth.user.id,
      destinataire: entree.destinataire,
      texte: entree.texte,
      envoyer_a: entree.envoyer_a,
      canal: entree.canal ?? null,
      contact_id: entree.contact_id ?? null,
    })
    .select(CHAMPS)
    .single()

  if (error) throw new Error(error.message)
  return data as MessageProgramme
}

/** Ce qu'il a en attente, le plus proche d'abord — pour « qu'est-ce que tu dois
 * envoyer pour moi ? ». */
export async function listerMessagesProgrammes(
  statuts: StatutMessage[] = ["prevu", "annonce"],
): Promise<MessageProgramme[]> {
  const { data, error } = await supabase
    .from("messages_programmes")
    .select(CHAMPS)
    .in("statut", statuts)
    .order("envoyer_a", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as MessageProgramme[]
}

/**
 * Ce que le téléphone doit annoncer maintenant. `marge` couvre le cas où
 * l'app était fermée à l'heure dite : un message prévu à 10h et retrouvé à
 * 10h20 vaut encore la peine d'être annoncé, un message d'avant-hier non.
 */
export async function messagesAAnnoncer(marge = 6 * 60 * 60 * 1000): Promise<MessageProgramme[]> {
  const maintenant = Date.now()
  const { data, error } = await supabase
    .from("messages_programmes")
    .select(CHAMPS)
    .eq("statut", "prevu")
    .lte("envoyer_a", new Date(maintenant).toISOString())
    .gte("envoyer_a", new Date(maintenant - marge).toISOString())
    .order("envoyer_a", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as MessageProgramme[]
}

/** Jarvis vient de le lui présenter. Il n'a pas encore répondu. */
export async function marquerAnnonce(id: string): Promise<void> {
  const { error } = await supabase
    .from("messages_programmes")
    .update({ statut: "annonce", annonce_a: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

/** Il a validé ET le message est parti de son téléphone. Pas avant. */
export async function marquerEnvoye(id: string): Promise<void> {
  const { error } = await supabase
    .from("messages_programmes")
    .update({ statut: "envoye" })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

export async function annulerMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from("messages_programmes")
    .update({ statut: "annule" })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

export type ModificationMessage = Partial<{
  destinataire: string
  contact_id: string | null
  canal: "whatsapp" | "sms" | null
  texte: string
  envoyer_a: string
}>

/**
 * Une modification manuelle — que ce soit l'heure, le texte ou le
 * destinataire — remet le message à « prévu » et efface son annonce : ce que
 * Jarvis annoncerait a changé sous ses pieds, une ancienne annonce ne vaut
 * plus rien. Source unique pour les trois champs modifiables séparément
 * ci-dessous ET pour l'écran « Programmé », qui les modifie tous à la fois.
 */
export async function modifierMessage(id: string, champs: ModificationMessage): Promise<void> {
  const { error } = await supabase
    .from("messages_programmes")
    .update({ ...champs, statut: "prevu", annonce_a: null })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

/** « Finalement envoie-le plutôt à 14h. » */
export async function reprogrammerMessage(id: string, envoyerA: string): Promise<void> {
  await modifierMessage(id, { envoyer_a: envoyerA })
}

export async function modifierTexte(id: string, texte: string): Promise<void> {
  await modifierMessage(id, { texte })
}

/** Les messages programmés tels qu'on les injecte dans l'exécuteur vocal. */
export const messagesProgrammesApi = {
  programmerMessage,
  listerMessagesProgrammes,
  messagesAAnnoncer,
  marquerAnnonce,
  marquerEnvoye,
  annulerMessage,
  reprogrammerMessage,
  modifierTexte,
  modifierMessage,
}
