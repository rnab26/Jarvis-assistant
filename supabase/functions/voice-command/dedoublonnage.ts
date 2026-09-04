/**
 * Décider si un fait qu'on s'apprête à retenir existe déjà en mémoire.
 *
 * POURQUOI CE FICHIER EXISTE — bug constaté le 3 sept. 2026 sur les vraies
 * données de Raphaël : trois souvenirs quasi identiques écrits en 38 secondes
 * (« la boutique des fripouille », « une boutique appelée Fripouille à
 * Hipouy », « la boutique Fripouille à Hipouy »). La consigne d'extraction dit
 * « un seul souvenir par idée », mais elle ne vaut qu'À L'INTÉRIEUR d'un
 * échange : entre deux phrases, `memoriser()` insérait sans jamais relire.
 * Trois doublons mangent trois des huit places du rappel, diluent la recherche
 * par le sens et rallongent le contexte envoyé à chaque phrase.
 *
 * Aucune dépendance à Deno, exprès : la logique se vérifie sous Node, hors
 * ligne, par `scripts/verifier-dedoublonnage.ts` — comme `google-gmail/message.ts`.
 *
 * POURQUOI DEUX MESURES ET NON UNE. Mesuré sur les 21 souvenirs réels (toutes
 * les paires, 4 sept. 2026) : gte-small place TOUTES les phrases françaises
 * très haut. « Raphaël est marié. » et « Raphaël est impliqué dans un projet
 * concernant une boutique appelée Fripouille à Hipouy. » sont à 0,907 de
 * proximité — deux faits sans le moindre rapport. Un seuil cosinus seul, pour
 * être sûr, devrait être si haut qu'il ne servirait plus à rien.
 *
 * Les chiffres réels, qui donnent les seuils retenus :
 *
 *   vrais doublons        cos 0,978 / 0,966 / 0,958   lexical 0,50 / 0,45 / 0,44
 *   plus proche faux ami  cos 0,938                   lexical 0,33
 *   deuxième faux ami     cos 0,930                   lexical 0,17
 *
 * D'où : proximité ≥ 0,95 ET recouvrement lexical ≥ 0,40. Sur les données
 * réelles : 3 doublons sur 3 trouvés, 0 fusion abusive.
 */

/** Un souvenir déjà en base, remonté par `chercher_souvenirs`. */
export interface CandidatSouvenir {
  id: string
  contenu: string
  categorie?: string | null
  /** 1 - distance cosinus, tel que rendu par la fonction SQL. */
  proximite: number
}

export type Decision =
  /** Rien de comparable : on insère. */
  | { type: "nouveau" }
  /**
   * Même idée qu'un souvenir existant : on enrichit ce souvenir au lieu d'en
   * ajouter un. `contenu` est la formulation à garder — la plus complète des
   * deux, pas forcément la nouvelle.
   */
  | { type: "fusion"; id: string; contenu: string; garderNouvelleFormulation: boolean; proximite: number }
  /**
   * Même sujet mais les chiffres ont changé (« le loyer est de 4 000 » puis
   * « 4 500 ») : l'ancien est périmé, pas effacé, et le nouveau est inséré.
   * C'est exactement ce pour quoi la colonne `perime_at` a été créée — Jarvis
   * doit pouvoir dire « avant c'était 4 000, tu m'as dit 4 500 depuis ».
   */
  | { type: "remplacement"; id: string; proximite: number }

export interface Seuils {
  /** Proximité cosinus minimale pour même envisager un rapprochement. */
  proximite: number
  /** Recouvrement lexical minimal (Jaccard sur les mots porteurs de sens). */
  lexical: number
}

export const SEUILS_PAR_DEFAUT: Seuils = { proximite: 0.95, lexical: 0.4 }

/**
 * Sous ce seuil, inutile de faire descendre un candidat depuis la base : c'est
 * la valeur passée à `chercher_souvenirs`, volontairement plus permissive que
 * `SEUILS_PAR_DEFAUT.proximite` pour qu'un réglage plus bas reste possible
 * sans redéployer.
 */
export const PROXIMITE_CANDIDATS = 0.85

const MOTS_VIDES = new Set(
  (
    "a au aux avec ce cet cette ces dans de des du elle elles en et eux il ils je la le les leur leurs " +
    "lui ma mais me meme memes mes moi mon ne nos notre nous on ou par pas pour qu que qui quoi sa se ses " +
    "son sur ta te tes toi ton tu un une vos votre vous celui celle ceux dont lors sans sous entre chez " +
    "chaque tout tous toute toutes autre autres etre suis es est sommes etes sont sera serai seras serait " +
    "etait etaient ete etee etees avoir ai as avons avez ont avait avaient eu faire fait fais font " +
    "pouvoir peut peux peuvent pourrait devoir doit dois doivent aller vais vont plus moins tres bien " +
    "aussi cela ceci ici la-bas deja encore alors donc car mais or ni puis quand comme si oui non"
  ).split(" "),
)

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Les mots qui portent le sens : sans accents, sans ponctuation, sans mots
 * outils, et sans la marque du pluriel — « boutiques » et « boutique » doivent
 * compter pour le même mot, sinon deux dictées de la même phrase divergent.
 */
export function motsSignificatifs(texte: string): Set<string> {
  const out = new Set<string>()
  for (const brut of sansAccents(texte.toLowerCase()).split(/[^a-z0-9]+/)) {
    if (!brut || brut.length < 3 || MOTS_VIDES.has(brut)) continue
    const racine = brut.replace(/[sx]$/, "")
    if (racine.length >= 3) out.add(racine)
  }
  return out
}

/** Recouvrement lexical (Jaccard) entre deux phrases. */
export function recouvrementLexical(a: string, b: string): number {
  const A = motsSignificatifs(a)
  const B = motsSignificatifs(b)
  if (!A.size || !B.size) return 0
  let commun = 0
  for (const mot of A) if (B.has(mot)) commun++
  return commun / (A.size + B.size - commun)
}

/**
 * Les noms propres, hors début de phrase — où la majuscule ne dit rien.
 *
 * Ils servent de garde-fou : « Raphaël gère la villa Dan » et « Raphaël gère
 * la villa Ben » sont lexicalement et sémantiquement presque identiques, et ce
 * sont pourtant deux dossiers. Deux noms propres MUTUELLEMENT exclusifs = deux
 * sujets. Un nom propre présent d'un seul côté n'est en revanche qu'une
 * précision (« la boutique des fripouille » → « la boutique Fripouille à
 * Hipouy »), et doit fusionner.
 */
export function nomsPropres(texte: string): Set<string> {
  const out = new Set<string>()
  for (const m of texte.matchAll(/[\p{L}\p{N}]+/gu)) {
    const mot = m[0]
    const initiale = mot[0]
    if (initiale.toLowerCase() === initiale.toUpperCase()) continue // chiffre
    if (initiale !== initiale.toUpperCase()) continue // minuscule
    const avant = texte.slice(0, m.index).replace(/[\s"'«»“”‘’()[\]–—-]+$/u, "")
    if (avant === "" || /[.!?:;…]$/u.test(avant)) continue // début de phrase
    out.add(sansAccents(mot.toLowerCase()))
  }
  return out
}

/**
 * Les nombres d'une phrase, normalisés : « 4 000 », « 4.000 » et « 4000 »
 * doivent se comparer. Les séparateurs de milliers sont recollés d'abord.
 */
export function nombres(texte: string): Set<string> {
  const compact = texte.replace(/(\d)[\s.,\u00a0\u202f](?=\d{3}(?!\d))/gu, "$1")
  const out = new Set<string>()
  for (const m of compact.matchAll(/\d+(?:[.,]\d+)?/gu)) out.add(m[0].replace(",", "."))
  return out
}

function exclusifs(a: Set<string>, b: Set<string>): boolean {
  let aSeul = false
  let bSeul = false
  for (const x of a) if (!b.has(x)) aSeul = true
  for (const x of b) if (!a.has(x)) bSeul = true
  return aSeul && bSeul
}

/**
 * Nombre de mots porteurs de sens : sert à choisir la formulation à garder.
 * « la boutique des fripouille » (2) perd contre « la boutique Fripouille à
 * Hipouy » (3), quel que soit l'ordre d'arrivée.
 */
export function completude(texte: string): number {
  return motsSignificatifs(texte).size
}

/** Cosinus de deux empreintes déjà normalisées ; sert aux comparaisons en mémoire. */
export function cosinus(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let produit = 0
  let normeA = 0
  let normeB = 0
  for (let i = 0; i < a.length; i++) {
    produit += a[i] * b[i]
    normeA += a[i] * a[i]
    normeB += b[i] * b[i]
  }
  if (!normeA || !normeB) return 0
  return produit / Math.sqrt(normeA * normeB)
}

/**
 * Que faire d'un fait qu'on s'apprête à retenir, au vu des souvenirs déjà là.
 *
 * Les candidats sont examinés du plus proche au plus lointain : le plus proche
 * peut être écarté par le garde-fou des noms propres alors que le suivant est
 * le vrai doublon.
 */
export function decider(
  nouveau: string,
  candidats: CandidatSouvenir[],
  seuils: Seuils = SEUILS_PAR_DEFAUT,
): Decision {
  const texte = nouveau.trim()
  if (!texte) return { type: "nouveau" }

  const tries = [...candidats].sort((x, y) => y.proximite - x.proximite)

  for (const candidat of tries) {
    if (!candidat?.contenu) continue
    if (candidat.proximite < seuils.proximite) break // triés : les suivants sont pires
    if (recouvrementLexical(texte, candidat.contenu) < seuils.lexical) continue

    // Deux sujets distincts qui se ressemblent : on n'y touche pas.
    if (exclusifs(nomsPropres(texte), nomsPropres(candidat.contenu))) continue

    // Même sujet, chiffres différents : le fait a changé, il n'est pas répété.
    if (exclusifs(nombres(texte), nombres(candidat.contenu))) {
      return { type: "remplacement", id: candidat.id, proximite: candidat.proximite }
    }

    const nouvelleEstPlusRiche =
      completude(texte) > completude(candidat.contenu) ||
      (completude(texte) === completude(candidat.contenu) && texte.length > candidat.contenu.length)

    return {
      type: "fusion",
      id: candidat.id,
      contenu: nouvelleEstPlusRiche ? texte : candidat.contenu,
      garderNouvelleFormulation: nouvelleEstPlusRiche,
      proximite: candidat.proximite,
    }
  }

  return { type: "nouveau" }
}
