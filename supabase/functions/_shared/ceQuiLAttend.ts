/**
 * Ce qui attend une décision de Raphaël, porté jusqu'à Jarvis.
 *
 * SA DEMANDE, le 5 sept. 2026 (chantier 8fbd6d61), quand je lui demandais de
 * cocher ce que devait contenir son briefing du matin — il a répondu que la
 * question elle-même était mal posée :
 *
 *   « Tout ce qu'on lui demande ça ne doit pas être figé. JARVIS doit
 *   développer une finesse d'esprit […] Si je demande un point global ça me
 *   dit tout, si je lui dis "j'ai quoi comme rdv aujourd'hui", ou si je lui
 *   dis "qu'est-ce qui est en retard de mon côté", "j'ai quoi comme décision
 *   à prendre sur le développement". Bref tout est n'importe quoi, il doit
 *   être en mesure de répondre. »
 *
 * De ses quatre exemples, trois avaient déjà de quoi être servis : les tâches
 * et leurs échéances partent à chaque phrase, l'agenda a son action
 * (list_calendar_events), et « un point global » se compose avec le reste.
 * LE QUATRIÈME N'AVAIT RIEN : les questions posées par les sessions Claude
 * Code vivent dans `dev_log`, et `dev_log` n'était envoyé nulle part. « J'ai
 * quoi comme décision à prendre sur le développement » était donc la seule de
 * ses phrases à laquelle Jarvis ne POUVAIT pas répondre. C'est ce trou-là que
 * ce fichier bouche, et rien de plus.
 *
 * POURQUOI C'EST JOINT À CHAQUE PHRASE, alors que les mails et l'agenda
 * passent par un appel d'outil : parce que c'est court et que ça se mesure.
 * Le 7 sept. 2026 sur ses données réelles, UN seul point l'attendait, soit
 * environ 150 caractères, contre ~45 000 pour une phrase entière. Un
 * aller-retour d'outil coûterait une seconde de plus pour ça. Si ce bloc
 * devait grossir, le plafond ci-dessous le borne — et alors il vaudra mieux
 * en faire une action.
 *
 * DANS `_shared/` parce que les deux moteurs en ont besoin, voice-command et
 * live-jeton : en Live le contexte est scellé à l'ouverture, donc ce qui n'y
 * est pas ne se rattrape plus. Même raison qu'`environnement.ts`.
 */

import { enAttenteDeRaphael, type EntreeJournal } from "./destinataire.ts"
import { signalerPanne } from "./pannes.ts"

/**
 * Combien de points partent au modèle. Huit : au-delà, on ne l'aide plus à
 * répondre, on paie du quota. Ils sont pris du plus ancien au plus récent —
 * celui qui attend depuis trois jours compte plus que celui d'il y a une
 * heure.
 */
export const MAX_POINTS = 8

/** Le texte d'un point, ramené à ce qui se dit à voix haute. */
export const QUESTION_MAX = 220

interface PointEnAttente extends EntreeJournal {
  created_at?: string | null
  item_id?: string | null
}

function propre(texte: string | null | undefined, max: number): string {
  const t = (texte ?? "").replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Depuis combien de temps ce point attend, dit comme on le dirait. */
export function depuisQuand(created_at: string | null | undefined, maintenant: Date): string {
  const t = Date.parse(created_at ?? "")
  if (!Number.isFinite(t)) return ""
  const jours = Math.floor((maintenant.getTime() - t) / 86_400_000)
  if (jours <= 0) return "aujourd'hui"
  if (jours === 1) return "depuis hier"
  return `depuis ${jours} jours`
}

/**
 * Le bloc à insérer, ou "" — jamais un titre suivi de rien.
 *
 * Un bloc vide coûterait des jetons à chaque phrase pour ne rien dire, et
 * pire : il apprendrait au modèle à annoncer une liste vide. Quand rien ne
 * l'attend, Jarvis doit pouvoir répondre « rien » parce qu'il n'a rien reçu,
 * pas réciter une section vide. Même règle que `formaterCorrections`.
 */
export function formaterCeQuiLAttend(points: PointEnAttente[], maintenant: Date): string {
  const retenus = (points ?? [])
    .filter(enAttenteDeRaphael)
    .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))
    .slice(0, MAX_POINTS)
  if (!retenus.length) return ""

  const lignes = retenus.map((p) => {
    const age = depuisQuand(p.created_at, maintenant)
    const quoi = p.kind === "action" ? "à faire par toi" : "à trancher"
    return `- [${quoi}${age ? `, ${age}` : ""}] ${propre(p.body, QUESTION_MAX)}`
  })

  return (
    `\nCE QUI ATTEND UNE DÉCISION DE RAPHAËL, en ce moment (${retenus.length}). ` +
    `Ce sont les questions que les sessions Claude Code lui ont posées sur le développement de Jarvis, ` +
    `et les gestes que lui seul peut faire. Sers-t'en quand il demande ce qu'il a à trancher, à décider ou à faire ` +
    `de son côté sur le développement — et PAS autrement : ne les énumère jamais de toi-même, il les voit déjà dans son cockpit.\n` +
    `${lignes.join("\n")}`
  )
}

/** Le client Supabase, réduit à ce qu'on utilise ici : pas d'import Deno. */
interface ClientLecture {
  from: (table: string) => {
    select: (colonnes: string) => {
      is: (colonne: string, valeur: null) => {
        order: (colonne: string, options: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown; error: unknown }>
        }
      }
    }
  }
}

/**
 * Va chercher en base ce qui l'attend et rend le bloc prêt à insérer.
 *
 * Ne lève jamais : une lecture cassée doit priver Jarvis de ce bloc, pas de sa
 * réponse. Mais elle se SIGNALE — sans ça, « je n'ai rien pu lire » se lirait
 * comme « rien ne t'attend », et c'est précisément la panne silencieuse que
 * `_shared/pannes.ts` existe pour attraper.
 */
export async function rappelerCeQuiLAttend(
  supabase: ClientLecture & Parameters<typeof signalerPanne>[0],
  maintenant: Date = new Date(),
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("dev_log")
      .select("author, kind, body, answered_at, pourquoi, created_at, item_id")
      .is("answered_at", null)
      .order("created_at", { ascending: false })
      // On en lit plus qu'on n'en garde : `enAttenteDeRaphael` écarte ensuite
      // les messages entre sessions et les comptes rendus, qui sont la
      // majorité du journal.
      .limit(MAX_POINTS * 6)
    if (error) {
      await signalerPanne(supabase, "Jarvis n'a pas pu relire ce qui attend une décision de Raphaël", error)
      return ""
    }
    if (!Array.isArray(data)) return ""
    return formaterCeQuiLAttend(data as PointEnAttente[], maintenant)
  } catch (err) {
    await signalerPanne(supabase, "Jarvis n'a pas pu relire ce qui attend une décision de Raphaël", err)
    return ""
  }
}
