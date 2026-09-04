/**
 * Vérification de la logique de tour de parole, sans micro ni navigateur.
 *
 *   node --experimental-strip-types scripts/verifier-dialogue.ts
 *
 * Chaque cas rejoue une situation réellement signalée. C'est la seule partie
 * du moteur d'écoute qu'on peut prouver depuis cet environnement : le reste
 * (plugin Android, API Web Speech) demande un vrai appareil.
 */

import {
  cloturerSegment,
  creerTour,
  decider,
  noterTexte,
  phraseSembleFinie,
  texteDuTour,
  type OptionsTour,
} from "../src/lib/dialogueTour.ts"
import {
  apresRafale,
  delaiAvantRafaleSuivante,
  peutEcouterEnVeille,
  RECUL_APRES_ECHEC_MS,
  RECUL_MAX_MS,
  RESPIRATION_MS,
  sansAccuse,
  texteAAfficherEnVeille,
} from "../src/lib/veille.ts"

const OPTS: OptionsTour = { silenceMs: 2000, premierMotMs: 12000, maxMs: 180000 }

let echecs = 0

function verifier(nom: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`)
}

// 1. Une respiration en pleine phrase ne doit pas clore le tour, même quand
//    Android coupe l'écoute de lui-même. (« Micro : gérer les pauses »)
{
  let etat = creerTour(0)
  etat = noterTexte(etat, "rappelle-moi d'appeler le plombier", 1500)
  // Android s'arrête à 2600 ms, soit 1100 ms après le dernier mot.
  verifier("pause courte : on relance au lieu de couper", decider(etat, 2600, OPTS, true), "relancer")
}

// 2. Une phrase longue coupée en plusieurs sessions doit être rendue entière.
//    (« Limite de longueur audio dépassée »)
{
  let etat = creerTour(0)
  etat = noterTexte(etat, "rappelle-moi d'appeler le plombier", 1500)
  etat = cloturerSegment(etat)
  etat = noterTexte(etat, "avant vendredi matin", 3500)
  etat = cloturerSegment(etat)
  etat = noterTexte(etat, "et de payer la facture", 5500)
  verifier(
    "phrase longue : les segments successifs sont recollés",
    texteDuTour(etat),
    "rappelle-moi d'appeler le plombier avant vendredi matin et de payer la facture",
  )
}

// 3. Un vrai silence, lui, clôt le tour.
{
  let etat = creerTour(0)
  etat = noterTexte(etat, "note que je dois passer à la banque", 1500)
  verifier("silence confirmé : on termine", decider(etat, 3600, OPTS, false), "terminer")
  verifier("silence non atteint : on attend", decider(etat, 3000, OPTS, false), "attendre")
}

// 4. Android renvoie le même résultat partiel plusieurs fois par seconde.
//    Le reprendre pour de la parole empêcherait tout silence d'être détecté.
{
  let etat = creerTour(0)
  etat = noterTexte(etat, "bonjour", 1000)
  etat = noterTexte(etat, "bonjour", 1200)
  etat = noterTexte(etat, "bonjour", 2500)
  verifier("partiel répété : le minuteur de silence ne repart pas", etat.dernierMotAt, 1000)
  verifier("partiel répété : le tour se termine bien", decider(etat, 3100, OPTS, false), "terminer")
}

// 5. Personne ne parle : on abandonne, mais seulement au bout du délai.
{
  const etat = creerTour(0)
  verifier("rien dit, délai non écoulé : on relance", decider(etat, 5000, OPTS, true), "relancer")
  verifier("rien dit, délai écoulé : on abandonne", decider(etat, 12000, OPTS, true), "abandonner")
}

// 6. Enchaînement après une réponse de Jarvis : il attend quelques secondes,
//    puis rend la main sans erreur. (« Micro se coupe entre les phrases »)
{
  const suite: OptionsTour = { ...OPTS, premierMotMs: 5000 }
  const etat = creerTour(0)
  verifier("relance après réponse : encore à l'écoute", decider(etat, 3000, suite, false), "attendre")
  verifier("relance après réponse : silence, on rend la main", decider(etat, 5100, suite, true), "abandonner")
}

// 7. Garde-fou : on ne reste jamais en écoute indéfiniment.
{
  let etat = creerTour(0)
  etat = noterTexte(etat, "une très longue dictée", 179000)
  verifier("garde-fou : on rend ce qu'on a", decider(etat, 180001, OPTS, false), "terminer")
}

// 8. La veille (test en direct du 3 sept., symptôme 4) : le micro ne
//    s'ouvre pas tout seul quand l'app est derrière une autre, ni quand
//    quelqu'un s'en sert déjà.
{
  verifier("veille : app à l'écran, au repos → on écoute",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "idle" }), true)
  verifier("veille : après une erreur, on écoute quand même",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "error" }), true)
  verifier("veille : app derrière une autre → JAMAIS",
    peutEcouterEnVeille({ actif: true, visible: false, statut: "idle" }), false)
  verifier("veille : réglage coupé → jamais",
    peutEcouterEnVeille({ actif: false, visible: true, statut: "idle" }), false)
  verifier("veille : une écoute est en cours → on ne double pas",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "listening" }), false)
  verifier("veille : Jarvis parle → on attend",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "speaking" }), false)
}

// 9. Fin de rafale (symptôme 3) : un appui sur le cœur pendant la rafale a
//    pris la main — la veille ne doit plus écraser ce tour.
{
  verifier("rafale : quelqu'un a pris la main → on ne touche à rien",
    apresRafale({ priseAvant: 3, priseApres: 4, transcript: "jarvis ajoute une tâche" }).suite, "laisser")
  verifier("rafale : « Jarvis, ajoute une tâche » → la demande part",
    apresRafale({ priseAvant: 3, priseApres: 3, transcript: "jarvis ajoute une tâche" }),
    { suite: "conversation", demande: "ajoute une tache" })
  verifier("rafale : « Jarvis » seul → « Oui ? »",
    apresRafale({ priseAvant: 3, priseApres: 3, transcript: "Jarvis" }).suite, "oui")
  verifier("rafale : « Jarvis, Jarvis » → « Oui ? », pas une demande « jarvis »",
    apresRafale({ priseAvant: 3, priseApres: 3, transcript: "Jarvis, Jarvis !" }).suite, "oui")
  verifier("rafale : une phrase sans mot-clé → repos, en silence",
    apresRafale({ priseAvant: 3, priseApres: 3, transcript: "je passe à la banque demain" }).suite, "repos")
  verifier("rafale : rien entendu → repos",
    apresRafale({ priseAvant: 3, priseApres: 3, transcript: null }).suite, "repos")
}

// 10. Ce qu'on affiche pendant la veille : rien tant que « Jarvis » n'est
//     pas dit, puis la demande au fil de l'eau (symptôme 2 : Raphaël ne
//     voyait rien apparaître pendant qu'il parlait).
{
  verifier("veille : phrase non adressée → rien à l'écran",
    texteAAfficherEnVeille("bon je passe à la banque"), null)
  verifier("veille : « jarvice mets la mus » → la demande s'affiche déjà",
    texteAAfficherEnVeille("jarvice mets la mus"), "mets la mus")
}

// 11. Démarrage refusé par le service : on recule au lieu de harceler.
{
  verifier("rafale suivante : après un refus, on recule", delaiAvantRafaleSuivante(true), RECUL_APRES_ECHEC_MS)
  verifier("rafale suivante : normalement, juste une respiration", delaiAvantRafaleSuivante(false), RESPIRATION_MS)
  verifier("le recul est plus long que la respiration", RECUL_APRES_ECHEC_MS > RESPIRATION_MS, true)
  // Le service meurt après quelques secondes de silence et chaque
  // redémarrage bipe : tant que personne ne parle, on espace.
  verifier("rafales muettes : 1 → 1 s", delaiAvantRafaleSuivante(false, 1), 1000)
  verifier("rafales muettes : 2 → 2 s", delaiAvantRafaleSuivante(false, 2), 2000)
  verifier("rafales muettes : 3 → 4 s", delaiAvantRafaleSuivante(false, 3), 4000)
  verifier("rafales muettes : plafonné", delaiAvantRafaleSuivante(false, 9), RECUL_MAX_MS)
  verifier("un mot entendu remet le rythme serré", delaiAvantRafaleSuivante(false, 0), RESPIRATION_MS)
}

// 12. Le « Oui ? » de Jarvis, dit pendant que le micro s'ouvre, ne doit pas
//     se retrouver en tête de la demande — mais un vrai « oui » reste un oui.
{
  verifier("écho du « Oui ? » retiré", sansAccuse("oui ? ajoute une tâche"), "ajoute une tâche")
  verifier("écho en majuscule, sans ponctuation", sansAccuse("Oui ajoute une tâche"), "ajoute une tâche")
  verifier("un « oui » seul est une réponse, pas un écho", sansAccuse("oui"), "oui")
  verifier("une phrase qui commence autrement est intacte", sansAccuse("ouvre l'agenda"), "ouvre l'agenda")
}

// 13. Fin de tour adaptative (test en direct du 3 sept. : pause réglée à 4 s,
//     et Jarvis qui attend 4 s après chaque phrase, même finie).
{
  const ADAPT: OptionsTour = { ...OPTS, silenceMs: 4000, silenceCourtMs: 1500 }

  // La phrase tient debout, le moteur a détecté la fin de parole : on clôt
  // à 1,5 s au lieu de 4.
  let etat = creerTour(0)
  etat = noterTexte(etat, "ajoute une tâche pour le plombier", 1000)
  etat = cloturerSegment(etat)
  verifier("phrase finie + moteur arrêté : à 1,6 s on termine", decider(etat, 2600, ADAPT, false), "terminer")
  verifier("phrase finie + moteur arrêté : à 1,2 s on attend encore", decider(etat, 2200, ADAPT, false), "attendre")

  // Phrase suspendue : la pause complète s'applique, comme avant.
  etat = creerTour(0)
  etat = noterTexte(etat, "ajoute une tâche pour le plombier et", 1000)
  etat = cloturerSegment(etat)
  verifier("phrase suspendue sur « et » : on attend la pause complète", decider(etat, 3000, ADAPT, false), "attendre")
  verifier("phrase suspendue : la pause complète clôt quand même", decider(etat, 5100, ADAPT, false), "terminer")

  // Le moteur n'a PAS détecté de fin de parole : rien ne change.
  etat = creerTour(0)
  etat = noterTexte(etat, "ajoute une tâche pour le plombier", 1000)
  verifier("moteur toujours actif : pas de raccourci", decider(etat, 3000, ADAPT, false), "attendre")

  // Des mots arrivent après l'arrêt du moteur : l'indice tombe.
  etat = creerTour(0)
  etat = noterTexte(etat, "ajoute une tâche", 1000)
  etat = cloturerSegment(etat)
  etat = noterTexte(etat, "pour le plombier", 2000)
  verifier("nouveaux mots après l'arrêt : l'indice est remis à zéro", etat.moteurArreteDepuisDernierMot, false)

  // Sans l'option, comportement d'origine strictement conservé.
  etat = creerTour(0)
  etat = noterTexte(etat, "ajoute une tâche pour le plombier", 1000)
  etat = cloturerSegment(etat)
  verifier("sans silenceCourtMs : rien ne change", decider(etat, 2600, OPTS, false), "attendre")
}

// 14. Ce qui a l'air fini, et ce qui ne l'est pas.
{
  verifier("« ajoute une tâche pour le plombier » a l'air finie", phraseSembleFinie("ajoute une tâche pour le plombier"), true)
  verifier("« rappelle-moi d'appeler » se termine sur un verbe : finie", phraseSembleFinie("rappelle-moi d'appeler"), true)
  verifier("« … pour » est suspendue", phraseSembleFinie("ajoute une tâche pour"), false)
  verifier("« … de la » est suspendue", phraseSembleFinie("mets-moi de la"), false)
  verifier("« … qu' » (apostrophe) est suspendue", phraseSembleFinie("dis-lui qu'"), false)
  verifier("« … euh » est suspendue", phraseSembleFinie("il faut que je passe euh"), false)
  verifier("« … à 14h » est finie", phraseSembleFinie("rendez-vous avec Yoni à 14h"), true)
  verifier("vide : pas finie", phraseSembleFinie(""), false)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
