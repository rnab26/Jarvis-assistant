import { registerPlugin } from "@capacitor/core"
import {
  designer,
  phraseEcran,
  type CommandeEcran,
  type ElementEcran,
  type LectureEcran,
} from "@/lib/ecranTelephone"
import {
  CLE_LISTE_NOIRE,
  entreeInterdisant,
  lireReglagesListeNoire,
  type ReglagesListeNoire,
} from "@/lib/listeNoire"
import { noterEcoute } from "@/lib/journalEcoute"

/**
 * Le pont vers le service d'accessibilité, et l'enchaînement complet d'une
 * commande d'écran : lire, vérifier la liste noire, désigner, cliquer, dire.
 *
 * POURQUOI IL N'Y A PAS DE FENÊTRE D'ANNULATION ICI, alors qu'il y en a une
 * pour les actions sortantes. La fenêtre est un bandeau affiché DANS Jarvis
 * (actionsTelephoneToast.ts) : quand Jarvis appuie sur l'écran de YouTube ou
 * de WhatsApp, c'est cette application-là qui est au premier plan, et notre
 * bandeau n'est visible nulle part. L'afficher quand même reviendrait à un
 * garde-fou décoratif — le pire des deux mondes : trois secondes d'attente à
 * chaque clic, et rien à voir ni à toucher.
 *
 * Les garde-fous réels sont donc ailleurs, et il y en a quatre :
 * 1. on ne clique JAMAIS sur un élément qu'on n'a pas trouvé, ni quand deux
 *    éléments différents se valent (ecranTelephone.ts) ;
 * 2. on refuse toute action tant qu'une application de la liste noire est au
 *    premier plan (listeNoire.ts) ;
 * 3. le service relit l'arbre au moment du clic et refuse si l'écran a changé
 *    depuis la lecture (JarvisAccessibiliteService.cliquer) ;
 * 4. Jarvis DIT à voix haute sur quoi il vient d'appuyer, nommément, et
 *    « reviens en arrière » est une commande qu'il sait faire — c'est le vrai
 *    chemin de rattrapage, il marche pendant qu'il regarde l'autre app.
 */

interface AccessibilitePlugin {
  etat(): Promise<{ declare: boolean; actif: boolean }>
  ouvrirReglages(): Promise<void>
  lireEcran(): Promise<{
    disponible: boolean
    raison?: string
    paquet?: string
    application?: string
    elements?: ElementEcran[]
  }>
  cliquer(options: { index: number; libelle: string }): Promise<{
    resultat: "fait" | "ecran_change" | "refus" | "pas_de_vue" | "service_inactif"
  }>
  defiler(options: { bas: boolean }): Promise<{ ok: boolean }>
  retour(): Promise<{ ok: boolean }>
  accueil(): Promise<{ ok: boolean }>
}

/** Pont vers android/.../AccessibilitePlugin.java. N'existe que dans l'app
 * empaquetée : sur le web, il n'y a pas d'écran d'autre application. */
export const Accessibilite = registerPlugin<AccessibilitePlugin>("Accessibilite")

export interface EtatAccessibilite {
  /** Autorisé dans les réglages d'Android. */
  declare: boolean
  /** Et réellement relié — c'est celui-là qui compte pour agir. */
  actif: boolean
}

/** L'état RÉEL, lu du système. Jamais un réglage : Android peut couper un
 * service d'accessibilité sans que l'application en sache rien, et un
 * interrupteur qui afficherait « Activé » au-dessus d'un service mort est
 * exactement le piège déjà vécu avec la bulle et les notifications. */
export async function etatAccessibilite(): Promise<EtatAccessibilite> {
  try {
    return await Accessibilite.etat()
  } catch {
    return { declare: false, actif: false }
  }
}

export async function ouvrirReglagesAccessibilite(): Promise<void> {
  await Accessibilite.ouvrirReglages()
}

export function reglagesListeNoire(): ReglagesListeNoire {
  try {
    return lireReglagesListeNoire(localStorage.getItem(CLE_LISTE_NOIRE))
  } catch {
    return lireReglagesListeNoire(null)
  }
}

/** Exportée pour `garderReponseEcran.ts` (chantier 7d7967b2) : « garde ça »
 * a besoin du texte affiché, pas d'une commande d'écran. Même lecture, même
 * traitement de l'indisponibilité — pas un second chemin. */
export async function lireEcran(): Promise<LectureEcran | { echec: "service_inactif" | "pas_de_vue" }> {
  return lire()
}

async function lire(): Promise<LectureEcran | { echec: "service_inactif" | "pas_de_vue" }> {
  const r = await Accessibilite.lireEcran()
  if (!r.disponible) {
    return { echec: r.raison === "service_inactif" ? "service_inactif" : "pas_de_vue" }
  }
  return {
    paquet: r.paquet ?? "",
    application: r.application,
    elements: r.elements ?? [],
  }
}

export interface ResultatEcran {
  /** La phrase que Jarvis dira — jamais un verbe au passé sur ce qui n'a pas
   * été constaté, voir _shared/honnetete.ts. */
  message: string
  /** Vrai seulement quand l'action demandée a vraiment eu lieu. Ajouté pour
   * le mode entraînement (chantier 86df4f4a), qui doit savoir s'ARRÊTER de
   * rejouer une séquence sans deviner l'échec dans le texte de `message`. */
  ok: boolean
}

/**
 * Exécute une commande d'écran et rend la phrase que Jarvis dira.
 *
 * Elle ne met JAMAIS au passé ce qui n'a pas été constaté : « J'ai appuyé sur
 * Envoyer » n'est dit que si le service a confirmé le clic. C'est la règle
 * écrite dans _shared/honnetete.ts après son retour du 6 sept.
 */
export async function agirSurEcran(
  commande: CommandeEcran,
  cible?: string,
): Promise<ResultatEcran> {
  const lecture = await lire()
  if ("echec" in lecture) {
    noterEcoute("ecran_action", { commande, cible: cible ?? null, resultat: lecture.echec })
    if (lecture.echec === "service_inactif") {
      return { message: phraseEcran({ fait: "echec", cause: "service_inactif" }), ok: false }
    }
    return { message: "Je n'arrive pas à voir l'écran en ce moment, donc je n'ai rien touché.", ok: false }
  }

  // La liste noire d'abord, avant toute autre décision : sur l'écran d'une
  // banque, Jarvis ne fait rien du tout — pas même défiler ou revenir.
  const interdit = entreeInterdisant(lecture.paquet, lecture.application, reglagesListeNoire())
  if (interdit) {
    noterEcoute("ecran_action", {
      commande,
      cible: cible ?? null,
      resultat: "app_interdite",
      paquet: lecture.paquet,
    })
    return {
      message: phraseEcran({
        fait: "echec",
        cause: "app_interdite",
        application: lecture.application ?? interdit.libelle,
      }),
      ok: false,
    }
  }

  if (commande === "lire") {
    noterEcoute("ecran_action", { commande, resultat: "lu", paquet: lecture.paquet })
    return { message: phraseEcran({ fait: "lu", lecture }), ok: true }
  }

  if (commande === "retour" || commande === "accueil") {
    const r = commande === "retour" ? await Accessibilite.retour() : await Accessibilite.accueil()
    noterEcoute("ecran_action", { commande, resultat: r.ok ? "fait" : "refus" })
    if (!r.ok) return { message: phraseEcran({ fait: "echec", cause: "refus" }), ok: false }
    return { message: phraseEcran(commande === "retour" ? { fait: "retour" } : { fait: "accueil" }), ok: true }
  }

  if (commande === "defiler_bas" || commande === "defiler_haut") {
    const bas = commande === "defiler_bas"
    const r = await Accessibilite.defiler({ bas })
    noterEcoute("ecran_action", {
      commande,
      resultat: r.ok ? "fait" : "rien_a_defiler",
      paquet: lecture.paquet,
    })
    if (!r.ok) return { message: phraseEcran({ fait: "echec", cause: "rien_a_defiler" }), ok: false }
    return { message: phraseEcran({ fait: "defile", direction: bas ? "bas" : "haut" }), ok: true }
  }

  // Un clic sans rien à désigner ne veut rien dire : on ne prend pas « le
  // premier élément » par défaut, ce serait exactement le clic au hasard
  // qu'on s'interdit.
  if (!cible || !cible.trim()) {
    noterEcoute("ecran_action", { commande, resultat: "sans_cible", paquet: lecture.paquet })
    return {
      message: `Sur quoi veux-tu que j'appuie ? Je vois ${phraseEcran({ fait: "lu", lecture }).replace(/^Sur cet écran je vois : /, "").replace(/\.$/, "")}.`,
      ok: false,
    }
  }

  const choix = designer(cible, lecture)
  if (choix.etat !== "trouve") {
    noterEcoute("ecran_action", {
      commande,
      cible,
      resultat: choix.etat === "ambigu" ? "ambigu" : choix.raison,
      paquet: lecture.paquet,
      application: lecture.application ?? null,
    })
    return { message: phraseEcran({ fait: "echec", cause: choix, lecture }), ok: false }
  }

  const r = await Accessibilite.cliquer({
    index: choix.element.index,
    libelle: choix.element.libelle,
  })
  noterEcoute("ecran_action", {
    commande,
    cible,
    resultat: r.resultat,
    element: choix.element.libelle,
    paquet: lecture.paquet,
    application: lecture.application ?? null,
  })

  if (r.resultat === "fait") {
    return { message: phraseEcran({ fait: "clic", libelle: choix.element.libelle }), ok: true }
  }
  if (r.resultat === "service_inactif") {
    return { message: phraseEcran({ fait: "echec", cause: "service_inactif" }), ok: false }
  }
  if (r.resultat === "ecran_change" || r.resultat === "pas_de_vue") {
    return { message: phraseEcran({ fait: "echec", cause: "ecran_change" }), ok: false }
  }
  return { message: phraseEcran({ fait: "echec", cause: "refus" }), ok: false }
}
