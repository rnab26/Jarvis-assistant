/**
 * Les décisions PURES autour de Gmail vu à la voix — reconnaître « le
 * dernier » et lire proprement un expéditeur — séparées de voiceActions.ts
 * pour la même raison qu'ecranTelephone.ts est séparé de controleEcran.ts :
 * voiceActions.ts importe des modules qui touchent Capacitor et ne se charge
 * pas forcément sous Node nu, alors que ce qui décide ici n'a besoin de rien
 * de tout ça et doit pouvoir se vérifier sans réseau ni téléphone
 * (scripts/verifier-gmail-voix.ts).
 */

/** « Nom Affiché <adresse@exemple.com> » → « Nom Affiché ». Sans nom affiché,
 * on lit l'adresse telle quelle plutôt que de laisser un champ vide. */
export function nomExpediteur(de: string | null): string {
  if (!de) return "un expéditeur inconnu"
  const m = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(de)
  const nom = m?.[1]?.trim()
  return nom || de
}

/** "le dernier", "le dernier mail", "la dernière" — sans autre précision, ce
 * n'est pas une recherche : c'est le plus récent message, lu ou non. Une
 * confusion avec un vrai terme de recherche ("le dernier message de Yoni")
 * n'est PAS traitée ici : dans ce cas le mot qui suit change tout, et
 * retrouverMessage() traite ça comme un terme de recherche ordinaire. */
export function estDernierMessage(cible: string): boolean {
  return /^(le\s+|la\s+)?derni[eè]re?(\s+(mail|message|e-?mail))?\s*\.?$/i.test(cible.trim())
}
