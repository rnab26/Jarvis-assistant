/**
 * Une action qui ne dit rien ne doit jamais devenir un silence.
 *
 * CONSTATÉ dans le journal d'écoute de Raphaël le 6 sept. 2026, pas supposé :
 *
 *   05:50:56  live_commande  resultat: ""   (« réponds à mel ma femme : … »)
 *   05:53:14  live_commande  resultat: ""   (« envoyer le message maintenant »)
 *
 * Une chaîne VIDE rendue au modèle Live. Le modèle a quelque chose à dire de
 * toute façon : n'ayant rien reçu, il comble — et il annonce que le message
 * est parti. C'est l'une des deux causes du « il me dit qu'il a envoyé alors
 * que ce n'est pas vrai » (l'autre, la consigne serveur, est traitée par
 * _shared/honnetete.ts).
 *
 * LA RÈGLE DE RAPHAËL, POSÉE LE 6 SEPT. : on n'annonce jamais au passé ce
 * qu'on n'a pas constaté. Lancer quelque chose n'est pas réussir. Un retour
 * vide, c'est précisément « je n'ai rien constaté » — donc la phrase de
 * remplacement doit l'avouer, et surtout ne rien affirmer.
 *
 * Pur : aucun React, aucun réseau. Vérifié par
 * `node --experimental-strip-types scripts/verifier-retour-vide.ts`.
 */

/**
 * Ce que Jarvis dit quand l'action n'a rien renvoyé.
 *
 * Elle n'affirme ni succès ni échec — parce qu'on ne sait pas. Dire « ça n'a
 * pas marché » serait aussi faux que « c'est envoyé » : l'action a peut-être
 * abouti sans rendre de phrase. La seule chose vraie est qu'on n'a pas eu de
 * retour, et qu'il doit vérifier.
 */
export const AVEU_RETOUR_VIDE =
  "Je n'ai pas eu de retour de cette action : je ne peux pas te confirmer qu'elle a abouti, vérifie de ton côté."

/**
 * Le texte à dire, et s'il a fallu combler un vide.
 *
 * `vide` est vrai UNIQUEMENT quand on a dû remplacer : c'est ce drapeau qui
 * doit finir dans le registre des erreurs. Sans lui on masquerait le défaut
 * au lieu de le corriger — on saurait juste que Jarvis a été poli.
 */
export function retourOuAveu(reponse: string | null | undefined): { texte: string; vide: boolean } {
  const propre = (reponse ?? "").trim()
  return propre ? { texte: propre, vide: false } : { texte: AVEU_RETOUR_VIDE, vide: true }
}
