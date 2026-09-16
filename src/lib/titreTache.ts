/**
 * LE TITRE D'UNE TÂCHE EST CE QU'IL Y A À FAIRE, PAS LA PHRASE QU'IL A DITE.
 *
 * Chantier `7b2c99e2`, sa phrase du 15 sept. 2026 : « difficile de boucler
 * l'ajout d'une tâche sans avoir a faire des retouches manuelles ».
 *
 * MESURÉ SUR SES VRAIES DICTÉES, pas supposé — deux titres réellement créés
 * ce jour-là, relus dans `echanges` :
 *
 *   « note un rappel comme quoi je dois rappeler dan Marciano jeudi matin
 *     à 10h »            → « Un rappel comme quoi je dois rappeler dan
 *                            marciano matin »
 *   « rajoute une tâche dans les prélèvements de relancer Moli aujourd'hui
 *     avant midi »       → « Dans les prelevements de relancer moli avant »
 *
 * Le titre garde les mots de COMMANDE et perd ceux qui portent le sens. Sur
 * une liste de trente lignes, « Un rappel comme quoi je dois… » ne se lit
 * pas : il faut relire la phrase entière pour savoir de quoi il s'agit.
 *
 * SA DÉCISION, mot pour mot (15 sept., cockpit) : « Les deux : le modèle
 * écrit, la règle rattrape ». Ce module est la RÈGLE — le filet. La consigne
 * du serveur reste la première ligne de défense ; celle-ci rattrape ce qui
 * passe, y compris les phrases comprises SANS le modèle (hors ligne,
 * `commandeLocale.ts`), où aucune consigne ne s'applique.
 *
 * IL NETTOIE UN TITRE, PAS UNE PHRASE. C'est ce que sa décision dit : le
 * modèle écrit d'abord, la règle repasse derrière. Appliquer la même règle à
 * la phrase brute reviendrait à se passer du modèle.
 *
 * ET IL EN FAIT LE MOINS POSSIBLE. Un titre mal coupé est pire qu'un titre
 * long : long, il se lit ; coupé, il ment. D'où trois garde-fous — on ne
 * retire qu'une amorce CONNUE, seulement en TÊTE, et jamais si ce qui reste
 * est trop court pour vouloir dire quelque chose.
 */

/**
 * Les amorces à retirer, en tête seulement.
 *
 * CHACUNE VIENT D'UNE DICTÉE RÉELLE ou de la même famille immédiate. Ne
 * complète cette liste qu'en regardant ses vraies tâches — la mesure se refait
 * ainsi :
 *
 *   select title from tasks order by created_at desc limit 40;
 *
 * NE JAMAIS Y METTRE un verbe qui porte l'action elle-même : « rappeler »,
 * « appeler », « relancer », « acheter », « envoyer ». Ce sont EUX le titre.
 * « Rappeler la banque Apoalim » et « Acheter coque airpods » sont deux de ses
 * vraies tâches, et elles doivent traverser sans une égratignure.
 */
const AMORCES = [
  // Ce qu'il dit pour DEMANDER une note — c'est la commande, pas le contenu.
  "un rappel comme quoi je dois",
  "un rappel comme quoi il faut que je",
  "un rappel comme quoi",
  "rappel comme quoi je dois",
  "rappel comme quoi",
  "une note comme quoi je dois",
  "une note comme quoi",
  "note comme quoi",
  "une tache comme quoi je dois",
  "une tache comme quoi",
  // Les verbes de commande eux-mêmes, quand ils ont survécu dans le titre.
  "note que je dois",
  "note que",
  "noter que je dois",
  "noter que",
  "ajoute une tache de",
  "ajoute une tache pour",
  "ajoute une tache",
  "rajoute une tache de",
  "rajoute une tache pour",
  "rajoute une tache",
  "ajouter une tache",
  "mets moi un rappel pour",
  "mets moi un rappel de",
  "mets moi un rappel",
  "mets un rappel pour",
  "mets un rappel de",
  "mets un rappel",
  // Ce qui reste d'une mention de rangement que le serveur n'a pas retirée.
  // « Dans les prelevements de relancer moli » — le « de » fait partie de
  // l'amorce, sans lui le titre commencerait par une préposition orpheline.
  "dans la categorie de",
  "dans la categorie",
  "dans la section de",
  "dans la section",
  "dans la tache de",
  "dans la tache des",
  "dans la tache",
  // Ce qu'il dit de lui-même avant l'action.
  "il faut que je pense a",
  "il faut que je",
  "je dois penser a",
  "je dois",
  "penser a",
]

/**
 * En dessous, on ne touche à rien : ce qui resterait ne dirait plus ce que la
 * tâche est. Trois caractères, c'est « RDV » — plus court, c'est du bruit.
 */
const RESTE_MINIMUM = 3

/** Sans accents, minuscules, apostrophes normalisées : la comparaison ne doit
 * pas dépendre de la façon dont la dictée a écrit le mot. Même esprit que
 * `cleTheme()`, mais sur une amorce et pas sur un nom. */
function comparable(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** « relancer moli » → « Relancer moli ». On ne touche QUE la première lettre :
 * réécrire le reste abîmerait un nom propre qu'il a bien prononcé. */
function premiereEnMajuscule(texte: string): string {
  if (!texte) return texte
  return texte[0].toLocaleUpperCase("fr-FR") + texte.slice(1)
}

/**
 * Le titre tel qu'il doit apparaître dans sa liste.
 *
 * Rend le titre INCHANGÉ quand rien de connu ne le précède — c'est le cas de
 * loin le plus fréquent, et le silence est le bon comportement par défaut.
 */
export function titreLisible(brut: string): string {
  const titre = brut.trim().replace(/\s+/g, " ")
  if (!titre) return titre

  const reference = comparable(titre)
  // La PLUS LONGUE amorce qui correspond, pas la première trouvée : « un
  // rappel comme quoi je dois » et « rappel comme quoi » commencent pareil, et
  // s'arrêter à la plus courte laisserait « je dois » collé devant l'action.
  let meilleure = ""
  for (const amorce of AMORCES) {
    if (amorce.length <= meilleure.length) continue
    // La frontière compte : sans elle, « note » retirerait le début de
    // « Noter les mesures ». On exige donc un espace juste après l'amorce.
    if (reference === amorce || reference.startsWith(`${amorce} `)) meilleure = amorce
  }
  if (!meilleure) return titre

  // On coupe sur le titre D'ORIGINE, à la longueur de l'amorce mesurée sur sa
  // version comparable : les deux ont le même nombre de caractères parce que
  // `comparable` ne fait que remplacer, jamais supprimer — sauf les espaces
  // multiples, déjà réduits plus haut sur le titre lui-même.
  const reste = titre.slice(meilleure.length).trim()
  if (reste.length < RESTE_MINIMUM) return titre

  return premiereEnMajuscule(reste)
}
