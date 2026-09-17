/**
 * LE TITRE D'UN CHANTIER EST CE QU'IL Y A À FAIRE, PAS LA FAÇON DONT IL L'A
 * ANNONCÉ — même règle que titreTache.ts, appliquée aux chantiers.
 *
 * Chantier `1be8988d`, 17 sept. 2026. MESURÉ SUR SES VRAIS CHANTIERS OUVERTS
 * (pas supposé) :
 *
 *   select title from dev_items where archived_at is null
 *     and title ~* '^(dans |un |une |comme quoi)';
 *
 * Deux titres réels, créés le jour même (17 sept.) :
 *
 *   « Comme quoi tous les bruits exterieurs derangent le micro »
 *   « Dans le cockpit pour que tout »
 *
 * LES DEUX NE SE RÉPARENT PAS DE LA MÊME FAÇON, et c'est le point à ne pas
 * perdre. Le premier garde l'amorce de dictée devant une phrase par ailleurs
 * complète — exactement le défaut de titreTache.ts, réparable en retirant
 * l'amorce (vérifié sur trois vrais titres « comme quoi… » du cockpit,
 * aucun tronqué). Le second est un titre TRONQUÉ EN PLEIN MOT : sa note
 * commence par « Dans le cockpit pour que tout ce qui concerne le bloc
 * mettre a jour… » — le titre s'arrête à « tout », le contenu réel n'y a
 * jamais été écrit. Aucune règle locale ne peut reconstituer ce qui n'a
 * jamais été synthétisé : retirer « dans le » laisserait « cockpit pour que
 * tout », toujours incompréhensible. Ce second cas se corrige côté serveur
 * (consigne de `voice-command`, qui doit synthétiser une phrase complète et
 * ne jamais couper la dictée en cours de route), pas ici.
 *
 * SA DÉCISION (17 sept., chat, épuration du cockpit) : « Proposer, je
 * valide » — à la différence de titreTache.ts (appliqué en silence, décision
 * du 15 sept. pour les tâches), une correction de titre de CHANTIER
 * s'affiche et attend sa validation. Ce module ne fait donc que PROPOSER
 * (`null` = rien à proposer) ; c'est `chantierEnAttente.ts` qui porte la
 * confirmation.
 */

/**
 * Les amorces à retirer, en tête seulement — mesurées sur ses vrais titres
 * de chantiers, pas devinées. N'en ajoute une que si elle est vérifiée de la
 * même façon : une amorce qui précède un titre TRONQUÉ, sans contenu réel
 * derrière, ferait proposer un titre tout aussi incompréhensible.
 */
const AMORCES = ["comme quoi"]

/** En dessous, ce qui resterait ne dirait plus rien : pas de proposition. */
const RESTE_MINIMUM = 10

function comparable(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function premiereEnMajuscule(texte: string): string {
  if (!texte) return texte
  return texte[0].toLocaleUpperCase("fr-FR") + texte.slice(1)
}

/**
 * Une proposition de titre plus lisible, ou `null` quand rien de connu ne
 * précède le titre — c'est le cas de loin le plus fréquent, et le silence
 * est le bon comportement par défaut (une suggestion fausse coûte plus cher
 * qu'une absence de suggestion).
 */
export function suggererTitreChantier(brut: string): string | null {
  const titre = brut.trim().replace(/\s+/g, " ")
  if (!titre) return null

  const reference = comparable(titre)
  let meilleure = ""
  for (const amorce of AMORCES) {
    if (amorce.length <= meilleure.length) continue
    if (reference === amorce || reference.startsWith(`${amorce} `)) meilleure = amorce
  }
  if (!meilleure) return null

  const reste = titre.slice(meilleure.length).trim()
  if (reste.length < RESTE_MINIMUM) return null

  const propose = premiereEnMajuscule(reste)
  return propose === titre ? null : propose
}
