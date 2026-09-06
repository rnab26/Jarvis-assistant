// Tirer d'une page web le texte qu'un humain y lirait.
//
// Chantier 73f06a28. PUR : aucun réseau, aucun Deno, aucune dépendance — donc
// vérifiable hors ligne (`scripts/verifier-lire-document.ts`). C'est
// nécessaire ici parce que ce qui rate se voit mal : une page dont on ne garde
// que le menu de navigation produit un résumé plausible et faux, et rien ne le
// signale.
//
// POURQUOI PAS UN VRAI ANALYSEUR HTML : il n'y en a pas dans le runtime des
// Edge Functions sans ajouter une dépendance, et on n'a pas besoin d'un arbre.
// On a besoin du texte, débarrassé de ce qui n'en est pas. Un découpage par
// expressions régulières suffit pour ça, à condition de retirer d'abord les
// blocs qui CONTIENNENT du texte sans en être — script, style, nav, footer.
//
// CE QU'ON NE FAIT PAS, ET C'EST VOULU : exécuter le JavaScript de la page. Un
// site qui ne rend son contenu qu'en JS rendra donc peu de chose, et il vaut
// mieux le DIRE que rapporter un résumé bâti sur trois mots de menu — d'où
// `assezDeTexte()`.

/**
 * Au-delà, on tronque. Chaque appel envoie déjà ~26 000 caractères de consigne
 * et ~17 800 de schéma d'outil : une page entière de 300 000 caractères ferait
 * exploser le plafond de jetons par minute, et Jarvis répondrait « j'ai atteint
 * la limite » au lieu de résumer.
 */
export const MAX_CARACTERES = 40_000

/**
 * En dessous, on n'a manifestement pas trouvé le contenu : page rendue en
 * JavaScript, mur de connexion, ou redirection vers une coquille. Mieux vaut le
 * dire que résumer un menu de navigation.
 */
export const MINIMUM_UTILE = 200

/** Les blocs dont le texte n'est pas du contenu. Retirés AVANT tout le reste. */
const BLOCS_A_JETER =
  /<(script|style|noscript|svg|template|nav|header|footer|aside|form|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi

/** Les entités qu'on croise vraiment dans une page française. */
const ENTITES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", ccedil: "ç",
  ugrave: "ù", ocirc: "ô", icirc: "î", euro: "€", laquo: "«", raquo: "»",
  hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  mdash: "—", ndash: "–", deg: "°", times: "×", middot: "·",
}

export function decoderEntites(texte: string): string {
  return texte
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (entier, nom) => ENTITES[nom.toLowerCase()] ?? entier)
}

/** Le titre de la page, quand elle en a un. */
export function titreDeLaPage(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!m) return null
  const titre = decoderEntites(m[1]).replace(/\s+/g, " ").trim()
  return titre || null
}

/**
 * Le corps de la page, en texte.
 *
 * On préfère `<main>` ou `<article>` quand la page en déclare un : c'est le
 * contenu que le site lui-même désigne comme principal, et ça écarte d'un coup
 * bandeaux, colonnes latérales et pieds de page. Sinon on prend tout le
 * `<body>`, une fois les blocs parasites retirés.
 */
export function texteDeLaPage(html: string): string {
  const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, " ")
  const principal =
    sansCommentaires.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    sansCommentaires.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    sansCommentaires.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    sansCommentaires

  return decoderEntites(
    principal
      .replace(BLOCS_A_JETER, " ")
      // Les fins de bloc deviennent des retours à la ligne : sans ça, deux
      // paragraphes et deux cellules de tableau se recollent en une phrase, et
      // un montant se retrouve soudé à son libellé.
      .replace(/<\/(p|div|li|tr|h[1-6]|section|blockquote|td|th)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** A-t-on trouvé assez pour qu'un résumé veuille dire quelque chose ? */
export function assezDeTexte(texte: string): boolean {
  return texte.length >= MINIMUM_UTILE
}

export interface Page {
  titre: string | null
  texte: string
  tronquee: boolean
}

/** Le tout : ce qu'on enverra au modèle, borné. */
export function lirePage(html: string): Page {
  const texte = texteDeLaPage(html)
  return {
    titre: titreDeLaPage(html),
    texte: texte.slice(0, MAX_CARACTERES),
    tronquee: texte.length > MAX_CARACTERES,
  }
}

/** `text/html`, `application/xhtml+xml`… sans le charset. */
export function typeNu(type: string | null): string {
  return (type ?? "").split(";")[0].trim().toLowerCase()
}
