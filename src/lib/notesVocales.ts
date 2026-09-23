// Import relatif avec extension : ce module doit rester chargeable par
// `node --experimental-strip-types` pour sa vérification.
import { sansAccents } from "./dateOrale.ts"

/**
 * Les notes personnelles, à la voix (chantiers 447560d1 et a9c75d52, 23 sept.
 * 2026).
 *
 * SA DICTÉE, à 10h09 : « Ouvre un chantier comme quoi tu dois pouvoir créer
 * des notes » — juste après « pourquoi tu n'as pas ouvert le chantier ? ».
 * L'onglet Notes existe depuis le 6 sept. (chantier 5ad49cc0), mais Jarvis
 * n'en savait rien : l'action vocale avait été laissée de côté. Pire, lu par
 * la règle des tâches de `commandeLocale.ts`, « crée une note courses :
 * lait » devenait une TÂCHE intitulée « Note courses : lait » — dans sa liste
 * de tâches, pas dans ses notes.
 *
 * RECONNU SUR L'APPAREIL, pas par le modèle : une note se désigne par le MOT
 * « note » employé comme un nom (« une note », « la note », « mes notes »),
 * sans ambiguïté possible. Et ça marche dans les deux modes, puisque l'outil
 * du mode Live repasse par la même reconnaissance locale.
 *
 * CE QUI N'EST PAS UNE NOTE, et la moitié de `verifier-notes-vocales.ts`
 * vérifie ce silence :
 * - « note ça », « note sa réponse » : c'est `garder_reponse_ecran` ;
 * - « note un rappel comme quoi… » : une tâche (mesuré dans ses dictées) ;
 * - « note que Dylan est le client de Mélissa » : une information pour la
 *   mémoire, comme l'a toujours voulu `commandeLocale.ts` ;
 * - « une note de frais » : une dépense, qu'il faut laisser au modèle ;
 * - « ajoute une note à la tâche X » : les NOTES d'une tâche, pas une note.
 */

export type DemandeNote =
  | { type: "ajouter"; titre: string; contenu: string }
  | { type: "lister"; recherche: string | null }
  | { type: "lire"; cible: string }
  | { type: "completer"; cible: string; ajout: string }
  | { type: "supprimer"; cible: string }

/** Un titre au-delà de ça est une phrase : on la garde en contenu. */
const MOTS_TITRE = 6

/** Ce qui suit « note » et en fait autre chose qu'une note personnelle. */
const PAS_UNE_NOTE = /^(?:de frais|d'honoraires|de service)\b|^(?:a|sur|dans|pour) (?:la |ma |cette )?(?:tache|chantier)\b|^(?:au|du) chantier\b/

/** Les verbes qui demandent d'écrire quelque chose. */
const VERBES_ECRIRE = "(?:ajoute|ajouter|rajoute|rajouter|cree|creer|ecris|ecrire|fais|faire|prends|prendre|mets|mettre|note|noter|enregistre|enregistrer|garde|garder)(?:-moi|-la|-le)?"

/** « une note PERSONNELLE », « ma note perso » : le mot ne dit rien de plus
 * — toutes ses notes sont personnelles. Mesuré dans ses dictées du 6 sept. */
const ADJECTIFS = /^(?:personnelle|perso|privee)\b\s*/

/**
 * Une note qui est en fait un RAPPEL : une tâche, pas une note. Sa dictée du
 * 14 sept. : « créer une note me rappelant d'appeler Adam pour la prise […]
 * dans perso » — « perso » est une catégorie de TÂCHES, et « me rappelant »
 * dit qu'il veut qu'on le lui rappelle. On laisse ces phrases à la règle des
 * tâches et au modèle.
 */
const EST_UN_RAPPEL = /\b(?:me rappelant|rappelle[s-]?(?:moi)?|rappel|pour me rappeler)\b/

function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/**
 * Le morceau de la phrase D'ORIGINE qui correspond à la fin du texte nettoyé.
 *
 * `commandeLocale.ts` travaille sur un texte sans accents ni majuscules ; une
 * tâche peut s'en contenter (« Dans les prelevements de relancer moli » est
 * lisible), une note non — c'est SON texte, il la relira. Le nettoyage garde
 * la longueur de chaque caractère (un « é » devient un « e »), donc la fin du
 * texte nettoyé est la même longueur de fin dans la phrase d'origine. On le
 * vérifie avant de s'en servir ; sinon on garde la version nettoyée plutôt que
 * de couper au mauvais endroit.
 */
export function suffixeOriginal(phrase: string, suffixeNettoye: string): string {
  const base = phrase.replace(/\s+/g, " ").replace(/[?!.]+$/g, "").trim()
  const n = suffixeNettoye.length
  if (n === 0 || base.length < n) return suffixeNettoye
  const candidat = base.slice(base.length - n)
  return sansAccents(candidat) === suffixeNettoye ? candidat : suffixeNettoye
}

/**
 * « courses : lait, œufs » → titre « Courses », contenu « lait, œufs ».
 * Sans deux-points : les premiers mots font le titre, TOUT le texte fait le
 * contenu — rien de ce qu'il a dit n'est retiré de la note.
 */
export function titreEtContenu(texte: string): { titre: string; contenu: string } {
  const propre = texte.replace(/^[\s:;,.–—-]+/, "").trim()
  // Un titre dit entre guillemets : sa dictée du 6 sept., « Créer une note
  // personnelle "Dons Septembre" avec les détails suivants : Kapparot à
  // Ruben : 570 shekels… ». Le titre est ce qu'il a mis entre guillemets, le
  // contenu ce qui suit l'annonce.
  const guillemets = propre.match(/^["«“]\s*([^"»”]{1,80}?)\s*["»”]\s*(.*)$/s)
  if (guillemets) {
    const suite = guillemets[2]
      .replace(/^(?:avec|et)?\s*(?:les |le |la )?(?:d[ée]tails?|texte|contenu|infos?|informations?)?\s*(?:suivants?|suivantes?)?\s*[:,-]?\s*/i, "")
      .trim()
    return { titre: majuscule(guillemets[1].trim()), contenu: suite || guillemets[1].trim() }
  }
  const deuxPoints = propre.match(/^([^:]{1,60}?)\s*:\s*(.+)$/s)
  if (deuxPoints && deuxPoints[1].split(" ").length <= MOTS_TITRE) {
    return { titre: majuscule(deuxPoints[1].trim()), contenu: deuxPoints[2].trim() }
  }
  const mots = propre.split(" ").filter(Boolean)
  if (mots.length <= MOTS_TITRE) return { titre: majuscule(propre), contenu: propre }
  return { titre: majuscule(mots.slice(0, MOTS_TITRE).join(" ")), contenu: majuscule(propre) }
}

/** « personnelle "Dons Septembre" » → « dons septembre ». */
function nettoyerCible(cible: string): string {
  return cible.replace(ADJECTIFS, "").replace(/["«»“”]/g, "").trim()
}

/**
 * La demande, lue sur le texte NETTOYÉ de `commandeLocale.ts` (minuscules,
 * sans accents, sans « Jarvis » ni politesse), avec la phrase d'origine pour
 * en garder les accents. `null` quand ce n'est pas une note.
 */
export function demandeNote(texte: string, phrase: string = texte): DemandeNote | null {
  // ── Lire ou chercher ────────────────────────────────────────────────────
  const lireUne = texte.match(/^(?:lis|lire|relis|relire|montre|ouvre|dis|donne)(?:-moi)?\s+(?:la|ma)\s+note\s+(?:sur |de |du |des |pour |qui parle de |intitulee |appelee )?(.+)$/)
  if (lireUne) return { type: "lire", cible: nettoyerCible(lireUne[1]) }

  const chercher = texte.match(/^(?:cherche|trouve|retrouve)(?:-moi)?\s+(?:dans|parmi)\s+(?:mes|les)\s+notes\s+(?:la note\s+)?(?:sur |de |qui parle de )?(.+)$/)
  if (chercher) return { type: "lister", recherche: chercher[1].trim() }

  if (
    /^(?:lis|lire|relis|montre|donne|dis)(?:-moi)?\s+(?:mes|les|toutes mes)\s+notes\b\s*$/.test(texte) ||
    /^(?:quelles sont|c'est quoi|qu'est-ce que j'ai (?:dans|comme)|j'ai quoi (?:dans|comme))\s+(?:mes |les )?notes\b\s*$/.test(texte)
  ) {
    return { type: "lister", recherche: null }
  }

  // ── Supprimer ───────────────────────────────────────────────────────────
  const supprimer = texte.match(/^(?:supprime|efface|enleve|retire|jette)(?:-moi)?\s+(?:la|ma)\s+note\s+(?:sur |de |du |pour |qui parle de )?(.+)$/)
  if (supprimer) return { type: "supprimer", cible: nettoyerCible(supprimer[1]) }

  // ── Compléter une note existante ────────────────────────────────────────
  // « ajoute à la note courses : du pain » — la cible avant les deux-points
  // ou la virgule, ce qu'on ajoute après.
  const completer = texte.match(/^(?:ajoute|ajouter|rajoute|rajouter|complete|completer|mets|mettre)(?:-moi)?\s+(?:a|dans)\s+(?:la|ma)\s+note\s+(.+?)\s*(?:[:,]|\s-\s)\s*(.+)$/)
  if (completer) {
    const cible = completer[1].replace(ADJECTIFS, "").replace(/["«»“”]/g, "").trim()
    if (PAS_UNE_NOTE.test(cible) || !cible) return null
    return {
      type: "completer",
      cible,
      ajout: suffixeOriginal(phrase, completer[2].trim()),
    }
  }

  // ── Créer ───────────────────────────────────────────────────────────────
  const creer =
    texte.match(new RegExp(`^${VERBES_ECRIRE}\\s+(?:une\\s+(?:nouvelle\\s+)?|la\\s+|ma\\s+)note\\b\\s*(.*)$`)) ??
    texte.match(/^(?:nouvelle note)\b\s*(.*)$/) ??
    texte.match(new RegExp(`^${VERBES_ECRIRE}\\s+(?:dans|a)\\s+(?:mes|les)\\s+notes\\b\\s*(.*)$`))
  if (creer) {
    let reste = creer[1].trim().replace(ADJECTIFS, "")
    if (PAS_UNE_NOTE.test(reste)) return null
    if (EST_UN_RAPPEL.test(reste)) return null
    // « une note qui s'appelle courses : … », « une note pour … »
    reste = reste
      .replace(/^(?:qui s'appelle|qui dit|intitulee|appelee|nommee|avec|pour dire|disant)\s+/, "")
      .replace(/^(?:pour|sur|que|qu'|:)\s*/, "")
      .trim()
    if (reste.length < 2) return null
    const { titre, contenu } = titreEtContenu(suffixeOriginal(phrase, reste))
    return { type: "ajouter", titre, contenu }
  }

  return null
}

/** Une note telle que la voix la connaît. */
export interface NoteConnue {
  id: string
  title: string
  content: string
}

/**
 * La note dont il parle, ou null s'il n'y en a pas UNE qui se détache.
 * Titre d'abord, contenu ensuite — un mot du titre compte plus qu'un mot
 * perdu dans un long contenu. Deux notes à égalité : on ne choisit pas.
 */
export function trouverNote<T extends NoteConnue>(cible: string, notes: T[]): T | null {
  const c = sansAccents(cible).replace(/[^a-z0-9 ]+/g, " ").trim()
  if (!c) return null
  const mots = c.split(" ").filter((m) => m.length >= 3)
  let gagnant: T | null = null
  let meilleur = 0
  let egalite = false
  for (const n of notes) {
    const t = sansAccents(n.title)
    const corps = sansAccents(n.content)
    let score = 0
    if (t === c) score = 100
    else if (t.includes(c) || c.includes(t)) score = 80
    else if (mots.length) {
      const dansTitre = mots.filter((m) => t.includes(m)).length
      const dansCorps = mots.filter((m) => corps.includes(m)).length
      score = (dansTitre / mots.length) * 60 + (dansCorps / mots.length) * 25
    }
    if (score > meilleur) {
      meilleur = score
      gagnant = n
      egalite = false
    } else if (score === meilleur && score > 0) {
      egalite = true
    }
  }
  return meilleur >= 40 && !egalite ? gagnant : null
}

/** Ce que Jarvis dit quand on lui demande ses notes. */
export function phraseListeNotes(notes: NoteConnue[], recherche: string | null): string {
  const retenues = recherche
    ? notes.filter((n) => {
        const mots = sansAccents(recherche).split(" ").filter((m) => m.length >= 3)
        const texte = sansAccents(`${n.title} ${n.content}`)
        return mots.length > 0 && mots.some((m) => texte.includes(m))
      })
    : notes
  if (retenues.length === 0) {
    return recherche
      ? `Je ne trouve aucune note qui parle de « ${recherche} ».`
      : "Tu n'as aucune note pour l'instant. Dis « crée une note » suivi de ce que tu veux garder."
  }
  const titres = retenues.slice(0, 8).map((n) => n.title)
  const plus = retenues.length > 8 ? `, et ${retenues.length - 8} autres` : ""
  return `${retenues.length === 1 ? "Une note" : `${retenues.length} notes`}${
    recherche ? ` sur « ${recherche} »` : ""
  } : ${titres.join(", ")}${plus}. Dis « lis la note » et son nom pour l'entendre.`
}

/** Une note lue à voix haute : son titre, puis son texte — coupé au mot au
 * bout de 600 caractères, le reste est dans l'onglet Notes. */
export function phraseLectureNote(note: NoteConnue): string {
  const texte = note.content.replace(/\s+/g, " ").trim()
  if (!texte || sansAccents(texte) === sansAccents(note.title)) return `« ${note.title} ».`
  if (texte.length <= 600) return `« ${note.title} » : ${texte}`
  const coupe = texte.slice(0, 600).replace(/\s+\S*$/, "")
  return `« ${note.title} » : ${coupe}… La suite est dans l'onglet Notes.`
}
