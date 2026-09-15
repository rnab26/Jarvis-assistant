/**
 * Une phrase qui porte DEUX demandes ne se traite pas sur l'appareil.
 *
 * SA PLAINTE, mot pour mot (15 sept. 2026, chantier 7b2c99e2) : « il fait
 * 50% dans la première tâche et 50% en recréant une autre tâche mais du coup
 * difficile de boucler l'ajout d'une tâche sans avoir a faire des retouches
 * manuelles ». Et sa décision, quand je lui ai demandé quoi faire d'une
 * phrase à deux demandes : « vaut mieux exécuter les deux dans l'ordre ».
 *
 * MESURÉ DANS SON JOURNAL, PAS SUPPOSÉ. Le 15 sept. à 06:32:17 il a dicté :
 *
 *     « supprime la tâche Rappel Jonathan Ducamp ET crée la tâche Rappel
 *       Jonathan Dukan dans la partie perso… »
 *
 * et Jarvis a répondu « "Rappel Jonathan Ducamp" supprimée. » — rien d'autre.
 * La réponse portait `source: "appareil"` : c'est la reconnaissance LOCALE
 * qui a mangé la moitié de sa phrase, pas le modèle. Les règles de
 * `commandeLocale.ts` capturent une queue gloutonne (`(.+)$`) et la donnent
 * à `meilleur()`, qui trouve quand même la tâche par ressemblance : la
 * seconde demande disparaît sans un mot. Une consigne côté serveur ne
 * pouvait rien y faire, le serveur n'a jamais été appelé.
 *
 * LA RÉPONSE EST DE SE TAIRE, PAS DE COMPRENDRE PLUS. On n'écrit pas ici un
 * second analyseur de phrases : il divergerait de celui du serveur, et deux
 * lectures du même « et » finiraient par ranger la même dictée à deux
 * endroits. La règle locale est une OPTIMISATION — quand elle n'est pas sûre
 * de tenir la phrase entière, elle rend la main au serveur, à qui la consigne
 * dit depuis le 15 sept. de rendre deux actions dans l'ordre où il les a
 * dites.
 *
 * L'ASYMÉTRIE EST CE QUI JUSTIFIE LE SEUIL. Se taire à tort coûte un
 * aller-retour d'une seconde ; parler à tort perd la moitié de sa demande,
 * en silence, et lui laisse une tâche à retoucher à la main. Dans le doute,
 * on se tait.
 *
 * Module PUR. Vérifié par scripts/verifier-seconde-demande.ts.
 */

/**
 * Ce qui relie deux demandes dans sa façon de parler. Mesuré sur ses vraies
 * dictées (`echanges`), pas listé d'imagination.
 */
const LIAISONS = ["et", "puis", "ensuite", "et ensuite", "et aussi", "et apres"]

/**
 * Les verbes qui OUVRENT une demande, à l'impératif comme à l'infinitif.
 *
 * NE METS JAMAIS ICI UN MOT QUI PEUT ÊTRE UN NOM. C'est tout le garde-fou :
 * ses vrais titres de tâches portent des « et » parfaitement innocents —
 * « Acheter coque airpods ET clefs de voiture », « gocardless a relancer ET
 * molly », « Appeler Yoni pour démarrer + data ET robot ». Ce qui suit le
 * « et » y est un COMPLÉMENT, jamais un verbe. Mesuré le 15 sept. sur ses
 * 40 dernières tâches : 0 déclenchement à tort.
 */
const VERBES_DE_DEMANDE = [
  "cree", "creer", "cre",
  "ajoute", "ajouter", "rajoute", "rajouter",
  "supprime", "supprimer", "efface", "effacer", "enleve", "enlever",
  "envoie", "envoyer", "envoies",
  "marque", "marquer", "coche", "cocher",
  "programme", "programmer",
  "note", "noter",
  "mets", "mettre", "met",
  "range", "ranger",
  "deplace", "deplacer",
  "rappelle", "rappeler",
  "archive", "archiver",
  "lance", "lancer",
  "ouvre", "ouvrir",
  "appelle", "appeler",
  "demande", "demander",
  "modifie", "modifier",
  "renomme", "renommer",
]

function echapper(mot: string): string {
  return mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Construit une seule fois le motif « liaison + verbe de demande ».
 *
 * Les liaisons longues (« et ensuite ») passent AVANT les courtes (« et ») :
 * l'alternance d'une expression régulière retient la première qui accroche,
 * et « et » seul laisserait « ensuite » à la place du verbe.
 *
 * Et le verbe se termine sur une simple frontière de mot, pas sur une espace :
 * il dit « et ENVOIE-LA à Finbot », avec le pronom collé par un tiret. Exiger
 * une espace derrière le verbe laissait passer cette phrase-là, qui est
 * pourtant l'exemple même de deux demandes.
 */
const MOTIF = new RegExp(
  "\\b(?:" +
    [...LIAISONS].sort((a, b) => b.length - a.length).map(echapper).join("|") +
    ")\\s+(?:" +
    VERBES_DE_DEMANDE.map(echapper).join("|") +
    ")\\b",
)

/**
 * Cette phrase porte-t-elle une seconde demande, après la première ?
 *
 * `texte` est la phrase DÉJÀ NETTOYÉE par `commandeLocale.ts` (minuscules,
 * sans accents) : la passer brute raterait « ET CRÉE » autant que « et crée ».
 */
export function porteUneSecondeDemande(texte: string): boolean {
  return MOTIF.test(texte)
}
