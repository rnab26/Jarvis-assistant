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
  texteDuTour,
  type OptionsTour,
} from "../src/lib/dialogueTour.ts"

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

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
