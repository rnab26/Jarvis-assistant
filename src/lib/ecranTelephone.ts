/**
 * Désigner un élément de l'écran à la voix — la partie qui décide.
 *
 * D'OÙ ÇA VIENT. Raphaël, 5 sept. 2026 : « j'aimerais pousser encore un peu
 * plus loin pour savoir s'il peut défiler l'écran en lui disant "attends,
 * vas-y lance la deuxième vidéo", et ça lance la deuxième vidéo. » Et sa
 * précision du 6 sept., qui élargit : « il faut aussi que ça puisse faire une
 * activation de clics tout simplement sur le téléphone à la demande orale, et
 * ça ce n'est pas là pour n'importe quoi, pas que pour WhatsApp. »
 *
 * Donc UNE brique, pas deux : le service d'accessibilité rend la liste de ce
 * qui est affiché, ce module en tire l'élément désigné, et le service clique.
 * « la deuxième vidéo », « celle avec Booba dans le titre », « le bouton
 * envoyer » passent tous par ici. WhatsApp et YouTube n'en sont que les
 * premiers usages.
 *
 * POURQUOI ÇA NE PASSE PAS PAR LE MODÈLE. Choisir un élément parmi ceux
 * affichés est une décision locale, instantanée et gratuite — comme la
 * section suggérée à la saisie (suggestionTheme.ts). L'envoyer au modèle
 * coûterait un aller-retour de plus à chaque clic, puiserait dans le quota
 * gratuit, et ne marcherait pas en mode Live où le contexte est scellé à
 * l'ouverture de la session.
 *
 * LA RÈGLE DE SÛRETÉ EST DANS CE FICHIER, et elle ne se négocie pas : quand
 * l'élément désigné n'existe pas, ou que deux éléments différents se valent,
 * on ne rend RIEN à cliquer. Un clic au hasard dans une application ouverte
 * est une action qu'on ne rattrape pas.
 *
 * Module PUR : aucun appel à Android, aucun réseau. Vérifié par
 * scripts/verifier-ecran.ts.
 */

/** Un élément lu sur l'écran par le service d'accessibilité. */
export interface ElementEcran {
  /** Rang dans le parcours de l'arbre, tel que le service l'a numéroté. Sert
   * à le retrouver au moment du clic — et à vérifier que l'écran n'a pas
   * changé entre la lecture et le clic. */
  index: number
  /** Le texte affiché, ou à défaut la description pour l'accessibilité. */
  libelle: string
  /** Vrai si le nœud lui-même, ou un de ses parents, sait recevoir un clic. */
  cliquable: boolean
  /** Vrai si ce nœud sait défiler. */
  defilable?: boolean
  /** Vrai si ce nœud est DANS une liste qui défile. C'est ce qui sépare le
   * contenu de la barre d'outils — voir `designer`. */
  dansListe?: boolean
  /** Le nom de classe Android, quand il est connu ("android.widget.Button"). */
  classe?: string
}

/** Ce que le service rend d'une lecture d'écran. */
export interface LectureEcran {
  /** Le paquet de l'application au premier plan ("com.google.android.youtube"). */
  paquet: string
  /** Son nom lisible, quand Android sait le donner. */
  application?: string
  elements: ElementEcran[]
}

/** Ce qu'on peut demander à l'écran. */
export type CommandeEcran =
  | "clic"
  | "defiler_bas"
  | "defiler_haut"
  | "retour"
  | "accueil"
  | "lire"

/** Les issues d'une désignation qui n'a PAS abouti : celles où l'on ne
 * clique sur rien. Elles ne se confondent pas avec un succès. */
export type DesignationRatee =
  | { etat: "aucun"; raison: "rien_affiche" | "introuvable" | "rang_trop_grand" }
  | { etat: "ambigu"; candidats: ElementEcran[] }

export type Designation =
  | { etat: "trouve"; element: ElementEcran }
  | { etat: "aucun"; raison: "rien_affiche" | "introuvable" | "rang_trop_grand" }
  | { etat: "ambigu"; candidats: ElementEcran[] }

function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Les mots qui ne désignent rien par eux-mêmes. */
const MOTS_VIDES = new Set([
  "le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "au", "aux",
  "a", "sur", "dans", "en", "et", "ou", "qui", "que", "quoi", "ce", "cet",
  "cette", "ces", "celui", "celle", "ceux", "celles", "avec", "pour", "par",
  "moi", "me", "toi", "te", "y", "s", "se", "son", "sa", "ses", "mon", "ma",
  "mes", "il", "elle", "vas", "va", "vasy", "allez", "appuie", "appuies",
  "clique", "cliques", "clic", "presse", "touche", "lance", "lances",
  "ouvre", "ouvres", "choisis", "choisi", "prend", "prends", "selectionne",
  "selectionnes", "fais", "fait", "sil", "te", "plait", "stp", "puis",
  "ensuite", "maintenant", "attends", "bon",
])

/**
 * Les mots qui disent la NATURE d'un élément, pas son identité.
 *
 * « la deuxième vidéo » ne veut pas dire qu'un élément porte le mot « vidéo »
 * dans son titre : ça veut dire « le deuxième de ce qui est affiché ». Les
 * exiger dans la comparaison ferait échouer tous les cas d'usage réels.
 */
const MOTS_NATURE = new Set([
  "video", "videos", "resultat", "resultats", "element", "elements",
  "bouton", "boutons", "lien", "liens", "ligne", "lignes", "item", "items",
  "message", "messages", "chanson", "chansons", "morceau", "morceaux",
  "episode", "episodes", "photo", "photos", "image", "images", "case",
  "choix", "option", "options", "proposition", "propositions", "onglet",
  "onglets", "truc", "chose", "titre", "carte", "cartes", "entree", "entrees",
])

const RANGS: Record<string, number> = {
  premier: 1, premiere: 1, "1er": 1, "1ere": 1, "1e": 1,
  deuxieme: 2, second: 2, seconde: 2, "2eme": 2, "2e": 2, "2nd": 2,
  troisieme: 3, "3eme": 3, "3e": 3,
  quatrieme: 4, "4eme": 4, "4e": 4,
  cinquieme: 5, "5eme": 5, "5e": 5,
  sixieme: 6, "6eme": 6, "6e": 6,
  septieme: 7, "7eme": 7, "7e": 7,
  huitieme: 8, "8eme": 8, "8e": 8,
  neuvieme: 9, "9eme": 9, "9e": 9,
  dixieme: 10,
  onzieme: 11,
  douzieme: 12,
  treizieme: 13,
  quatorzieme: 14,
  quinzieme: 15,
  seizieme: 16,
  dixseptieme: 17,
  dixhuitieme: 18,
  dixneuvieme: 19,
  vingtieme: 20,
  dernier: -1, derniere: -1,
}

/** « 2e », « 3ème », « 1er » : la même chose écrite en chiffres. */
const SUFFIXE_RANG = /^(\d{1,2})(er|ere|re|e|eme|emes|nd|nde|ieme)$/

/**
 * Le rang demandé, s'il y en a un. -1 vaut « le dernier ».
 *
 * Un chiffre nu (« lance la 2 ») compte aussi — mais pas au-delà de vingt :
 * au-delà, c'est presque toujours autre chose qu'un rang (une année, un prix,
 * un numéro de rue).
 */
export function rangDemande(ordre: string): number | null {
  for (const mot of aplatir(ordre).split(" ")) {
    if (mot in RANGS) return RANGS[mot]
    const suffixe = SUFFIXE_RANG.exec(mot)
    if (suffixe) {
      const n = Number(suffixe[1])
      if (n >= 1 && n <= 20) return n
    }
    if (/^\d{1,2}$/.test(mot)) {
      const n = Number(mot)
      if (n >= 1 && n <= 20) return n
    }
  }
  return null
}

/** Les mots qui restent une fois retirés les mots vides, les mots de nature
 * et les rangs : ce sur quoi on compare vraiment. */
export function motsIdentite(ordre: string): string[] {
  return aplatir(ordre)
    .split(" ")
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m) && !MOTS_NATURE.has(m) && !(m in RANGS))
    .filter((m) => !/^\d{1,2}$/.test(m) && !SUFFIXE_RANG.test(m))
}

/** Ce qu'on peut désigner : ce qui se clique et qui porte un mot. Un nœud
 * sans libellé ne peut pas être nommé à la voix, donc jamais visé. */
export function estDesignable(e: ElementEcran): boolean {
  return e.cliquable && e.libelle.trim().length > 0
}

/** Deux nœuds qui portent le même libellé sont le même bouton vu deux fois
 * (l'image et son titre, dans YouTube) : cliquer l'un ou l'autre fait la même
 * chose. On garde le premier plutôt que de déclarer une ambiguïté qui n'en
 * est pas une. */
function sansDoublons(elements: ElementEcran[]): ElementEcran[] {
  const vus = new Set<string>()
  const garde: ElementEcran[] = []
  for (const e of elements) {
    const cle = aplatir(e.libelle)
    if (vus.has(cle)) continue
    vus.add(cle)
    garde.push(e)
  }
  return garde
}

/**
 * L'élément désigné par ce que Raphaël a dit, ou rien.
 *
 * L'ordre de résolution : on filtre d'abord sur les mots (« celle avec Booba
 * dans le titre »), puis on applique le rang sur ce qui reste (« la
 * deuxième »). Les deux ensemble se disent aussi : « la deuxième vidéo de
 * Booba ».
 */
export function designer(ordre: string, lecture: LectureEcran): Designation {
  const cibles = sansDoublons(lecture.elements.filter(estDesignable))
  if (cibles.length === 0) return { etat: "aucun", raison: "rien_affiche" }

  const mots = motsIdentite(ordre)
  const rang = rangDemande(ordre)

  let candidats = cibles
  if (mots.length > 0) {
    const attendus = new Set(mots)
    const notes = cibles.map((e) => {
      const libelle = aplatir(e.libelle)
      const trouves = mots.filter((m) => libelle.includes(m)).length
      // « JUSTE ÇA » : le libellé ne dit RIEN de plus que ce qu'il a demandé.
      // C'est ce qui fait gagner « Envoyer » contre « Envoyer un fichier »
      // sans jamais départager deux actions différentes au hasard :
      // « Supprimer ici » et « Supprimer tout » disent tous les deux quelque
      // chose en plus, donc aucun ne gagne, donc on demande. Trancher par la
      // longueur, comme on le fait pour retrouver une application par son
      // nom, serait faux ici : on ne choisit pas une suppression à la place
      // de l'autre parce qu'elle s'écrit plus court.
      const propres = libelle.split(" ").filter((m) => m.length > 1 && !MOTS_VIDES.has(m))
      const justeCa = trouves === mots.length && propres.every((m) => attendus.has(m))
      return { e, note: trouves / mots.length, justeCa }
    })
    const meilleure = Math.max(...notes.map((n) => n.note))
    if (meilleure > 0) {
      const exacts = notes.filter((n) => n.justeCa)
      const retenus = exacts.length > 0 ? exacts : notes.filter((n) => n.note === meilleure)
      candidats = retenus.map((n) => n.e)
    } else if (rang === null) {
      // Aucun mot ne colle et aucun rang : on ne clique nulle part.
      return { etat: "aucun", raison: "introuvable" }
    }
  }

  if (rang !== null) {
    // « LA DEUXIÈME VIDÉO » N'EST PAS « LE DEUXIÈME BOUTON DE L'ÉCRAN ».
    // Sur une page de résultats YouTube, le premier élément cliquable est la
    // loupe de recherche ; compter à partir d'elle décale tout d'un rang et
    // fait lancer la mauvaise vidéo — c'est exactement le cas d'usage qu'il a
    // demandé de vérifier. Quand un rang est dit sans autre précision, on ne
    // compte donc que ce qui est DANS une liste qui défile : le contenu, pas
    // la barre d'outils. Le service le sait pour chaque nœud (un ancêtre
    // défilable), donc sans rien connaître de YouTube ni d'aucune autre app.
    // Un écran qui ne défile pas du tout (une boîte de dialogue) garde tous
    // ses éléments : il n'y a pas de barre d'outils à écarter.
    let rangeables = candidats
    if (mots.length === 0) {
      const contenu = candidats.filter((e) => e.dansListe)
      if (contenu.length > 0) rangeables = contenu
    }
    if (rang === -1) return { etat: "trouve", element: rangeables[rangeables.length - 1] }
    if (rang > rangeables.length) return { etat: "aucun", raison: "rang_trop_grand" }
    return { etat: "trouve", element: rangeables[rang - 1] }
  }

  if (candidats.length === 1) return { etat: "trouve", element: candidats[0] }
  return { etat: "ambigu", candidats }
}

/** Ce que Jarvis ÉNUMÈRE quand il n'a pas trouvé — pour que Raphaël puisse
 * redire autrement au lieu de rester devant un « je n'ai pas trouvé » sec. */
export function resumeEcran(lecture: LectureEcran, maximum = 6): string {
  const cibles = sansDoublons(lecture.elements.filter(estDesignable))
  if (cibles.length === 0) return "je ne vois rien sur quoi appuyer"
  const noms = cibles.slice(0, maximum).map((e) => `« ${e.libelle.trim()} »`)
  const reste = cibles.length - noms.length
  return reste > 0 ? `${noms.join(", ")}, et ${reste} de plus` : noms.join(", ")
}

/**
 * La phrase que Jarvis dit, selon ce qui s'est passé.
 *
 * Elle ne met JAMAIS au passé ce qui n'a pas été constaté — c'est la règle
 * écrite dans _shared/honnetete.ts après son retour du 6 sept. (« il me dit
 * qu'il a envoyé un message alors que ce n'est pas vrai »). « J'ai appuyé sur
 * Envoyer » ne se dit que si le service a confirmé le clic.
 */
export function phraseEcran(
  resultat:
    | { fait: "clic"; libelle: string }
    | { fait: "defile"; direction: "bas" | "haut" }
    | { fait: "retour" }
    | { fait: "accueil" }
    | { fait: "lu"; lecture: LectureEcran }
    | { fait: "echec"; cause: DesignationRatee | "service_inactif" | "app_interdite" | "ecran_change" | "rien_a_defiler" | "refus" ; lecture?: LectureEcran; application?: string },
): string {
  switch (resultat.fait) {
    case "clic":
      return `J'ai appuyé sur « ${resultat.libelle.trim()} ».`
    case "defile":
      return resultat.direction === "bas" ? "Je descends." : "Je remonte."
    case "retour":
      return "Je reviens en arrière."
    case "accueil":
      return "Je retourne à l'accueil."
    case "lu": {
      // On NOMME l'application : c'est le seul mot qui lui dit si Jarvis
      // regarde bien l'écran qu'il a sous les yeux, ou un autre.
      const ou = resultat.lecture.application?.trim()
      return ou
        ? `Sur l'écran de ${ou} je vois : ${resumeEcran(resultat.lecture)}.`
        : `Sur cet écran je vois : ${resumeEcran(resultat.lecture)}.`
    }
    case "echec": {
      const cause = resultat.cause
      if (cause === "service_inactif") {
        return "Je ne peux pas encore appuyer sur l'écran à ta place : il faut activer Jarvis dans les réglages d'accessibilité d'Android. C'est dans Paramètres, « Appuyer sur l'écran à ta place »."
      }
      if (cause === "app_interdite") {
        return `Je ne touche pas à ${resultat.application ?? "cette application"} : tu l'as mise dans les applications où je n'ai pas le droit d'appuyer.`
      }
      if (cause === "ecran_change") {
        return "L'écran a changé entre le moment où je l'ai lu et celui où j'allais appuyer, alors je n'ai touché à rien. Redis-le-moi."
      }
      if (cause === "rien_a_defiler") {
        return "Cet écran ne défile pas."
      }
      if (cause === "refus") {
        return "Je n'ai pas réussi à appuyer dessus, et je n'ai rien touché d'autre."
      }
      if (cause.etat === "ambigu") {
        const noms = cause.candidats.map((c) => `« ${c.libelle.trim()} »`).join(" ou ")
        return `Je n'ai pas appuyé : je vois ${noms}, je ne sais pas lequel tu veux.`
      }
      if (cause.raison === "rien_affiche") {
        return "Je ne vois rien sur quoi appuyer sur cet écran, donc je n'ai rien touché."
      }
      const vu = resultat.lecture ? ` Je vois ${resumeEcran(resultat.lecture)}.` : ""
      if (cause.raison === "rang_trop_grand") {
        return `Il n'y en a pas autant à l'écran, alors je n'ai rien touché.${vu}`
      }
      return `Je ne trouve pas ça à l'écran, alors je n'ai rien touché.${vu}`
    }
  }
}
