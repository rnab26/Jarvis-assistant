/**
 * Ce que la mémoire longue durée extrait d'un échange — la consigne et le
 * message, à part de memoire.ts pour se vérifier contre le vrai modèle SANS
 * base ni déploiement (`scripts/essayer-consigne.sh memoire-extraction`).
 */

export const OUTIL_EXTRACTION = {
  name: "extraire_faits",
  description:
    "Extrait de l'échange les faits durables à retenir sur l'utilisateur. Zéro fait est une réponse normale et fréquente.",
  input_schema: {
    type: "object" as const,
    properties: {
      faits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            contenu: {
              type: "string",
              description:
                "Le fait, en une phrase courte et autonome, compréhensible dans six mois sans le contexte de l'échange.",
            },
            categorie: {
              type: "string",
              enum: ["personne", "dossier", "engagement", "preference", "fait"],
            },
          },
          required: ["contenu", "categorie"],
        },
      },
    },
    required: ["faits"],
  },
}

export const CONSIGNE_EXTRACTION = `Tu tries ce qui mérite d'être retenu d'un échange entre Raphaël et son assistant.

RETIENS : les personnes de son entourage (qui elles sont, leur lien avec lui), les dossiers et projets (état, montants, échéances), les engagements qu'il prend, ses préférences et sa façon de travailler, et les faits durables sur lui.

NE RETIENS PAS :
- Les salutations, le bavardage, les questions de culture générale et leurs réponses.
- Ce qui n'aura plus de sens dans une semaine.
- Une demande de créer une tâche, un chantier, un document ou un rappel. C'est DÉJÀ enregistré ailleurs, en dupliquer le contenu ici est une erreur. N'en tire un souvenir que si la phrase révèle en plus quelque chose de durable sur Raphaël — une préférence, une contrainte, une façon de travailler — et alors retiens cela seulement, pas la demande.
- Un bug ou un problème technique de l'application : il devient un chantier, pas un souvenir.

JARVIS, C'EST TOI. Jarvis (ou Claude) est l'assistant, jamais une personne de l'entourage de Raphaël. Ne crée jamais de souvenir qui le décrive comme quelqu'un qu'il connaît, et ne retiens rien sur le fonctionnement de l'assistant lui-même.

UN SEUL SOUVENIR PAR IDÉE. Ne découpe pas la même information en deux ou trois faits qui se répètent sous des angles différents : garde le plus utile et jette les autres.

CE QUE TU SAIS DÉJÀ t'est donné avec l'échange, quand il y a quelque chose en rapport :
- Un fait déjà connu ne se réécrit pas, même formulé autrement.
- Une PERSONNE déjà connue garde l'orthographe EXACTE sous laquelle tu la connais : la dictée écorche les noms (« Haim Demazgan », « Haim Desgan » pour Haim Mazgan) et chaque variante fabriquerait une seconde personne.
- Une information qui CONTREDIT ce que tu sais (un autre prénom pour sa femme, un autre métier pour un contact) n'est retenue QUE s'il te corrige explicitement (« non, en fait… », « retiens que… »). Sinon c'est presque toujours la dictée qui s'est trompée : n'en fais pas un fait.

MÉFIE-TOI DE LA TRANSCRIPTION. Ces phrases viennent d'une dictée vocale : un nom propre inconnu et improbable est souvent une erreur de reconnaissance. Dans le doute, n'en fais pas un fait.

Chaque fait tient en une phrase courte et se suffit à lui-même. Zéro fait est une réponse normale et fréquente : la plupart des échanges n'ont rien à retenir. N'invente jamais, ne déduis pas au-delà de ce qui a été dit.`

/** Le message soumis à l'extraction : l'échange, et ce qui est déjà connu. */
export function messageExtraction(transcript: string, reponse: string | null, connus: string[]): string {
  const echange = `Raphaël a dit : « ${transcript} »\n${reponse ? `Jarvis a répondu : « ${reponse} »` : ""}`
  if (!connus.length) return echange
  return `${echange}\n\nCe que tu sais déjà, en rapport avec cet échange :\n${connus.map((c) => `- ${c}`).join("\n")}`
}
