/**
 * BUG CONNU DE GOOGLE, PAS DU NÔTRE — mais qui doit quand même se voir depuis
 * ici. Signalé par Raphaël le 17 sept. 2026, capture à l'appui : en pleine
 * conversation Live, il demande à Jarvis de créer un chantier, et l'écran
 * affiche « Jarvis : <ctrl46><ctrl46> » — du texte brut illisible au lieu
 * d'une vraie réponse — puis plus rien : ni `live_commande` ni `live_fin`
 * dans `journal_ecoute`, la conversation reste « en cours » pour de bon.
 *
 * CONFIRMÉ CÔTÉ GOOGLE, PAS UNE HYPOTHÈSE (recherché le 17 sept. 2026 sur le
 * forum officiel des développeurs Gemini) : un bug ouvert en janvier 2026
 * pour `gemini-2.5-flash-native-audio-preview` — exactement le modèle Live
 * de Jarvis (`GEMINI_MODELE_LIVE`) — décrit le même symptôme mot pour mot :
 * le modèle envoie des jetons de contrôle bruts (`<ctrl46>`, `<ctrl123>`…) à
 * la place de l'audio, plus souvent après un appel d'outil (Jarvis n'en a
 * qu'un, `commande_jarvis`, et c'est justement une demande de chantier qui
 * l'a déclenché ici). Certaines sessions se rétablissent seules, d'autres
 * jamais — cité tel quel : « the session never recovers; subsequent user
 * turns also produce only control-token output ». Aucun correctif ni aucun
 * contournement côté Google à cette date.
 *
 * CE QU'ON NE PEUT PAS FAIRE : empêcher Google d'envoyer ça. CE QU'ON PEUT
 * FAIRE : ne jamais l'afficher tel quel, et ne jamais laisser la conversation
 * s'éteindre en silence dessus — voir `sessionLive.ts`, qui referme lui-même
 * la session quand ça traîne, pour retomber dans `repriseLive.ts` (chantier
 * dde25deb, « une fermeture subie ne finit pas la conversation ») comme
 * n'importe quelle autre panne du service.
 *
 * Pur, vérifié par `scripts/verifier-reponse-illisible.ts`.
 */

/** Le motif exact rapporté : `<ctrl` suivi de chiffres et `>`. Spécifique
 * exprès — un mot français comme « contrôle » ne le déclenche jamais, et
 * aucune phrase dictée ne produit littéralement `<ctrl46>`. */
const JETON_CONTROLE = /<ctrl\d+>/i
const JETON_CONTROLE_G = /<ctrl\d+>/gi

/** Un fragment de `outputTranscription` porte-t-il ce charabia ? */
export function contientJetonDeControle(texte: string): boolean {
  return JETON_CONTROLE.test(texte)
}

/**
 * Ce qu'il reste à afficher une fois les jetons de contrôle retirés — vide si
 * le texte n'était QUE ça. Un mélange (un morceau de vraie réponse suivi d'un
 * jeton isolé) garde sa partie correcte plutôt que d'être jeté en entier.
 */
export function sansJetonsDeControle(texte: string): string {
  return texte.replace(JETON_CONTROLE_G, "").trim()
}
