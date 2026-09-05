/**
 * Lancer une musique : ce qui a vraiment été obtenu, et ce que Jarvis en dit.
 *
 * Module PUR, sans Capacitor ni Supabase, exprès : c'est la partie qui peut
 * être fausse en silence, et elle se vérifie sans téléphone
 * (`scripts/verifier-musique.ts`). Le reste — l'intent Android, le choix de
 * l'application — vit dans ActionsTelephonePlugin.java et
 * actionsTelephoneVocales.ts.
 */

/**
 * Ce que l'ouverture d'une application a VRAIMENT obtenu.
 *
 * Ajouté le 5 sept. 2026. Avant, `ouvrirApplication` ne rendait rien : le
 * repli silencieux sur l'ouverture nue faisait dire « je lance » à Jarvis
 * pendant que rien ne jouait — le symptôme que Raphaël signale depuis le
 * début (« depuis le début j'essaie de lancer une musique […] ça ne
 * fonctionne pas »). Aucun journal ne pouvait le montrer d'ici, faute de
 * distinguer les trois cas.
 *
 *   « lecture »   l'application a accepté l'intent « joue ça » d'Android.
 *   « recherche » elle ne le déclare pas ; on a ouvert sa recherche sur la
 *                 requête, il reste un appui à faire.
 *   « ouverture » on n'a pu que l'ouvrir : rien n'est joué.
 */
export type ResultatOuverture = "lecture" | "recherche" | "ouverture"

/**
 * Ce que Jarvis dit après avoir demandé une musique — et il dit la vérité.
 *
 * Chaque phrase dit ce qui s'est passé ET ce qu'il reste à faire. Celle de
 * l'échec nomme le réglage à changer : son application de musique est
 * « Apple Music », qui déclare mal l'intent « joue ça », et sans cette phrase
 * il n'avait aucun moyen de faire le lien entre son réglage et un « je
 * lance » suivi de rien.
 */
export function phraseMusique(
  resultat: ResultatOuverture,
  requete: string,
  application: string | null,
): string {
  const sur = application ? ` sur ${application}` : ""
  if (resultat === "lecture") return `Je lance ${requete}${sur}.`
  if (resultat === "recherche") {
    return `${application ?? "L'application"} ne se laisse pas commander directement : je t'ouvre ${requete} dans sa recherche, appuie sur le titre pour lancer la lecture.`
  }
  return `J'ai ouvert ${application ?? "l'application"}, mais elle refuse de lancer ${requete} toute seule. Lance-le depuis l'app — et si ça se reproduit, change ton application de musique dans Paramètres, « Ce que Jarvis utilise ».`
}
