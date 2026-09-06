/**
 * Une action muette ne doit jamais devenir un silence, ni un mensonge.
 *
 *   node --experimental-strip-types scripts/verifier-retour-vide.ts
 *
 * Chantier 16b5221c. Constaté dans le journal de Raphaël le 6 sept. :
 * `live_commande resultat: ""` sur « réponds à mel ma femme » puis
 * « envoyer le message maintenant ». Le modèle Live, n'ayant rien reçu,
 * comblait — en lui annonçant que le message était parti.
 *
 * Ce contrôle tient les deux moitiés de la règle de Raphaël du 6 sept. :
 * on avoue le vide, et on n'affirme JAMAIS au passé ce qu'on n'a pas
 * constaté — ni le succès, ni l'échec.
 */

import { AVEU_RETOUR_VIDE, retourOuAveu } from "../src/lib/retourVide.ts"

let echecs = 0

function verifier(nom: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) echecs++
  console.log(
    `${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`,
  )
}

// --- 1. Le vide, sous toutes ses formes, est comblé ET signalé -------------
{
  verifier("chaîne vide → aveu, et marquée vide", retourOuAveu(""), { texte: AVEU_RETOUR_VIDE, vide: true })
  verifier("que des espaces → aveu", retourOuAveu("   \n "), { texte: AVEU_RETOUR_VIDE, vide: true })
  verifier("null → aveu", retourOuAveu(null), { texte: AVEU_RETOUR_VIDE, vide: true })
  verifier("undefined → aveu", retourOuAveu(undefined), { texte: AVEU_RETOUR_VIDE, vide: true })
}

// --- 2. Une vraie phrase passe intacte, et n'est PAS marquée vide ----------
// Le drapeau `vide` alimente le registre des erreurs : le lever à tort
// remplirait le registre de faux défauts, et un registre bruyant n'est plus lu.
{
  verifier('« Tâche ajoutée. » passe telle quelle', retourOuAveu("Tâche ajoutée."), {
    texte: "Tâche ajoutée.",
    vide: false,
  })
  verifier("les espaces de bord sont retirés", retourOuAveu("  Message préparé.  "), {
    texte: "Message préparé.",
    vide: false,
  })
  verifier("un message d'échec est une vraie réponse", retourOuAveu("Ça n'a pas marché : réseau."), {
    texte: "Ça n'a pas marché : réseau.",
    vide: false,
  })
  verifier("« 0 » n'est pas vide", retourOuAveu("0"), { texte: "0", vide: false })
}

// --- 3. L'AVEU N'AFFIRME RIEN — c'est tout l'objet du chantier -------------
// Il ne doit ni annoncer un succès (le bug d'origine), ni annoncer un échec
// (aussi faux : l'action a peut-être abouti sans rendre de phrase).
{
  const bas = AVEU_RETOUR_VIDE.toLowerCase()
  verifier(
    "l'aveu ne prétend pas que c'est fait",
    /\b(envoyé|envoyée|fait|faite|ajouté|ajoutée|c'est bon|terminé)\b/.test(bas),
    false,
  )
  verifier("l'aveu ne prétend pas non plus que ça a échoué", /\b(échoué|raté|impossible)\b/.test(bas), false)
  verifier("l'aveu dit qu'il n'a pas eu de retour", /pas eu de retour/.test(bas), true)
  verifier("l'aveu renvoie la vérification à Raphaël", /vérifie/.test(bas), true)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
