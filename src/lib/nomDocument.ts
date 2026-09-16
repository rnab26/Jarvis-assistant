/**
 * LE NOM D'UN FICHIER N'EST PAS UNE CLÉ DE STOCKAGE (chantier « Impossible
 * d'importer des documents », 15 sept. 2026).
 *
 * Sa capture : l'onglet Docs en rouge, et le message tel quel —
 *
 *     Invalid key: 8bb3be37-…/טופס 18 פופי יוגה 162437_260915_בעמ.pdf
 *
 * `useDocuments` posait le nom du fichier DIRECTEMENT dans la clé de l'objet
 * Supabase Storage. Storage valide cette clé, et son alphabet est étroit.
 *
 * MESURÉ CONTRE SON VRAI PROJET, PAS LU DANS UNE DOC — un POST par caractère
 * sur `storage/v1/object/documents`, le 15 sept. 2026 :
 *
 *     ACCEPTÉS : ! * ' & $ @ ; : + , ? = ( ) - . _ (espace) et A-Z a-z 0-9
 *     REFUSÉS  : ~ ^ % " < > | \ ` { } # [ ]
 *     REFUSÉS aussi, et c'est le point : « facture été.pdf », « reçu.pdf »,
 *     « טופס 18.pdf » — 400 « Invalid key » sur chacun.
 *
 * L'HÉBREU N'ÉTAIT DONC QUE LA MOITIÉ VISIBLE. Tout nom accentué échouait de
 * la même façon, et il vit entre le français et l'hébreu : « reçu », « été »,
 * « à payer » sont des noms de fichier ordinaires chez lui. Ne réduis pas ce
 * module à « le support de l'hébreu ».
 *
 * POURQUOI ON N'ASSAINIT PAS BÊTEMENT. Remplacer l'interdit par « _ » aurait
 * tenu en une ligne — et son document se serait appelé
 * « ____ 18 ____ ____ 162437_260915____.pdf », c'est-à-dire plus rien. Un nom
 * de document sert à le RETROUVER ; le perdre en l'enregistrant, c'est une
 * autre façon de ne pas l'importer.
 *
 * D'OÙ UN ÉCHAPPEMENT RÉVERSIBLE, et `=` en tête parce qu'il est ACCEPTÉ par
 * Storage (mesuré ci-dessus) : chaque unité de code interdite devient `=XXXX`
 * (son hexadécimal sur quatre chiffres), et `=` lui-même devient `=003D` pour
 * que le décodage ne soit jamais ambigu. Un nom déjà ASCII traverse donc
 * INCHANGÉ — les documents d'avant ce correctif gardent leur clé, il n'y a
 * rien à migrer.
 */

/** L'alphabet qu'accepte Storage, mesuré caractère par caractère (voir
 * l'en-tête). `/` en est retiré exprès : Storage l'accepte, mais c'est le
 * séparateur de chemin — un nom de fichier qui en contient créerait un
 * sous-dossier au lieu d'un document. */
const AUTORISES = /[A-Za-z0-9_!\-.*'() &$@;:+,?]/

/**
 * Le marqueur d'échappement : `=u`, et les DEUX caractères comptent.
 *
 * `=` seul ne suffisait pas, et c'est un CONTRÔLE qui l'a montré avant qu'on
 * s'en aperçoive à l'usage : « budget=2026.pdf » — un nom parfaitement
 * ordinaire, stocké AVANT ce correctif — porte un `=` suivi de quatre
 * chiffres hexadécimaux valides. Il se serait affiché « budget….pdf »
 * (U+2026, les points de suspension). On aurait réparé l'import en abîmant
 * l'affichage de ce qui était déjà là.
 *
 * `=u` ne laisse plus de prise raisonnable : il faudrait un nom contenant
 * littéralement « =u » suivi de quatre chiffres hexadécimaux. Ce n'est pas
 * impossible, c'est improbable — et on le dit, plutôt que de prétendre le
 * contraire.
 *
 * `=` lui-même s'échappe (en `=u003D`) pour que l'aller-retour de ce que NOUS
 * écrivons soit exact quoi qu'il arrive.
 */
const ECHAPPE = "=u"

/**
 * Le budget d'une clé. S3 plafonne une clé à 1024 octets, et l'identifiant de
 * l'utilisateur plus le « / » en consomment déjà 37. On garde large : un nom
 * entièrement en hébreu coûte six caractères par lettre, donc 150 lettres au
 * pire. Au-delà on coupe le corps du nom, JAMAIS l'extension — c'est elle qui
 * décide si le téléphone sait ouvrir le fichier.
 */
const BUDGET_CLE = 900

/** Sépare « facture.pdf » en « facture » et « .pdf ». Un point en tête
 * (« .profil ») n'est pas une extension, et un nom sans point n'en a pas. */
function couper(nom: string): { corps: string; extension: string } {
  const i = nom.lastIndexOf(".")
  if (i <= 0) return { corps: nom, extension: "" }
  return { corps: nom.slice(0, i), extension: nom.slice(i) }
}

function echapper(texte: string): string {
  let sortie = ""
  for (const unite of texte) {
    for (let i = 0; i < unite.length; i++) {
      const c = unite[i]
      if (c !== "=" && AUTORISES.test(c)) sortie += c
      else sortie += ECHAPPE + unite.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0")
    }
  }
  return sortie
}

/**
 * Le nom tel qu'on l'écrit dans Storage. Réversible par `nomLisible`.
 *
 * Rend une chaîne vide seulement si le nom l'était : c'est à l'appelant de
 * décider quoi faire d'un fichier sans nom, pas à ce module d'en inventer un.
 */
export function cleStockage(nom: string): string {
  const propre = nom.trim()
  if (!propre) return ""
  const { corps, extension } = couper(propre)
  const extensionEchappee = echapper(extension)
  let corpsEchappe = echapper(corps)
  if (corpsEchappe.length + extensionEchappee.length > BUDGET_CLE) {
    // On coupe sur une frontière d'échappement, jamais au milieu d'un `=XXXX`
    // qui deviendrait illisible — d'où la reconstruction plutôt qu'un slice.
    const place = Math.max(0, BUDGET_CLE - extensionEchappee.length)
    let garde = ""
    for (const morceau of corpsEchappe.match(/=u[0-9A-F]{4}|[\s\S]/g) ?? []) {
      if (garde.length + morceau.length > place) break
      garde += morceau
    }
    corpsEchappe = garde
  }
  return corpsEchappe + extensionEchappee
}

/**
 * Le nom à MONTRER, retrouvé depuis la clé.
 *
 * Strict exprès : seul `=u` suivi d'exactement quatre chiffres hexadécimaux
 * se décode. Un document d'avant ce correctif dont le nom contenait un `=` —
 * et « budget=2026.pdf » suffit, ses quatre caractères suivants étant de
 * l'hexadécimal valide — se relit donc tel quel, au lieu d'être mutilé.
 */
export function nomLisible(cle: string): string {
  return cle.replace(/=u([0-9A-Fa-f]{4})/g, (tel, hex: string) => {
    const code = Number.parseInt(hex, 16)
    return Number.isNaN(code) ? tel : String.fromCharCode(code)
  })
}

/**
 * CE QU'IL LIT QUAND UN IMPORT ÉCHOUE. L'écran relayait le message brut de
 * Storage — « Invalid key: 8bb3be37-…/טופס 18 … .pdf » —, c'est-à-dire de
 * l'anglais, un identifiant technique, et aucune indication de ce qu'il peut
 * faire. C'est la même règle que pour le serveur vocal : on dit ce qu'on a
 * constaté, en français, et on ne relaie un message étranger qu'en dernier
 * recours.
 *
 * Le cas « Invalid key » ne devrait PLUS arriver depuis `cleStockage`. S'il
 * revient, c'est un défaut de notre échappement, pas de son fichier — et la
 * phrase le dit, plutôt que de le laisser renommer ses documents pour rien.
 */
export function messageEchecImport(brut: string): string {
  const texte = brut.toLowerCase()
  if (texte.includes("invalid key")) {
    return "Le nom de ce fichier n'a pas pu être enregistré. Ça vient de Jarvis, pas de ton fichier : signale-le."
  }
  if (texte.includes("exceeded the maximum allowed size") || texte.includes("payload too large") || texte.includes("413")) {
    return "Ce fichier est trop lourd pour le stockage."
  }
  if (
    texte.includes("failed to fetch") ||
    texte.includes("load failed") ||
    texte.includes("network request failed") ||
    texte.includes("networkerror")
  ) {
    // On ne dit PAS « ça n'est pas parti » : du téléphone on ne peut pas
    // savoir si Storage a reçu le fichier. Même règle que la coupure réseau
    // du serveur vocal.
    return "La connexion a coupé pendant l'envoi. Regarde si le document est dans la liste avant de recommencer."
  }
  return brut.trim() ? `L'envoi a échoué : ${brut.trim()}` : "L'envoi du document a échoué."
}

/**
 * UNE LIGNE DE STORAGE DEVIENT UNE LIGNE DE LA LISTE. Une seule fonction, et
 * c'est le point : `useDocuments` la range dans son état, le banc d'essai de
 * l'écran l'appelle pour fabriquer le sien. Tant qu'elle était recopiée des
 * deux côtés, casser la conversion dans le hook laissait le banc VERT — essayé
 * le 15 sept. 2026, c'est le piège du contrôle qui vérifie sa propre
 * paraphrase.
 *
 * `path` est ce que Storage connaît, `name` ce que Raphaël lit. Les deux
 * diffèrent dès qu'un nom sort de l'alphabet étroit de Storage.
 */
export function ligneDeDocument(
  utilisateur: string,
  cle: string,
  taille: number,
  creeLe: string,
  typeContenu: string | null,
): { name: string; path: string; size: number; createdAt: string; contentType: string | null } {
  return {
    name: nomLisible(cle),
    path: `${utilisateur}/${cle}`,
    size: taille,
    createdAt: creeLe,
    contentType: typeContenu,
  }
}
