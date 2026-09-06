/**
 * Ce qu'il a dicté sans réseau, gardé jusqu'à ce que ce soit vraiment écrit.
 *
 * SA CRAINTE, MOT POUR MOT (chantier b5411c23) : « s'assurer que tout ajout de
 * tâches ou autre chose faites dans jarvis soit enregistré en live car entre
 * les commits et les déploiements il peut y avoir de la perte de datas ». La
 * moitié de cette crainte est infondée et c'est mesuré dans la note du
 * chantier — ni une mise à jour ni un déploiement n'approchent Postgres. Le
 * VRAI trou est ailleurs, et il est précis : une écriture qui ÉCHOUE perd son
 * contenu. `addTask` insère, l'insert rate (tunnel, ascenseur, réseau coupé),
 * un toast s'affiche cinq secondes, et la tâche dictée n'a jamais existé nulle
 * part. Il dicte en voiture : le réseau coupé n'est pas le cas rare.
 *
 * TOUT LE RAISONNEMENT EST ICI, ET IL EST PUR — aucun appel à Supabase, à
 * React ni au stockage. C'est ce qui permet de vérifier hors ligne les seules
 * choses qui peuvent être fausses en silence : un renvoi qui crée un doublon,
 * une file qui grossit sans fin, un abandon que personne ne voit.
 *
 * LES QUATRE RÈGLES VIENNENT DU JOURNAL DE BORD (6 sept. 2026), et la
 * troisième commande tout le reste :
 *
 * 1. LA FILE SURVIT À LA FERMETURE DE L'APP. Une file en mémoire disparaît au
 *    premier redémarrage — donc elle ne sert à rien pour le cas qui nous
 *    occupe, qui est justement celui où il range son téléphone. D'où
 *    `serialiser` / `lire`, et une clé déclarée dans `STOCKAGE_LOCAL_ASSUME` :
 *    c'est un TAMPON, pas une préférence.
 * 2. PAS DE DOUBLON AU RATTRAPAGE. Le cas qui arrive vraiment n'est pas
 *    « l'écriture a échoué » : c'est « l'écriture a RÉUSSI côté serveur et la
 *    réponse s'est perdue ». Renvoyer crée alors un deuxième exemplaire —
 *    exactement le défaut « dicter deux fois crée deux chantiers jumeaux ». La
 *    parade n'est pas dans la file, elle est dans l'IDENTIFIANT : chaque
 *    élément porte l'`id` que la ligne AURA en base, fabriqué au moment de la
 *    dictée, et le renvoi est un upsert sur cet id. Renvoyer une écriture déjà
 *    passée ne fait alors rien du tout.
 * 3. ON NE DIT JAMAIS « C'EST ENREGISTRÉ » QUAND ÇA NE L'EST PAS. C'est la
 *    règle posée le 6 sept. au matin, après le « j'ai envoyé ton message »
 *    alors que rien n'était parti. Hors ligne, on dit « je l'ai noté, je
 *    l'enregistre dès que tu as du réseau » — et la tâche se VOIT dans la
 *    liste avec cet état. Un tampon invisible serait un mensonge de plus.
 * 4. UN ABANDON NE SE FAIT JAMAIS EN SILENCE. Au-delà de `ESSAIS_MAX`,
 *    l'élément reste dans la file et passe en « bloqué » : il se voit, il se
 *    relance à la main, et l'appelant en fait une ligne du registre des
 *    erreurs. Ce qu'on ne fait pas, c'est le jeter.
 */

/** Ce que la file sait renvoyer. Une seule pour l'instant, et c'est voulu :
 * ce sont les tâches dictées qu'il perd concrètement. Une commande d'action
 * (appeler quelqu'un, lancer une musique) n'a AUCUN sens différée — elle doit
 * échouer franchement, pas partir toute seule un quart d'heure plus tard. */
export type CibleEnAttente = "tasks"

export interface ElementEnAttente<T = unknown> {
  /**
   * L'identifiant que la ligne AURA en base, fabriqué au moment de la dictée.
   * C'est lui qui rend le renvoi idempotent (règle 2) : ce n'est pas une clé
   * de file, c'est la clé primaire de la ligne.
   */
  id: string
  cible: CibleEnAttente
  /** Le contenu à écrire, tel qu'il partira. */
  contenu: T
  /** Ce qu'on affiche quand on parle de cet élément, sans le déchiffrer. */
  libelle: string
  /** Quand il l'a dicté (ms epoch) — l'ordre d'envoi, et l'âge affiché. */
  creeA: number
  essais: number
  /** Le dernier échec, en clair. Vide tant qu'on n'a jamais essayé. */
  dernierEchec: string | null
  /** Quand on a essayé pour la dernière fois (ms epoch). */
  dernierEssaiA: number | null
}

/**
 * Au-delà, on cesse de réessayer tout seul — mais on ne jette RIEN.
 *
 * Cinq, et pas trois : avec l'attente qui double, cinq essais couvrent un peu
 * plus de quatre minutes de coupure. Un tunnel ou un ascenseur tiennent moins
 * longtemps ; une zone blanche tient plus longtemps, et là c'est à lui de
 * voir. Continuer indéfiniment brûlerait la batterie sur une erreur qui n'est
 * pas passagère (un droit refusé, un champ invalide) sans jamais le dire.
 */
export const ESSAIS_MAX = 5

/** Première attente avant un renvoi, puis elle double. */
export const ATTENTE_INITIALE_MS = 15_000

/**
 * Une file qui grossit sans fin finit par ne plus tenir dans le stockage, et
 * elle emporte alors TOUT — y compris ce qu'il vient de dicter. Au-delà, on
 * garde les PLUS RÉCENTS : une tâche de la semaine dernière restée bloquée
 * cinquante fois compte moins que celle qu'il vient de dire.
 */
export const FILE_MAX = 50

/**
 * Combien de temps attendre avant le prochain renvoi, en fonction du nombre
 * d'échecs. L'attente double à chaque fois : réessayer toutes les secondes
 * dans un tunnel ne fait pas revenir le réseau, ça vide la batterie.
 */
export function attenteAvantRenvoi(essais: number): number {
  return ATTENTE_INITIALE_MS * 2 ** Math.max(0, essais - 1)
}

/** Un élément qu'on a cessé de renvoyer tout seul. Il reste visible et
 * relançable à la main : c'est la règle 4. */
export function estBloque(e: ElementEnAttente): boolean {
  return e.essais >= ESSAIS_MAX
}

/**
 * Ce qui doit repartir maintenant.
 *
 * Dans l'ORDRE OÙ IL LES A DITES : deux tâches dictées à la suite doivent
 * arriver dans cet ordre, sinon la liste qu'il retrouve n'est pas celle qu'il
 * a dictée. Et jamais un élément bloqué — celui-là attend qu'il appuie.
 */
export function aRenvoyer<T>(
  file: ElementEnAttente<T>[],
  maintenant: number,
): ElementEnAttente<T>[] {
  return file
    .filter((e) => {
      if (estBloque(e)) return false
      if (e.dernierEssaiA === null) return true
      return maintenant - e.dernierEssaiA >= attenteAvantRenvoi(e.essais)
    })
    .sort((a, b) => a.creeA - b.creeA)
}

/**
 * Ajoute un élément à la file.
 *
 * IDEMPOTENT SUR L'ID, et c'est la règle 2 : rappeler cette fonction avec le
 * même id remplace le contenu au lieu d'ajouter une seconde ligne. Le cas réel
 * n'est pas théorique — une écriture peut être retentée par l'appelant pendant
 * qu'elle est déjà en file.
 */
export function mettreEnFile<T>(
  file: ElementEnAttente<T>[],
  element: ElementEnAttente<T>,
): ElementEnAttente<T>[] {
  const sansDoublon = file.filter((e) => e.id !== element.id)
  const suivante = [...sansDoublon, element]
  // On coupe par le DÉBUT : les plus anciens partent, les plus récents
  // restent. Couper par la fin jetterait ce qu'il vient de dire.
  return suivante.length > FILE_MAX ? suivante.slice(suivante.length - FILE_MAX) : suivante
}

/** Sort un élément de la file : son écriture est passée, ou il l'a retiré. */
export function retirerDeLaFile<T>(
  file: ElementEnAttente<T>[],
  id: string,
): ElementEnAttente<T>[] {
  return file.filter((e) => e.id !== id)
}

/** Note un échec de renvoi : un essai de plus, et la raison en clair. */
export function noterEchec<T>(
  file: ElementEnAttente<T>[],
  id: string,
  raison: string,
  maintenant: number,
): ElementEnAttente<T>[] {
  return file.map((e) =>
    e.id === id
      ? { ...e, essais: e.essais + 1, dernierEchec: raison, dernierEssaiA: maintenant }
      : e,
  )
}

/** Remet un élément bloqué dans la course, quand il appuie sur « Réessayer ».
 * On repart d'essais à zéro : c'est un geste de sa part, pas un renvoi
 * automatique de plus. */
export function relancer<T>(file: ElementEnAttente<T>[], id: string): ElementEnAttente<T>[] {
  return file.map((e) =>
    e.id === id ? { ...e, essais: 0, dernierEssaiA: null, dernierEchec: null } : e,
  )
}

export interface ResumeFile {
  /** Tout ce qui n'est pas encore écrit. */
  total: number
  /** Ce qu'on ne renvoie plus tout seul : ça attend un geste de lui. */
  bloques: number
  /**
   * Ce qu'on lui dit, ou rien du tout.
   *
   * JAMAIS AU PASSÉ, et jamais « c'est enregistré » : c'est la règle 3. Le mot
   * qui compte est « dès que » — il dit qu'il reste quelque chose à faire.
   */
  phrase: string | null
}

export function resumerFile(file: ElementEnAttente[]): ResumeFile {
  const bloques = file.filter(estBloque).length
  const total = file.length

  // Rien en attente : on ne dit RIEN. Un bandeau « 0 en attente » est une
  // ligne de plus à lire dans un écran qu'on veut alléger, et il use le
  // signal qui doit servir le jour où il y a vraiment quelque chose.
  if (total === 0) return { total: 0, bloques: 0, phrase: null }

  if (bloques > 0) {
    return {
      total,
      bloques,
      phrase:
        bloques === 1
          ? "1 chose n'a pas pu être enregistrée après plusieurs essais. Elle est gardée ici, tu peux réessayer."
          : `${bloques} choses n'ont pas pu être enregistrées après plusieurs essais. Elles sont gardées ici, tu peux réessayer.`,
    }
  }

  return {
    total,
    bloques: 0,
    phrase:
      total === 1
        ? "1 chose notée, pas encore enregistrée : je m'en occupe dès que tu as du réseau."
        : `${total} choses notées, pas encore enregistrées : je m'en occupe dès que tu as du réseau.`,
  }
}

/**
 * Ce que Jarvis DIT quand une écriture n'est pas passée.
 *
 * Sa règle du 6 sept. : « on n'annonce jamais au passé ce qu'on n'a pas
 * constaté — ni à l'oral, ni dans un toast, ni dans une étiquette d'écran ».
 * Cette phrase-là est la seule autorisée hors ligne, et elle ne contient
 * aucun verbe au passé accompli sur l'enregistrement.
 */
export function phraseHorsLigne(quoi: string): string {
  return `Je l'ai notée — « ${quoi} ». Je l'enregistre dès que tu as du réseau.`
}

// ── Le tampon, entre deux ouvertures de l'app ──────────────────────────────

/** La clé du tampon. Déclarée dans `STOCKAGE_LOCAL_ASSUME` : ce n'est pas une
 * préférence, il n'y a rien à régler, et la recopier en base n'aurait aucun
 * sens — ce qu'elle contient a justement échoué à y arriver. */
export const CLE_FILE = "jarvis_file_en_attente"

/**
 * Relit le tampon.
 *
 * UN TAMPON ILLISIBLE NE DOIT PAS FAIRE TOMBER L'APP. Le stockage peut rendre
 * du JSON tronqué (l'app tuée en pleine écriture), une version antérieure du
 * format, ou lever purement et simplement (navigation privée). Dans tous ces
 * cas on repart d'une file vide plutôt que d'empêcher l'écran de s'afficher —
 * mais on ne prétend jamais que la file était vide : `lireFile` rend
 * `null` quand elle n'a pas pu être lue, et l'écran le dit.
 */
export function lireFile(brut: string | null): ElementEnAttente[] | null {
  if (brut === null) return []
  try {
    const lu: unknown = JSON.parse(brut)
    if (!Array.isArray(lu)) return null
    const propres = lu.filter(
      (e): e is ElementEnAttente =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as ElementEnAttente).id === "string" &&
        typeof (e as ElementEnAttente).creeA === "number" &&
        typeof (e as ElementEnAttente).libelle === "string",
    )
    // Une ligne abîmée n'emporte pas les autres : on garde ce qui se lit.
    return propres
  } catch {
    return null
  }
}

export function serialiserFile(file: ElementEnAttente[]): string {
  return JSON.stringify(file)
}
