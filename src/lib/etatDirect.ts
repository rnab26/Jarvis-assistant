/**
 * Ce qu'on dit d'une liste qui devrait se mettre à jour toute seule.
 *
 * D'OÙ ÇA VIENT. Chantier ce69489b, dicté par Raphaël : « Les taches ne
 * s'affichent pas en live et il n'y a aucun moyen d'actualiser ». Deux
 * reproches, et le second est le plus grave : quand la mise à jour
 * automatique ne passe pas, il n'a AUCUN geste de rattrapage — il ne peut
 * que fermer et rouvrir l'app en espérant.
 *
 * CE QUI A ÉTÉ ÉTABLI AVANT DE CORRIGER, et qui écarte deux fausses pistes :
 *
 * - Le temps réel marche côté serveur. `scripts/verifier-donnees.mjs` le
 *   prouve à chaque passage, sur `tasks` comme sur `dev_items` : une écriture
 *   faite ailleurs arrive bien. Ce n'est donc ni RLS ni la publication.
 * - Le jeton qui expire n'est pas la cause non plus. Lu dans le code de
 *   supabase-js 2.114 (`_handleTokenChanged`) : un `TOKEN_REFRESHED` rappelle
 *   `realtime.setAuth` tout seul. On avait de bonnes raisons de le soupçonner
 *   — `useRealtimeRefresh` ne pose le jeton qu'une fois — mais c'est faux.
 *
 * CE QUI RESTE, et c'est le vrai défaut : `subscribe()` était appelé SANS
 * rappel. Un `CHANNEL_ERROR`, un `TIMED_OUT`, une socket fermée par Android
 * en veille — rien de tout ça ne se voyait. La bibliothèque retente d'elle
 * même (elle a son `rejoinTimer`, vérifié dans RealtimeChannel.js) mais elle
 * le fait en silence, et quand elle n'y arrive pas, personne ne le sait.
 *
 * Ce module ne parle donc pas à la base : il DÉCIT quoi afficher, et il est
 * vérifiable sans réseau (`scripts/verifier-etat-direct.ts`).
 */

/** L'état d'un abonnement temps réel, tel que le hook le rapporte. */
export type StatutDirect =
  /** On n'a pas encore de réponse : au montage, ou pendant une reconnexion. */
  | "connexion"
  /** Le canal est joint : ce qui change ailleurs arrive tout seul. */
  | "en_ligne"
  /** Le canal a échoué, expiré, ou s'est fermé. */
  | "coupe"

export type TonEtat = "discret" | "alerte"

export type EtatAffiche = {
  ton: TonEtat
  /** La phrase affichée à côté du bouton. Jamais vide. */
  texte: string
  /** Le bouton est-il utilisable ? (non pendant un rechargement) */
  actionnable: boolean
}

/**
 * Une page suit souvent PLUSIEURS canaux (l'onglet Tâches en a deux : les
 * tâches et les catégories). Le pire l'emporte : si l'un des deux est coupé,
 * une partie de l'écran est figée, et dire « en ligne » serait faux.
 */
export function combinerStatuts(statuts: readonly StatutDirect[]): StatutDirect {
  if (statuts.length === 0) return "en_ligne"
  if (statuts.includes("coupe")) return "coupe"
  if (statuts.includes("connexion")) return "connexion"
  return "en_ligne"
}

/**
 * L'âge en clair, jamais à la seconde près : un compteur qui bouge chaque
 * seconde attire l'œil sur une information qui ne sert à rien.
 */
export function ageEnClair(ms: number): string {
  if (ms < 0) return "à l'instant"
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.floor(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  const jours = Math.floor(heures / 24)
  return jours === 1 ? "hier" : `il y a ${jours} jours`
}

export type EntreeEtat = {
  statut: StatutDirect
  /** Horodatage du dernier chargement RÉUSSI, ou null si on n'en a jamais eu. */
  derniereMaj: number | null
  maintenant: number
  /** Un rechargement est en cours (manuel ou automatique). */
  enCours: boolean
  /** `navigator.onLine`. Faux = le téléphone sait déjà qu'il n'a pas de réseau. */
  reseau: boolean
}

export function etatAffiche(e: EntreeEtat): EtatAffiche {
  // L'ÂGE NE S'AFFICHE QUE QUAND IL COMPTE. Tant que le direct marche, la
  // liste est juste par construction : « à jour il y a 3 min » serait du bruit
  // permanent pour rassurer sur quelque chose qui va bien. Dès que le direct
  // est coupé, en revanche, c'est LA seule information utile — elle dit
  // depuis combien de temps l'écran ment peut-être.
  const depuis = e.derniereMaj === null ? null : ageEnClair(e.maintenant - e.derniereMaj)
  const suffixe = depuis === null ? "" : ` · liste chargée ${depuis}`

  // 1. CE QUI EST EN COURS PASSE AVANT TOUT. Sa règle : « chaque action doit
  //    dire visiblement qu'elle a réussi ou échoué ». Un appui qui ne change
  //    rien à l'écran se lit comme un bouton mort, et il appuie six fois.
  if (e.enCours) return { ton: "discret", texte: "Actualisation…", actionnable: false }

  // 2. PAS DE RÉSEAU L'EMPORTE SUR « COUPÉ ». Les deux sont vrais en même
  //    temps quand il est dans l'ascenseur, mais « les mises à jour ne
  //    passent plus » l'enverrait chercher une panne dans l'app.
  if (!e.reseau) return { ton: "alerte", texte: `Hors ligne${suffixe}`, actionnable: true }

  // 3. UNE COUPURE SE DIT, ET ELLE DIT QUOI FAIRE. C'est tout le chantier :
  //    avant, elle était parfaitement muette.
  if (e.statut === "coupe") {
    return { ton: "alerte", texte: `Mises à jour automatiques coupées${suffixe}`, actionnable: true }
  }

  // 4. « CONNEXION » NE DIT RIEN D'ALARMANT, et ce n'est pas un oubli. C'est
  //    l'état normal des deux premières secondes de chaque montage, et à
  //    chaque retour au premier plan. Un bandeau orange qui clignote à chaque
  //    fois qu'il ouvre l'app n'est plus lu du tout le jour où il compte.
  if (e.statut === "connexion") return { ton: "discret", texte: "Connexion…", actionnable: true }

  // 5. Le direct marche. Le bouton reste là quand même : « aucun moyen
  //    d'actualiser » était la moitié de sa plainte, et il doit pouvoir
  //    forcer sans avoir à se demander si c'est utile.
  return { ton: "discret", texte: "À jour", actionnable: true }
}
