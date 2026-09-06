/**
 * Ce qui finit dans le registre des erreurs, et surtout ce qui n'y finit pas.
 *
 *   node --experimental-strip-types scripts/verifier-raison-ecoute.ts
 *
 * POURQUOI CE CONTRÔLE EXISTE. Le 5 sept. 2026, la SEULE ligne ouverte du
 * registre des erreurs était « Le micro s'est arrêté sans rien entendre »,
 * vue 10 fois. En lisant `journal_ecoute` — les vraies données du téléphone,
 * pas une hypothèse — ces signalements venaient de 363 rafales de VEILLE
 * terminées sans un mot, sur 387 au total :
 *
 *     rafale_fin | silencieuse=true | rien_entendu=true  | n=363
 *     rafale_fin | silencieuse=true | rien_entendu=false | n=0
 *
 * Ce n'était pas une panne : c'était la pièce qui était calme. Une fausse
 * alerte qui occupait la seule place ouverte du registre, donc qui masquait
 * les vraies.
 *
 * Ce contrôle garde la frontière dans les deux sens, et c'est le point :
 * il refuse aussi bien qu'on se remette à crier sur un silence ordinaire
 * QUE qu'on se taise sur une vraie panne. `erreurDepuisEcoute` n'avait
 * aucune vérification malgré ce que promettait son propre commentaire.
 */

import { erreurDepuisEcoute } from "../src/lib/erreurs.ts"
import { estUnePanne, raisonDepuisCode, titreDeLaPanne } from "../src/lib/raisonEcoute.ts"

let echecs = 0

function verifier(nom: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) echecs++
  console.log(
    `${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`,
  )
}

/** Le titre signalé, ou null si l'événement ne doit rien signaler. */
function titre(evenement: string, detail: Record<string, string | number | boolean | null>) {
  return erreurDepuisEcoute(evenement, detail)?.titre ?? null
}

// --- 1. Les codes d'Android, traduits -------------------------------------
{
  verifier("ERROR_NO_MATCH (7) = un silence", raisonDepuisCode(7), "silence")
  verifier("ERROR_SPEECH_TIMEOUT (6) = un silence", raisonDepuisCode(6), "silence")
  verifier("ERROR_RECOGNIZER_BUSY (8) = service occupé", raisonDepuisCode(8), "occupe")
  verifier("ERROR_INSUFFICIENT_PERMISSIONS (9) = permission", raisonDepuisCode(9), "permission")
  verifier("ERROR_NETWORK (2) = réseau", raisonDepuisCode(2), "reseau")
  verifier("ERROR_AUDIO (3) = micro", raisonDepuisCode(3), "audio")
  // Un code qu'on ne connaît pas est une panne, jamais un silence : se
  // tromper dans ce sens fait du bruit, l'inverse rend Jarvis muet sans
  // qu'on le sache.
  verifier("un code inconnu reste une panne", raisonDepuisCode(99), "service")
  verifier("pas de code (vieille APK, web) : on ne sait pas", raisonDepuisCode(null), null)

  verifier("« silence » n'est pas une panne", estUnePanne("silence"), false)
  verifier("« occupe » est une panne", estUnePanne("occupe"), true)
  verifier("l'absence de raison n'est pas une panne", estUnePanne(null), false)
}

// --- 2. La veille silencieuse ne dit RIEN ---------------------------------
// C'est le cas exact des 363 rafales, et la raison d'être de ce fichier.
{
  const rafaleCalme = {
    mode: "veille",
    duree_ms: 1517,
    partiels: 0,
    mot_cle: false,
    final_attendu: false,
    final_recu: false,
    mort_silencieuse: true,
    demarrage_refuse: false,
    raison: "silence",
    entendu: null,
  }
  verifier("veille : Android dit « personne n'a parlé » → rien à signaler", titre("rafale_fin", rafaleCalme), null)

  // Vieille APK : le patch n'émet pas encore la raison. On se tait quand
  // même — c'était précisément la fausse alerte.
  verifier(
    "veille : sans raison connue → toujours rien (c'était la fausse alerte)",
    titre("rafale_fin", { ...rafaleCalme, raison: null }),
    null,
  )
}

// --- 3. Mais une VRAIE panne en veille se signale, elle ---------------------
{
  const base = {
    mode: "veille",
    duree_ms: 1510,
    partiels: 0,
    mort_silencieuse: true,
    demarrage_refuse: false,
    entendu: null,
  }
  verifier(
    "veille : service occupé → signalé, et le titre dit la cause",
    titre("rafale_fin", { ...base, raison: "occupe" }),
    titreDeLaPanne("occupe"),
  )
  verifier(
    "veille : micro refusé → signalé",
    titre("rafale_fin", { ...base, raison: "permission" }),
    titreDeLaPanne("permission"),
  )
  verifier(
    "veille : panne réseau → signalée",
    titre("rafale_fin", { ...base, raison: "reseau" }),
    titreDeLaPanne("reseau"),
  )

  // LE PIÈGE DE LA CORRECTION ELLE-MÊME. Depuis le patch, l'erreur d'Android
  // arrive AVANT le pouls qui relisait `isListening()` : celui-ci ne se
  // déclenche donc plus, et `mort_silencieuse` reste à faux. Exiger une mort
  // silencieuse pour signaler quoi que ce soit rendrait le registre aveugle
  // aux vraies pannes, sur les APK récentes uniquement — le genre de trou
  // qu'on ne voit qu'après coup, chez Raphaël.
  verifier(
    "veille : panne connue SANS mort silencieuse (APK récente) → signalée quand même",
    titre("rafale_fin", { ...base, mort_silencieuse: false, raison: "occupe" }),
    titreDeLaPanne("occupe"),
  )
  verifier(
    "veille : silence connu SANS mort silencieuse → toujours rien",
    titre("rafale_fin", { ...base, mort_silencieuse: false, raison: "silence" }),
    null,
  )
}

// --- 4. Le mode commande : un silence EST une perte -------------------------
// Il a appuyé, il a parlé, il attend une réponse. Ne rien signaler ici
// reproduirait le défaut inverse : une panne qui se lit comme une absence.
{
  const commandeVide = {
    mode: "commande",
    raison: "silence",
    duree_ms: 8000,
    sessions: 2,
    partiels: 0,
    morts_silencieuses: 2,
    finals_apres_stop: 0,
    arret_manuel: false,
    entendu: null,
  }
  verifier(
    "commande : rien entendu → signalé, même si Android dit « silence »",
    titre("commande_fin", commandeVide),
    "Le micro s'est arrêté sans rien entendre",
  )
  verifier(
    "commande : service occupé → le titre dit la cause",
    titre("commande_fin", { ...commandeVide, raison: "occupe" }),
    titreDeLaPanne("occupe"),
  )
}

// --- 5. Ce qui a été entendu ne se signale jamais ---------------------------
// Le mode commande relance et rattrape tout seul : 16 tours sur 21 le
// 5 sept. avaient au moins une mort silencieuse ET ont quand même abouti.
{
  verifier(
    "commande : des morts silencieuses mais du texte au bout → rien",
    titre("commande_fin", {
      mode: "commande",
      raison: "silence",
      morts_silencieuses: 3,
      entendu: "rappelle-moi d'appeler le plombier",
    }),
    null,
  )
  verifier(
    "veille : le mot-clé entendu malgré une coupure → rien",
    titre("rafale_fin", {
      mode: "veille",
      mort_silencieuse: true,
      raison: "occupe",
      entendu: "jarvis ajoute une tâche",
    }),
    null,
  )
  verifier(
    "une rafale qui se termine normalement → rien",
    titre("rafale_fin", { mode: "veille", mort_silencieuse: false, raison: null, entendu: null }),
    null,
  )
}

// --- 6. Le reste de la table n'a pas bougé ---------------------------------
{
  verifier(
    "le serveur vocal qui refuse est toujours signalé",
    titre("reponse", { erreur: "quota", source: "modele" }),
    "Le serveur vocal a refusé de répondre",
  )
  verifier(
    "le Live qui n'obtient pas de jeton est toujours signalé",
    titre("live_echec", { etape: "jeton", detail: "401" }),
    "Le mode Live n'obtient pas de jeton",
  )
  verifier("une réponse sans erreur ne signale rien", titre("reponse", { erreur: null }), null)
  verifier("un événement quelconque ne signale rien", titre("rafale_debut", {}), null)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
