// Les phrases sur lesquelles on essaie un modèle avant de le laisser approcher
// de Jarvis.
//
// Chantier 66a7a233, point 2 de la demande : « elle les ESSAIE POUR DE VRAI
// […] puis quelques-uns de nos propres contrôles de
// verifier-commande-vocale.mjs — est-ce qu'il appelle bien l'outil, est-ce
// qu'il suit la consigne. Un modèle qui répond n'est pas un modèle qui obéit. »
//
// CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS. Ce n'est PAS la consigne
// complète de Jarvis (26 000 caractères, dans voice-command/index.ts) ni son
// vrai schéma d'outil (17 800 caractères). Les recopier ici en ferait une
// deuxième source de vérité qui divergerait au premier changement — le défaut
// que ce projet corrige partout ailleurs. C'est un ÉCHANTILLON : un schéma de
// la même FORME (un tableau d'actions, chacune avec un discriminant `action`)
// et une poignée de phrases dont la bonne réponse ne se discute pas.
//
// Ce que cet échantillon prouve, et c'est déjà beaucoup : le modèle sait
// appeler un outil imposé, respecter un énuméré, ranger la demande dans le bon
// domaine, et ne pas inventer d'action. Un modèle qui échoue là-dessus échouera
// à coup sûr sur les trente domaines réels. L'inverse n'est pas garanti — d'où
// les DEUX JOURS d'essais, le retour arrière automatique, et le fait que le
// modèle promu garde l'ancien en premier secours.

import type { OutilDeclare } from "./modele.ts"

/** La consigne de l'échantillon : courte, et sans rien de variable. */
export const CONSIGNE_CONTROLE =
  "Tu ranges une phrase dictée en français dans une ou plusieurs actions structurées. " +
  "Trois domaines : les tâches personnelles, les chantiers de développement de l'assistant " +
  "(quand l'utilisateur dit explicitement « chantier » ou parle de coder l'assistant), et la " +
  "discussion généraliste pour tout le reste. Appelle TOUJOURS l'outil. N'invente jamais une " +
  "action que l'utilisateur n'a pas demandée. Si la demande est ambiguë, rends une seule " +
  "action « clarify »."

export const OUTIL_CONTROLE: OutilDeclare = {
  name: "resolve_voice_command",
  description:
    "Résout une commande vocale en français en une ou plusieurs actions structurées.",
  input_schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        description:
          "Les actions à exécuter, dans l'ordre où l'utilisateur les a dites. UNE SEULE dans " +
          "la plupart des cas ; plusieurs quand la phrase contient plusieurs demandes distinctes.",
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["add_task", "add_dev_item", "chat", "clarify"],
              description:
                "add_task : une tâche personnelle. add_dev_item : un chantier de développement " +
                "de l'assistant. chat : une question ou un échange ordinaire. clarify : la " +
                "demande est ambiguë.",
            },
            title: { type: ["string", "null"], description: "Le titre, pour une tâche ou un chantier." },
            message: { type: ["string", "null"], description: "Ce qu'on répond à l'utilisateur." },
          },
          required: ["action"],
        },
        minItems: 1,
      },
    },
    required: ["actions"],
  },
}

export interface Controle {
  phrase: string
  /** Les actions attendues, dans l'ordre. */
  attendu: string[]
  pourquoi: string
}

/**
 * Six phrases, choisies pour que la bonne réponse ne se discute pas.
 *
 * Trois d'entre elles vérifient le SILENCE, au sens de ce projet : qu'un modèle
 * ne range pas de travers une phrase qui ressemble à autre chose. Raphaël est
 * dans l'immobilier, où « chantier » veut d'abord dire maçonnerie — et c'est
 * exactement le genre de confusion qui lui fabrique des lignes fantômes dans
 * son cockpit.
 */
export const CONTROLES: Controle[] = [
  {
    phrase: "ajoute une tâche : acheter du pain",
    attendu: ["add_task"],
    pourquoi: "le cas le plus simple ; s'il le rate, rien d'autre ne tiendra",
  },
  {
    phrase: "ajoute un chantier pour corriger le bouton de suppression dans l'application",
    attendu: ["add_dev_item"],
    pourquoi: "il doit distinguer un chantier de développement d'une tâche",
  },
  {
    phrase: "appelle le chantier de la villa Dan pour commander les carreaux",
    attendu: ["add_task"],
    pourquoi:
      "LE PIÈGE : ici « chantier » est de la maçonnerie, pas du développement. Un modèle qui " +
      "range ça dans le cockpit lui fabrique des lignes fantômes",
  },
  {
    phrase: "quelle est la capitale de l'Australie",
    attendu: ["chat"],
    pourquoi: "une question ordinaire ne doit rien créer du tout",
  },
  {
    phrase: "ajoute une tâche pour le plombier et note aussi d'appeler l'assurance",
    attendu: ["add_task", "add_task"],
    pourquoi: "deux demandes dans une phrase font deux actions, dans l'ordre",
  },
  {
    phrase: "enlève-le",
    attendu: ["clarify"],
    pourquoi: "sans référent, il doit demander plutôt que de deviner ce qu'il supprime",
  },
]

/**
 * Le modèle a-t-il fait ce qu'on attendait ?
 *
 * On compare les FAMILLES d'action, dans l'ordre, et rien d'autre : le titre
 * exact ou la formulation de la réponse varient légitimement d'un modèle à
 * l'autre. Exiger le mot à mot ferait échouer tous les candidats, et le
 * mécanisme ne promouvrait jamais rien — ce qui se lirait comme « aucun modèle
 * n'est bon » alors que ce serait notre contrôle qui est trop strict.
 */
export function controleReussi(controle: Controle, args: Record<string, unknown> | undefined): boolean {
  const actions = (args?.actions as Array<{ action?: unknown }> | undefined) ?? []
  const rendues = actions.map((a) => String(a?.action ?? ""))
  return (
    rendues.length === controle.attendu.length &&
    rendues.every((a, i) => a === controle.attendu[i])
  )
}
