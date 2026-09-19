/**
 * CE QU'ON AFFICHE PENDANT QU'IL PARLE, ET POURQUOI ÇA A CHANGÉ.
 *
 * Sa remarque du 15 sept. 2026 : « le temps de préparation du micro est
 * toujours très long. C'est jamais instantané lorsque j'active le micro. En
 * gros je parle dans le vide le temps que ça s'initialise, c'est assez
 * long. »
 *
 * ON A CHERCHÉ LA LENTEUR AU MAUVAIS ENDROIT PENDANT QUATRE JOURS, et la
 * mesure a tranché (chantier 53d99720, nombres relevés le 19 sept. sur ses
 * quatre vrais tours du 18/09) :
 *
 *     ms_ouverture   : 46, 40, 23, 25 ms   <- NOTRE chemin, jusqu'à `start()`
 *     ms_premier_mot : 2826 et 1135 ms     <- Android, avant son premier mot
 *
 * La préparation du micro ne dure donc PAS : `ready` passe à vrai en moins
 * de 50 ms, et « Préparation du micro… » n'est visible qu'un clin d'œil.
 * Ce qu'il vit est l'inverse de ce qu'il décrit — l'écran lui dit « Je
 * t'écoute » tout de suite, puis ne bouge plus pendant une à trois secondes
 * pendant qu'il parle, parce que le premier résultat partiel d'Android met
 * ce temps-là à arriver. Un écran figé pendant qu'on parle se lit comme un
 * micro qui n'écoute pas encore : d'où « je parle dans le vide ».
 *
 * ET SES MOTS NE SONT PAS PERDUS — c'est ce qui rend la phrase ci-dessous
 * honnête et pas rassurante à bon compte. Mesuré sur son tour de 11h59:57 :
 * 2826 ms avant le premier partiel, et pourtant « Jarvis tu es dispo ou
 * pas » transcrit en entier, en 9 partiels. Le service d'Android garde
 * l'audio depuis l'ouverture ; seul l'AFFICHAGE est en retard.
 *
 * On ne peut donc rien accélérer (c'est mesuré hors de notre portée), mais
 * on peut cesser de le laisser deviner.
 */

/** La clé du délai, déclarée dans `REGLAGES` : il se règle dans Paramètres. */
export const CLE_ATTENTE_TRANSCRIPTION = "jarvis_ecoute_attente_ms"

/**
 * Au bout de combien de temps sans un mot à l'écran on le rassure.
 *
 * 600 ms est choisi SUR LA MESURE, pas au jugé : le premier partiel arrive
 * entre 1135 et 2826 ms, donc la phrase apparaît à tous les coups dans le
 * cas qui le gêne, et jamais dans un tour où Android répond vite. Un message
 * qui clignote à chaque prise de parole serait du bruit, et le bruit
 * permanent finit par cacher le jour où il dit autre chose.
 */
export const ATTENTE_TRANSCRIPTION_MS = 600

export interface EtatAttente {
  /** `start()` a résolu : le micro est réellement ouvert. */
  pret: boolean
  /** Au moins un mot du tour EN COURS est déjà à l'écran. */
  aDuTexte: boolean
  /** Le délai ci-dessus est écoulé depuis l'ouverture, sans un mot. */
  attenteDepassee: boolean
}

/**
 * La ligne affichée sous le cœur pendant une écoute de commande.
 *
 * Trois états et pas deux. Le troisième est tout l'objet du chantier : le
 * micro est ouvert, il parle, et rien ne s'affiche encore.
 */
export function phraseEcoute(etat: EtatAttente): string {
  if (!etat.pret) return "Je prépare le micro…"
  // ON NE DIT PAS « PATIENTE », ON DIT QU'IL EST ENTENDU. La nuance est tout
  // ce qui compte ici : lui demander d'attendre le ferait s'arrêter de
  // parler, alors que ses mots sont déjà captés — et il devrait tout
  // redire, ce qui est précisément la corvée dont il se plaint ailleurs.
  if (etat.pret && !etat.aDuTexte && etat.attenteDepassee) {
    return "Je t'écoute — continue, tes mots s'affichent avec un temps de retard."
  }
  return "Je t'écoute — touche le cœur quand tu as fini."
}

/**
 * Le délai retenu, à partir de ce qui est enregistré.
 *
 * `0` est une valeur VOULUE : « Jamais » dans Paramètres. Une valeur absente
 * ou illisible retombe sur le défaut et jamais sur zéro — sinon un réglage
 * corrompu éteindrait en silence ce qu'on vient de livrer, et personne ne le
 * verrait (c'est la leçon de `lireSeuilAbandon`).
 */
export function lireAttente(brut: string | null): number {
  if (brut === null) return ATTENTE_TRANSCRIPTION_MS
  const n = Number(brut)
  if (!Number.isFinite(n) || n < 0) return ATTENTE_TRANSCRIPTION_MS
  return Math.floor(n)
}

/** Le délai est-il actif ? `0` veut dire « ne le dis jamais ». */
export function attenteActive(ms: number): boolean {
  return ms > 0
}
