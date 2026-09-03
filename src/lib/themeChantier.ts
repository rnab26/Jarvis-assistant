/**
 * Empêche un thème d'exister en deux exemplaires.
 *
 * Le 3 sept. 2026, la base portait « L'app elle-même » ET « L app elle-meme »,
 * « Voix et écoute » ET « Voix et ecoute ». Même sujet, deux lignes dans le
 * cockpit, et le regroupement par thème — qui est la façon dont Raphaël veut
 * qu'on travaille — se retrouvait coupé en deux. Les doublons venaient de
 * sessions qui écrivaient sans accents pour éviter les ennuis d'échappement
 * SQL, et de la saisie libre côté app.
 *
 * La clé ci-dessous compare deux thèmes sur ce qui compte vraiment : les
 * lettres. Accents, apostrophes, tirets, majuscules et espaces multiples ne
 * distinguent pas deux sujets — ils ne font que fabriquer des jumeaux.
 */

/** « L app elle-meme » et « L'app elle-même » donnent la même clé. */
export function cleTheme(theme: string): string {
  return theme
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Apostrophe droite ou courbe, tiret, souligné : tous des séparateurs.
    .replace(/['’\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Le thème à enregistrer réellement pour ce que l'utilisateur a saisi.
 *
 * Si un thème équivalent existe déjà, on renvoie CELUI-LÀ, à l'orthographe
 * près : c'est ce qui évite le jumeau. Sinon on renvoie la saisie nettoyée,
 * et un nouveau thème naît — ce qui reste légitime.
 */
export function resoudreTheme(saisie: string, existants: string[]): string | null {
  const propre = saisie.trim().replace(/\s+/g, " ")
  if (!propre) return null

  const cle = cleTheme(propre)
  return existants.find((t) => cleTheme(t) === cle) ?? propre
}
