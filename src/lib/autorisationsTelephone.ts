import { registerPlugin } from "@capacitor/core"

/**
 * Ce que Jarvis a le droit de faire sur le téléphone, dit par l'usage.
 *
 * Demande de Raphaël, 5 sept. 2026 : « il faut que Jarvis, quand on installe
 * l'application, on fait une sélection directement des autorisations via le
 * téléphone directement ». Deux choses dans sa phrase, et la seconde compte
 * autant que la première : il refuse qu'on RECOPIE ses données (contacts,
 * applications) dans l'environnement de Jarvis. On demande donc une
 * autorisation de LECTURE du téléphone, une fois, et rien n'est importé.
 *
 * Ce qu'on ne fait PAS, et c'est explicite dans sa demande : une autorisation
 * par application tierce. Ouvrir une app et lui passer un texte marche déjà
 * sans aucune permission, pour n'importe quelle app, sans code par app.
 *
 * Ce module est PUR à l'exception du pont plus bas : les décisions qui
 * peuvent être fausses en silence (que proposer, quoi dire d'un état, quand
 * envoyer vers les réglages d'Android) se vérifient sans téléphone, avec
 * `scripts/verifier-autorisations.ts`.
 */

export type CleAutorisation =
  | "micro"
  | "notifications"
  | "contacts"
  | "telephone"
  | "position"
  | "position_fond"
  | "installer_maj"
  | "assistant"

/** L'état d'une autorisation, tel que le plugin Android le rapporte. */
export interface EtatAutorisation {
  cle: CleAutorisation
  accordee: boolean
  /**
   * Refusée pour de bon : Android n'affichera plus la fenêtre de demande.
   * C'est le piège déjà rencontré avec les notifications — sans cette
   * distinction, le bouton « Autoriser » ne fait plus rien et rien ne le dit.
   */
  bloquee: boolean
  /**
   * Faux quand Android ne veut pas dire l'état (le cas de l'assistant par
   * défaut, qu'aucune API publique n'expose). On l'affiche alors comme
   * inconnu plutôt que d'annoncer un refus qui n'en est peut-être pas un.
   */
  connue: boolean
}

export interface AutorisationDeclaree {
  cle: CleAutorisation
  /** L'intitulé, dit par ce que ça permet — jamais par le nom Android. */
  titre: string
  /** Ce que Jarvis peut faire avec, concrètement. */
  usage: string
  /** Ce qu'il perd sans elle. C'est ça qui fait décider, pas le nom. */
  sansElle: string
  /** Le nom Android, en petit : pour savoir ce qu'on accorde vraiment. */
  technique: string
  /**
   * « runtime » : une fenêtre de demande d'Android, qu'on sait déclencher.
   * « speciale » : aucun bouton ne peut l'accorder, il faut passer par un
   * écran de réglages du téléphone. Les confondre donne un bouton mort.
   */
  type: "runtime" | "speciale"
  /** Proposée d'emblée au premier lancement. */
  essentielle: boolean
  /** Ne se demande qu'une fois cette autre-là accordée. */
  dependDe?: CleAutorisation
}

/**
 * Le catalogue, dans l'ordre d'affichage : ce qui sert tous les jours
 * d'abord, les accès spéciaux à la fin.
 */
export const AUTORISATIONS: AutorisationDeclaree[] = [
  {
    cle: "micro",
    titre: "T'entendre quand tu parles",
    usage: "Écouter ta demande quand tu appuies sur le cœur ou sur le widget.",
    sansElle: "Jarvis ne peut rien entendre : il n'y a plus que le clavier.",
    technique: "Micro (RECORD_AUDIO)",
    type: "runtime",
    essentielle: true,
  },
  {
    cle: "notifications",
    titre: "Te prévenir au bon moment",
    usage: "L'échéance d'une tâche, le point du matin, une nouvelle version.",
    sansElle: "Les rappels sont posés mais ne sonnent jamais.",
    technique: "Notifications (POST_NOTIFICATIONS)",
    type: "runtime",
    essentielle: true,
  },
  {
    cle: "contacts",
    titre: "Appeler et écrire à tes contacts",
    usage:
      "Lire le répertoire du téléphone pour retrouver un numéro. Rien n'est copié : la liste est lue à la demande.",
    sansElle: "« Rappelle ma femme à 23 h » n'a aucun numéro à composer.",
    technique: "Contacts, en lecture seule (READ_CONTACTS)",
    type: "runtime",
    essentielle: true,
  },
  {
    cle: "telephone",
    titre: "Passer l'appel sans que tu appuies",
    usage: "Lancer l'appel directement au lieu de seulement composer le numéro.",
    sansElle: "Jarvis compose le numéro, tu appuies sur appeler. Rien n'échoue.",
    technique: "Téléphone (CALL_PHONE)",
    type: "runtime",
    essentielle: true,
  },
  {
    cle: "position",
    titre: "Te rappeler quelque chose en arrivant",
    usage: "Déclencher un rappel quand tu arrives à un endroit que tu as choisi.",
    sansElle: "Les rappels de lieu ne se déclenchent pas.",
    technique: "Position (ACCESS_FINE_LOCATION)",
    type: "runtime",
    essentielle: false,
  },
  {
    cle: "position_fond",
    titre: "…même quand l'app est fermée",
    usage: "Les rappels de lieu continuent de fonctionner sans ouvrir Jarvis.",
    sansElle: "Le rappel de lieu ne se déclenche que si Jarvis est ouvert.",
    technique: "Position en arrière-plan (ACCESS_BACKGROUND_LOCATION)",
    type: "runtime",
    essentielle: false,
    dependDe: "position",
  },
  {
    cle: "installer_maj",
    titre: "Installer les mises à jour lui-même",
    usage: "Poser la nouvelle version sans passer par le navigateur.",
    sansElle: "Chaque mise à jour demande de repasser par le téléchargement à la main.",
    technique: "Installer des applications (REQUEST_INSTALL_PACKAGES)",
    type: "speciale",
    essentielle: false,
  },
  {
    cle: "assistant",
    titre: "Répondre à l'appui long sur le bouton",
    usage: "Devenir l'assistant du téléphone, comme Perplexity : appui long, Jarvis écoute.",
    sansElle: "Il faut ouvrir l'app ou passer par le widget.",
    technique: "Application d'assistance (réglage Android)",
    type: "speciale",
    essentielle: false,
  },
]

export function autorisationParCle(cle: CleAutorisation): AutorisationDeclaree | undefined {
  return AUTORISATIONS.find((a) => a.cle === cle)
}

/**
 * Ce qu'un bouton « Tout autoriser » doit réellement demander.
 *
 * On écarte : ce qui est déjà accordé (rien à afficher), ce qui est bloqué
 * (la fenêtre ne s'affiche plus, le bouton ne ferait rien), les accès
 * spéciaux (ils passent par un écran de réglages), et ce qui dépend d'une
 * autre autorisation pas encore accordée — la position en arrière-plan
 * demandée avant la position fait rejeter le lot ENTIER par Android, sans
 * qu'aucune fenêtre ne s'affiche.
 */
export function clesADemander(
  etats: EtatAutorisation[],
  seulementEssentielles = false,
): CleAutorisation[] {
  const etatDe = new Map(etats.map((e) => [e.cle, e]))
  return AUTORISATIONS.filter((a) => {
    if (a.type !== "runtime") return false
    if (seulementEssentielles && !a.essentielle) return false
    const etat = etatDe.get(a.cle)
    if (!etat) return true
    if (etat.accordee || etat.bloquee) return false
    if (a.dependDe) {
      const parent = etatDe.get(a.dependDe)
      if (!parent?.accordee) return false
    }
    return true
  }).map((a) => a.cle)
}

/** Ce que dit la ligne, en un mot, à droite de l'intitulé. */
export function libelleEtat(etat: EtatAutorisation | undefined): string {
  if (!etat) return "Inconnu"
  if (!etat.connue) return "Non vérifiable"
  if (etat.accordee) return "Accordée"
  if (etat.bloquee) return "Refusée"
  return "Pas encore"
}

/**
 * Le bouton à afficher sur une ligne.
 *
 * « reglages » dès qu'aucune fenêtre de demande ne peut plus s'ouvrir :
 * accès spécial, refus définitif, ou état que le système ne veut pas dire.
 * Proposer « Autoriser » dans ces cas-là donne un bouton qui ne fait rien —
 * et c'est exactement ce qui est arrivé avec les notifications.
 */
export function actionDeLaLigne(
  declaree: AutorisationDeclaree,
  etat: EtatAutorisation | undefined,
  etats: EtatAutorisation[],
): "aucune" | "demander" | "reglages" | "attend_parent" {
  if (etat?.accordee) return "aucune"
  if (declaree.type === "speciale") return "reglages"
  if (!etat) return "demander"
  if (!etat.connue) return "reglages"
  if (etat.bloquee) return "reglages"
  if (declaree.dependDe) {
    const parent = etats.find((e) => e.cle === declaree.dependDe)
    if (!parent?.accordee) return "attend_parent"
  }
  return "demander"
}

/** De quoi écrire « 4 accordées sur 8 » sans le recompter à trois endroits. */
export function resumeAutorisations(etats: EtatAutorisation[]): {
  accordees: number
  total: number
  manquantesEssentielles: number
} {
  const etatDe = new Map(etats.map((e) => [e.cle, e]))
  let accordees = 0
  let manquantesEssentielles = 0
  for (const a of AUTORISATIONS) {
    const etat = etatDe.get(a.cle)
    if (etat?.accordee) accordees += 1
    else if (a.essentielle) manquantesEssentielles += 1
  }
  return { accordees, total: AUTORISATIONS.length, manquantesEssentielles }
}

interface AutorisationsPlugin {
  etat(): Promise<{ autorisations: EtatAutorisation[] }>
  demander(options: { cles: CleAutorisation[] }): Promise<{ autorisations: EtatAutorisation[] }>
  ouvrirEcran(options: { cle: CleAutorisation }): Promise<void>
}

/**
 * Pont vers android/.../AutorisationsPlugin.java.
 *
 * N'existe que dans l'app empaquetée, et pas dans toutes : depuis la mise à
 * jour rapide, une interface récente peut tourner dans une APK plus ancienne
 * où ce plugin n'existe pas encore. Chaque appel est donc à protéger, et
 * l'écran doit savoir dire « ça demande une mise à jour de l'application »
 * plutôt que rester vide.
 */
export const Autorisations = registerPlugin<AutorisationsPlugin>("Autorisations")
