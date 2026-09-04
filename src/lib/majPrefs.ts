import { ecrireReglage } from "@/lib/reglages"

/**
 * « Applique les mises à jour rapides toute seule. »
 *
 * Activé par défaut, et c'est un choix : Raphaël pousse des dizaines de
 * changements par jour, et chaque étape manuelle qu'on lui laisse est une
 * étape qu'il oublie de faire — c'est exactement ce qui l'a laissé une
 * vingtaine de builds en retard sans le savoir. La mise à jour rapide ne
 * demande aucune autorisation, ne réinstalle rien, et se défait d'un bouton :
 * l'automatiser coûte peu et rapporte beaucoup.
 *
 * Elle ne s'applique QUE dans la première minute après l'ouverture de l'app.
 * Une mise à jour appliquée au retour au premier plan redémarrerait
 * l'interface au milieu d'une phrase dictée — ce serait pire que le problème
 * qu'on résout. Passé ce délai, elle attend la prochaine ouverture.
 */
export const MAJ_AUTO_KEY = "jarvis_maj_auto"

export function lireMajAuto(): boolean {
  try {
    return localStorage.getItem(MAJ_AUTO_KEY) !== "0"
  } catch {
    return true
  }
}

export function ecrireMajAuto(actif: boolean) {
  ecrireReglage(MAJ_AUTO_KEY, actif ? "1" : "0")
}
