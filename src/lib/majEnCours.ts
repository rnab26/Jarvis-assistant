/**
 * « Une mise à jour tourne » — le seul fait que l'écoute a besoin de connaître.
 *
 * SA DEMANDE, 6 sept. 2026, capture à l'appui : sur son écran, la fenêtre
 * d'installation d'Android était ouverte PAR-DESSUS un « Conversation en
 * cours — parle, coupe-moi si tu veux ». Ses mots : « il faudrait stopper
 * Jarvis de s'activer directement UNIQUEMENT s'il y a des mises à jour auto
 * qui se lancent dès le lancement de l'app. »
 *
 * Le mot « uniquement » commande tout ce fichier : on suspend la veille — ce
 * que Jarvis déclenche TOUT SEUL — et rien d'autre. Un appui volontaire sur
 * le cœur pendant une mise à jour reste obéi : c'est lui qui décide.
 *
 * POURQUOI UN MODULE ET PAS UNE PROPRIÉTÉ REACT. Ce qui sait qu'une mise à
 * jour tourne (useMajWeb) vit dans JarvisDataProvider ; ce qui doit s'en
 * taire (MicButton) est monté à DEUX endroits différents — la coquille
 * normale et la fenêtre de l'appui long. Faire descendre l'information par
 * les propriétés voudrait dire toucher les deux points de montage et
 * l'interface commune, pour un booléen. Ici, celui qui sait le pose, ceux qui
 * écoutent s'abonnent, et un troisième point de montage ajouté demain en
 * hérite sans rien câbler.
 *
 * La DÉCISION, elle, n'est pas ici : elle est dans `peutEcouterEnVeille`
 * (veille.ts), pure et vérifiée hors ligne. Ce module ne porte que l'état.
 */

let enCours = false
const abonnes = new Set<(actif: boolean) => void>()

/** Vrai pendant qu'un paquet web s'installe ou qu'une APK se télécharge. */
export function majEnCours(): boolean {
  return enCours
}

/**
 * Posé par ce qui lance la mise à jour, retiré quand elle se termine —
 * y compris quand elle ÉCHOUE. Une mise à jour ratée qui laisserait le
 * drapeau levé rendrait Jarvis sourd jusqu'au prochain démarrage, sans que
 * rien ne le dise : c'est la famille de pannes que ce projet traque depuis
 * le début.
 */
export function noterMajEnCours(actif: boolean): void {
  if (enCours === actif) return
  enCours = actif
  for (const cb of abonnes) {
    try {
      cb(actif)
    } catch {
      // Un abonné qui lève ne doit pas empêcher les autres d'être prévenus,
      // ni faire échouer la mise à jour qu'on observe.
    }
  }
}

/** S'abonner aux changements. Rend de quoi se désabonner. */
export function sAbonnerMaj(cb: (actif: boolean) => void): () => void {
  abonnes.add(cb)
  return () => {
    abonnes.delete(cb)
  }
}

/** Pour les vérifications : repartir d'un état propre. */
export function oublierMajEnCours(): void {
  enCours = false
  abonnes.clear()
}
