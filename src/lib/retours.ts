// Relatif avec extension : ce module doit se vérifier sous
// `node --experimental-strip-types`, qui ne connaît pas l'alias « @/ » de Vite.
import { motsUtiles } from "./suggestionTheme.ts"
import { normaliserRecherche } from "./sections.ts"

/**
 * Jarvis constate ses propres échecs (chantier 25a58902).
 *
 * LA DEMANDE DE RAPHAËL, 3 sept. 2026, avec son exemple vécu : « mets-moi la
 * musique de Booba Dolce Camara » — Jarvis demande le lecteur, ouvre Apple
 * Music, et ne lance pas le titre. Raphaël répond « tu n'as pas lancé la
 * musique que je t'ai demandée ». Cet échec-là ne laissait AUCUNE trace :
 * aucune exception n'a été levée, l'action a « réussi », et le seul témoin est
 * une phrase de reproche qui partait dans le vide.
 *
 * CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS. Il DÉCIDE, et rien d'autre :
 * à partir de ce qui vient d'être dit et du tour précédent, il dit s'il y a eu
 * échec, de quelle famille, et sous quel titre le ranger. Il n'écrit nulle
 * part — l'écriture passe par `signalerErreur` (src/lib/erreurs.ts), le seul
 * chemin automatique du registre, et il n'y en aura pas de second : deux
 * registres d'erreurs côte à côte, c'est la garantie que personne ne regardera
 * ni l'un ni l'autre.
 *
 * POURQUOI LE TITRE NE CONTIENT PAS LA PHRASE DICTÉE. Raphaël a demandé une
 * correction « GLOBALE : par contexte de requête (famille d'action +
 * application), pas par phrase ». Le titre est donc fait de la famille
 * d'action et de sa cible ; c'est lui qui porte l'empreinte de regroupement
 * côté base (`empreinte_erreur`), donc dix échecs sur la musique font UNE
 * ligne avec un compteur, et non dix lignes qu'on ne lira jamais. La phrase,
 * elle, va dans `contexte`, comme preuve.
 *
 * CE QUI EST VOLONTAIREMENT ABSENT : « non ». Un « non » sec est, dans neuf
 * cas sur dix, la réponse à une question de précision (« Tu veux dire la villa
 * Dan ? »), c'est-à-dire le fonctionnement NORMAL du dialogue. Le compter
 * comme une plainte remplirait le registre de bruit, et un registre bruyant
 * n'est plus lu du tout — la même leçon que le contrôle des pannes
 * silencieuses, qui a dû être resserré le 5 sept. pour la même raison.
 */

/** Ce qu'on garde du tour précédent pour pouvoir lui attribuer une plainte. */
export interface TourJarvis {
  /** Ce que Raphaël avait dit. */
  transcript: string
  /** Les familles d'action exécutées, dans l'ordre (`open_app`, `add_task`…). */
  actions: string[]
  /** L'application, le contact, le titre visé — ce qui distingue deux échecs. */
  cible: string | null
  /** Ce que Jarvis avait répondu. */
  reponse: string | null
  at: number
}

export interface Echec {
  /** `action` : il avait compris, il a fait autre chose (ou rien).
   *  `comprehension` : il n'avait pas compris ce qu'on lui demandait. */
  categorie: "action" | "comprehension"
  titre: string
  detail: string | null
  contexte: string
  /** Le thème du chantier à ouvrir si l'échec se répète. */
  theme: string
}

/**
 * Au-delà, une plainte ne peut plus être attribuée : entre-temps il a pu
 * changer d'écran, de sujet, ou parler à quelqu'un d'autre. Trois minutes
 * couvrent largement « tu n'as pas lancé la musique » dit juste après.
 */
export const FENETRE_PLAINTE_MS = 3 * 60_000

/** Redire la même chose dans la minute, c'est que la première fois a raté. */
export const FENETRE_REDITE_MS = 60_000

/** En dessous, deux phrases se croisent par hasard sur des mots courants. */
export const RECOUVREMENT_REDITE = 0.8

/** Moins que ça, il n'y a pas assez de mots pour comparer quoi que ce soit. */
const MOTS_MINIMUM = 3

/**
 * Les tournures par lesquelles Raphaël dit que ça n'a pas marché.
 *
 * Comparées sur un texte mis à plat (accents, apostrophes et ponctuation
 * effacés) : la reconnaissance vocale de son téléphone n'écrit ni les
 * apostrophes ni les accents de façon fiable, et « tu n'as pas » lui revient
 * aussi bien en « tu nas pas » qu'en « tu na pas ».
 */
const PLAINTES = [
  "tu n as pas",
  "tu nas pas",
  "tu as pas",
  "tu n as rien",
  "tu as rien fait",
  "tu ne m as pas",
  "tu m as pas",
  "ca n a pas marche",
  "ca na pas marche",
  "ca ne marche pas",
  "ca marche pas",
  "ca n a pas fonctionne",
  "ca ne fonctionne pas",
  "ca fonctionne pas",
  "ce n est pas ce que",
  "c est pas ce que",
  "ce n est pas ca",
  "c est pas ca",
  "tu t es trompe",
  "tu ne l as pas fait",
  "tu l as pas fait",
]

/** Le texte mis à plat : accents, apostrophes et ponctuation effacés. */
export function aplatir(texte: string): string {
  return normaliserRecherche(texte)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Vrai si la phrase reproche quelque chose à Jarvis. */
export function estUnePlainte(phrase: string): boolean {
  const plat = aplatir(phrase)
  return PLAINTES.some((p) => plat.includes(p))
}

/**
 * Vrai si les deux phrases demandent la même chose.
 *
 * Pas une égalité : la reconnaissance vocale ne rend jamais deux fois
 * exactement le même texte, et une redite exigée au caractère près
 * n'attraperait rien. On compare le vocabulaire utile, dans les deux sens —
 * une phrase plus longue qui contient la précédente n'est pas une redite,
 * c'est une précision.
 */
export function estUneRedite(precedent: string, courant: string): boolean {
  const a = motsUtiles(precedent)
  const b = motsUtiles(courant)
  if (a.length < MOTS_MINIMUM || b.length < MOTS_MINIMUM) return false
  const ensembleB = new Set(b)
  const communs = a.filter((m) => ensembleB.has(m)).length
  return communs / Math.max(a.length, b.length) >= RECOUVREMENT_REDITE
}

/**
 * Le thème du chantier à ouvrir, déduit de la famille d'action.
 *
 * Les noms sont ceux des sections QUI EXISTENT DÉJÀ dans son cockpit, écrits à
 * l'identique : un thème « presque » identique éparpille le sujet au lieu de
 * le rassembler, et c'est une consigne explicite de Raphaël.
 */
export function themeDeLAction(action: string): string {
  if (["open_app", "media_control", "navigate_to", "set_alarm", "make_call"].includes(action)) {
    return "Le téléphone"
  }
  if (action === "send_message" || action.includes("calendar")) return "Messagerie et agenda"
  if (["chat", "clarify", "unknown"].includes(action) || action === "") return "Voix et écoute"
  return "L'app elle-même"
}

/**
 * Ce qui distingue deux échecs de la MÊME famille : l'application, le contact,
 * la destination.
 *
 * Volontairement PAS le titre d'une tâche ni le nom d'un fichier : ceux-là
 * changent à chaque phrase, et les mettre ici ferait une ligne de registre par
 * échec au lieu d'une ligne par contexte — l'inverse exact de ce que Raphaël a
 * demandé.
 */
export function cibleDeLAction(action: Record<string, unknown> | null | undefined): string | null {
  for (const champ of ["app_name", "contact_name", "destination"]) {
    const valeur = action?.[champ]
    if (typeof valeur === "string" && valeur.trim()) return valeur.trim()
  }
  return null
}

/** Une action qui n'a rien exécuté du tout : c'est de la compréhension. */
function estUneNonAction(actions: string[]): boolean {
  return actions.length === 0 || actions.every((a) => ["chat", "clarify", "unknown"].includes(a))
}

/** Le titre, fait pour REGROUPER : la famille d'action et sa cible, jamais la
 * phrase dictée — sinon chaque échec ouvrirait sa propre ligne. */
function titre(prefixe: string, actions: string[], cible: string | null): string {
  const famille = actions[0] ?? "aucune action"
  return `${prefixe} : ${famille}${cible ? ` (${cible})` : ""}`
}

/**
 * L'échec certain : l'action a levé. Pas besoin que Raphaël dise quoi que ce
 * soit, et pas de doute possible sur ce qui a raté.
 */
export function echecDeLAction(
  action: string,
  cible: string | null,
  transcript: string,
  erreur: unknown,
): Echec {
  return {
    categorie: "action",
    titre: titre("Une action a échoué", [action], cible),
    detail: erreur instanceof Error ? erreur.message : String(erreur ?? ""),
    contexte: transcript,
    theme: themeDeLAction(action),
  }
}

/**
 * L'échec que seul Raphaël peut voir : Jarvis a cru réussir.
 *
 * Rend `null` quand il n'y a rien à reprocher — c'est le cas courant, et le
 * silence est la bonne réponse.
 */
export function echecSignalePar(
  phrase: string,
  precedent: TourJarvis | null,
  maintenant: number,
): Echec | null {
  if (!precedent) return null
  if (maintenant - precedent.at > FENETRE_PLAINTE_MS) return null

  const plainte = estUnePlainte(phrase)
  // Une redite après une QUESTION de Jarvis est un dialogue normal, pas un
  // échec : il vient de demander une précision, on la lui donne.
  const redite =
    !precedent.actions.includes("clarify") &&
    maintenant - precedent.at <= FENETRE_REDITE_MS &&
    estUneRedite(precedent.transcript, phrase)

  if (!plainte && !redite) return null

  const comprehension = estUneNonAction(precedent.actions)
  return {
    categorie: comprehension ? "comprehension" : "action",
    titre: titre(
      plainte
        ? "Jarvis n'a pas fait ce qui était demandé"
        : "Raphaël a dû redemander la même chose",
      precedent.actions,
      precedent.cible,
    ),
    detail: precedent.reponse ? `Jarvis avait répondu : « ${precedent.reponse} »` : null,
    contexte: plainte
      ? `Demande : « ${precedent.transcript} ». Reproche : « ${phrase} ».`
      : `Demandé deux fois : « ${precedent.transcript} », puis « ${phrase} ».`,
    theme: themeDeLAction(precedent.actions[0] ?? ""),
  }
}
