/**
 * « Transmets la dernière facture d'électricité à Dan » : le modèle rend
 * parfois find_receipts PUIS transmettre_recu, alors que la consigne dit en
 * toutes lettres « jamais confondu avec find_receipts ».
 *
 * MESURÉ le 24 sept. 2026, sur le vrai modèle et la clé de test
 * (scripts/essayer-consigne.sh, la même phrase quatre fois) : 2 sur 4 justes
 * avec la consigne du 23 sept. au matin, 0 sur 4 avec celle du soir, qui a
 * grossi (réglages, notes). Insister dans la consigne a déjà échoué ailleurs
 * (chantier 902bf94b) : ça se corrige dans le code.
 *
 * Le find_receipts de trop n'apporte rien : le téléphone retrouve le reçu
 * lui-même à partir de mail_cible (retrouverMessage, voiceActions.ts). Il
 * fait seulement lire à voix haute une liste qu'il n'a pas demandée avant de
 * préparer l'envoi. On ne le retire QUE s'il accompagne un transmettre_recu :
 * « retrouve mes reçus » seul reste une liste.
 *
 * Pur, sans dépendance Deno : vérifié par scripts/verifier-gmail-voix.ts.
 */
export function sansListeAvantTransmission<T extends { action?: unknown }>(actions: T[]): T[] {
  if (!actions.some((a) => a.action === "transmettre_recu")) return actions
  const restantes = actions.filter((a) => a.action !== "find_receipts")
  return restantes.length > 0 ? restantes : actions
}
