// Relatif avec extension : ce module doit se vérifier sous
// `node --experimental-strip-types`, qui ne connaît pas l'alias « @/ » de Vite.
import { motsUtiles } from "./suggestionTheme.ts"
import type { CommandeEcran } from "./ecranTelephone.ts"

/**
 * Mode entraînement : « je te montre comment je fais, tu reproduis quand je
 * te le redemande » (chantier 86df4f4a, sa demande du 5 sept. 2026).
 *
 * DÉCISION D'ARCHITECTURE, tranchée par Raphaël le 7 sept. 2026 en réponse à
 * une question posée dans cette même conversation : Jarvis pilote SON PROPRE
 * TÉLÉPHONE via le service d'accessibilité déjà livré (chantier 3f3ad20b) —
 * zéro identifiant de site stocké, marche uniquement sur les applications où
 * il est DÉJÀ connecté. Le navigateur côté serveur avec identifiants
 * chiffrés, envisagé un temps, est écarté pour ce chantier.
 *
 * CE QUE CE MODULE FAIT : la reconnaissance des trois phrases (démarrer,
 * terminer et nommer, rejouer) et la mise en forme des réponses. Il ne
 * touche ni à l'écran ni à la base — ça, c'est `src/lib/controleEcran.ts`
 * (l'exécution) et `src/hooks/useEntrainement.ts` (l'état, la persistance).
 *
 * REJOUER N'EST PAS ENCORE GÉNÉRALISÉ : une séquence enregistrée pour
 * « vérifie les notes de mes clients sur midrag » rejoue EXACTEMENT les
 * mêmes clics, elle ne sait pas substituer un autre client ou une autre
 * plateforme. C'est un rejeu, pas encore un apprentissage généralisé —
 * annoncé comme tel, pas comme une IA qui aurait compris la tâche.
 */

export interface EtapeEntrainement {
  commande: CommandeEcran
  cible: string | null
}

export interface SequenceEntrainement {
  id: string
  nom: string
  etapes: EtapeEntrainement[]
}

function aplatir(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** « Jarvis, commence l'entraînement », « active le mode entraînement »… */
export function estDebutEntrainement(phrase: string): boolean {
  const p = aplatir(phrase)
  return (
    /^(commence|demarre|lance|active)\b.*\bentrainement\b/.test(p) ||
    /^entrainement\b/.test(p)
  )
}

/**
 * « termine l'entraînement », éventuellement suivi d'un nom : « … appelle ça
 * vérification midrag », « … et nomme-la vérification midrag », « … ça
 * s'appelle vérification midrag ».
 *
 * Rend `null` si la phrase n'est pas une fin d'entraînement ; sinon le nom
 * dicté, ou `""` s'il n'en a donné aucun (l'appelant choisit alors un nom
 * par défaut — une séquence sans nom serait invisible dans la liste).
 */
export function nomDeFinEntrainement(phrase: string): string | null {
  const p = aplatir(phrase)
  if (!/\b(termine|arrete|stop|fini|fin)\b.*\bentrainement\b/.test(p) && !/^entrainement termine/.test(p)) {
    return null
  }
  const m = p.match(/\b(?:appelle[ -]?(?:la|ca)|nomme[ -]?la|s\s?appelle)\s+(.+)$/)
  return m ? m[1].trim() : ""
}

/** Un nom par défaut, quand Raphaël n'en a dicté aucun — jamais une séquence
 * sans nom, sinon elle serait invisible à la voix ET dans la liste. */
export function nomParDefaut(maintenant: Date): string {
  return `Séquence du ${maintenant.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
}

/**
 * « refais la séquence vérification midrag », « relance l'entraînement
 * vérification midrag », « reproduis vérification midrag »… Rend la
 * séquence visée, ou `null` — jamais une devinette : une séquence rejouée à
 * tort clique dans une application à la place de Raphaël, ce qui ne se
 * rattrape pas forcément.
 */
export function sequenceDemandee(
  phrase: string,
  sequences: SequenceEntrainement[],
): SequenceEntrainement | null {
  const p = aplatir(phrase)
  const m = p.match(/^(?:refais|relance|reproduis|repete|refais la sequence|lance la sequence|lance l'?entrainement)\s+(.+)$/)
  if (!m) return null
  const reste = m[1].replace(/^(la sequence|l'?entrainement)\s+/, "").trim()
  if (!reste) return null

  const motsDemandes = motsUtiles(reste)
  if (motsDemandes.length === 0) return null

  // Le nom qui partage le plus de mots utiles avec ce qui a été dit —
  // « pas de gagnant » plutôt qu'un choix au hasard entre deux séquences qui
  // se ressemblent également.
  let meilleure: SequenceEntrainement | null = null
  let meilleurScore = 0
  let exAequo = false
  for (const s of sequences) {
    const motsNom = motsUtiles(s.nom)
    if (motsNom.length === 0) continue
    const communs = motsNom.filter((mo) => motsDemandes.includes(mo)).length
    if (communs === 0) continue
    const score = communs / Math.max(motsNom.length, motsDemandes.length)
    if (score > meilleurScore) {
      meilleurScore = score
      meilleure = s
      exAequo = false
    } else if (score === meilleurScore) {
      exAequo = true
    }
  }
  if (!meilleure || exAequo || meilleurScore < 0.4) return null
  return meilleure
}

// ── Ce qu'on dit ────────────────────────────────────────────────────────────

export function phraseDebutEntrainement(): string {
  return "D'accord, je regarde et je retiens ce que tu fais, jusqu'à ce que tu me dises « termine l'entraînement »."
}

export function phraseFinEntrainement(nom: string, nbEtapes: number): string {
  if (nbEtapes === 0) {
    return `Je n'ai rien vu à retenir — tu n'as touché à aucun écran pendant que j'enregistrais. Rien n'est gardé.`
  }
  return `C'est noté sous « ${nom} », ${nbEtapes} étape${nbEtapes > 1 ? "s" : ""}. Redis-moi « refais ${nom} » pour que je la reproduise. Tu peux la renommer ou la supprimer depuis Paramètres.`
}

export function phraseAucunEntrainementEnCours(): string {
  return "Je n'étais pas en train d'enregistrer."
}

export function phraseRejeuIntrouvable(): string {
  return "Je ne connais pas de séquence qui corresponde. Dis « qu'est-ce que tu as retenu ? » pour la liste, ou passe par Paramètres."
}

export function phraseDebutRejeu(nom: string): string {
  return `Je reproduis « ${nom} ».`
}

export function phraseEchecRejeu(nom: string, etape: number, total: number): string {
  return `« ${nom} » s'arrête à l'étape ${etape} sur ${total} : l'écran ne ressemble plus à ce que j'avais enregistré. Je n'ai rien touché de plus.`
}

// ── L'enregistrement en cours, entre « commence » et « termine » ───────────
//
// EN MÉMOIRE DU MODULE, PAS EN BASE NI EN REACT — même motif que
// `derniereCreation` dans voiceActions.ts : c'est un état de la SESSION EN
// COURS (« je suis en train de me faire montrer quelque chose »), qui n'a pas
// à survivre à la fermeture de l'app. Une fenêtre restée ouverte par erreur
// se referme au pire vide, elle ne pollue jamais une séquence sauvegardée.

let enregistrement: { enCours: boolean; etapes: EtapeEntrainement[] } = {
  enCours: false,
  etapes: [],
}

export function enregistrementEnCours(): boolean {
  return enregistrement.enCours
}

export function demarrerEnregistrement(): void {
  enregistrement = { enCours: true, etapes: [] }
}

/** Appelée depuis `actionsTelephoneVocales.ts` à chaque commande d'écran
 * réellement exécutée, sans condition : elle ne fait rien tant que
 * `demarrerEnregistrement` n'a pas été appelée. */
export function ajouterEtapeEnregistree(etape: EtapeEntrainement): void {
  if (!enregistrement.enCours) return
  enregistrement.etapes.push(etape)
}

/** Referme l'enregistrement et rend ce qu'il contient — l'appelant décide
 * de le garder ou non (rien à garder si la liste est vide). */
export function arreterEnregistrement(): EtapeEntrainement[] {
  const etapes = enregistrement.etapes
  enregistrement = { enCours: false, etapes: [] }
  return etapes
}
