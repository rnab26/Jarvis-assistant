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
  id?: string
  created_at?: string | null
  item_id?: string | null
  options?: unknown
}

function propre(texte: string | null | undefined, max: number): string {
  const t = (texte ?? "").replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Les libellés des options cliquables du cockpit (colonne jsonb `options`),
 * réduits à ce qui aide le modèle à reprendre le bon mot — pas une seconde
 * lecture de la structure complète : celle-ci vit dans `src/lib/decisions.ts`
 * (`optionsDe`), inatteignable d'ici (une Edge Function ne peut pas importer
 * `src/`). Défensif comme elle : jsonb écrit à la main, souvent imparfait.
 */
function libellesOptions(brut: unknown): string[] {
  if (!Array.isArray(brut)) return []
  const labels: string[] = []
  for (const o of brut) {
    if (!o || typeof o !== "object") continue
    const libelle = (o as Record<string, unknown>).libelle
    if (typeof libelle === "string" && libelle.trim()) labels.push(libelle.trim())
  }
  return labels
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

/** Le tri et le plafond qui décident CE QUI est retenu — partagé entre le
 * texte envoyé au modèle et le garde-fou de `decisionDesigneeClairement`,
 * qui doivent voir exactement les mêmes points. */
function retenirPoints(points: PointEnAttente[]): PointEnAttente[] {
  return (points ?? [])
    .filter(enAttenteDeRaphael)
    .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))
    .slice(0, MAX_POINTS)
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
  const retenus = retenirPoints(points)
  if (!retenus.length) return ""

  const lignes = retenus.map((p) => {
    const age = depuisQuand(p.created_at, maintenant)
    const quoi = p.kind === "action" ? "à faire par toi" : "à trancher"
    const options = libellesOptions(p.options)
    const optionsTexte = options.length ? ` (options proposées : ${options.join(" / ")})` : ""
    return `- [id ${p.id ?? "?"}, ${quoi}${age ? `, ${age}` : ""}] ${propre(p.body, QUESTION_MAX)}${optionsTexte}`
  })

  return (
    `\nCE QUI ATTEND UNE DÉCISION DE RAPHAËL, en ce moment (${retenus.length}). ` +
    `Ce sont les questions que les sessions Claude Code lui ont posées sur le développement de Jarvis, ` +
    `et les gestes que lui seul peut faire. Sers-t'en quand il demande ce qu'il a à trancher, à décider ou à faire ` +
    `de son côté sur le développement — et PAS autrement : ne les énumère jamais de toi-même, il les voit déjà dans son cockpit.\n` +
    `${lignes.join("\n")}\n` +
    `Il peut aussi répondre à L'UN DE CES POINTS À VOIX HAUTE, en phrase libre — pas forcément le libellé exact d'une ` +
    `option (« laisse comme c'est pour les sessions autonomes », « pour la dictée redite, préviens puis refais »). ` +
    `Utilise alors repondre_decision : decision_id = l'identifiant entre crochets ci-dessus du point visé, ` +
    `decision_reponse = sa réponse mise en forme (reprends TEL QUEL le libellé d'une option proposée si sa phrase ` +
    `s'y reconnaît clairement, sinon sa phrase telle quelle). S'IL N'Y A QU'UN SEUL POINT ci-dessus, decision_id est ` +
    `forcément lui, même si sa phrase est vague. S'IL Y EN A PLUSIEURS, ne réponds QUE si sa phrase désigne clairement ` +
    `l'un d'eux (elle en cite le sujet ou un mot qui ne va qu'à lui) ; si elle pourrait viser plusieurs points à la fois ` +
    `ou n'en désigne clairement aucun, N'UTILISE PAS repondre_decision — rends clarify, rappelle en une phrase les ` +
    `sujets en attente et demande auquel il répond. Ne devine jamais au hasard entre plusieurs points.`
  )
}

/**
 * Mots trop communs pour distinguer un point d'un autre — y compris ceux
 * qu'une phrase de refus vague utilise ("laisse", "change", "rien") : c'est
 * justement le cas qu'on veut voir échouer, pas gagner par accident sur un
 * mot qui ne dit rien.
 */
const MOTS_VIDES_DECISION = new Set([
  "les", "des", "une", "un", "aux", "que", "qui", "pour", "dans", "avec", "sans",
  "sur", "par", "est", "sont", "pas", "plus", "moins", "faire", "fait", "faut",
  "avoir", "cela", "cette", "ceux", "celle", "quand", "comme", "mais", "donc",
  "car", "son", "sa", "ses", "mon", "ma", "mes", "leur", "leurs", "nous", "vous",
  "tout", "tous", "toute", "toutes", "bien", "peut", "pouvoir", "doit", "devoir",
  "quelque", "chose", "aussi", "encore", "deja", "meme", "laisse", "laisses",
  "laisser", "change", "changer", "changes", "rien", "reste", "reponds",
  "garde", "gardons", "gardes", "ok", "oui", "non", "cest", "c'est",
])

function motsUtilesDecision(texte: string): Set<string> {
  const normalise = texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
  return new Set(
    normalise.split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !MOTS_VIDES_DECISION.has(m)),
  )
}

/**
 * Le point ciblé est-il désigné SANS AMBIGUÏTÉ par la phrase, par un mot qui
 * lui appartient et n'appartient à AUCUN autre point en attente ?
 *
 * Sert de filet derrière la consigne (ci-dessus), qui ne suffit pas seule.
 * MESURÉ le 17 sept. 2026, sur la fonction déployée, avec deux points en
 * attente et « laisse comme c'est, ne change rien » : le modèle a d'abord
 * répondu aux DEUX à la fois (guettée par le garde-fou de comptage
 * d'index.ts), puis — une fois rejoué — a répondu à un SEUL des deux, choisi
 * au hasard, ce que ce garde-fou-ci attrape (leur vocabulaire ne recoupe rien
 * de la phrase). Même leçon que le chantier 902bf94b sur le nom de catégorie
 * refusée : la consigne seule ne l'empêche pas, ça se corrige dans le code.
 *
 * Avec un seul point en attente, aucune ambiguïté n'est possible : toujours
 * vrai s'il vise bien ce point-là, même si sa phrase est vague (« S'il n'y a
 * qu'un seul point, decision_id est forcément lui »).
 *
 * Aucun point retrouvé (déjà répondu entre-temps depuis le cockpit, ou
 * lecture ratée) : jamais vrai. Un « je ne peux pas vérifier » ne doit jamais
 * se lire comme un « c'est bon ».
 */
export function decisionDesigneeClairement(
  transcript: string,
  decisionId: string,
  points: PointEnAttente[],
): boolean {
  if (points.length === 0) return false
  if (points.length === 1) return points[0].id === decisionId
  const cible = points.find((p) => p.id === decisionId)
  if (!cible) return false

  const motsPhrase = motsUtilesDecision(transcript)
  if (motsPhrase.size === 0) return false

  const texteDe = (p: PointEnAttente) => [p.body, ...libellesOptions(p.options)].join(" ")
  const motsCible = motsUtilesDecision(texteDe(cible))
  const motsAutres = new Set<string>()
  for (const p of points) {
    if (p.id === decisionId) continue
    for (const m of motsUtilesDecision(texteDe(p))) motsAutres.add(m)
  }

  // Un mot de la phrase qui n'appartient QU'à la cible, pas aux autres
  // candidats en attente — c'est ce qui manquait à « laisse comme c'est ».
  for (const m of motsPhrase) {
    if (motsCible.has(m) && !motsAutres.has(m)) return true
  }
  return false
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
      .select("id, author, kind, body, answered_at, pourquoi, created_at, item_id, options")
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

/**
 * Les mêmes points, mais STRUCTURÉS plutôt qu'en texte — pour
 * `decisionDesigneeClairement` (voice-command/index.ts), qui doit voir
 * exactement ce que le modèle a reçu ce tour-ci. Deuxième lecture de la même
 * table, volontairement : elle n'a lieu que quand une réponse à une décision
 * revient du modèle (rare), jamais à chaque phrase.
 *
 * Silencieuse en cas de panne ([] plutôt qu'une erreur) : une lecture ratée
 * ici ne doit pas faire échouer la phrase, elle a juste moins de quoi
 * vérifier — `rappelerCeQuiLAttend` a déjà signalé la vraie panne au registre
 * si la base est injoignable.
 */
export async function pointsCeQuiLAttend(supabase: ClientLecture): Promise<PointEnAttente[]> {
  try {
    const { data, error } = await supabase
      .from("dev_log")
      .select("id, author, kind, body, answered_at, pourquoi, created_at, item_id, options")
      .is("answered_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_POINTS * 6)
    if (error || !Array.isArray(data)) return []
    return retenirPoints(data as PointEnAttente[])
  } catch {
    return []
  }
}
