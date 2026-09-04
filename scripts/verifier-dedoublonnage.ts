/**
 * Vérifie que la mémoire ne réécrit pas trois fois la même chose — et qu'elle
 * ne confond pas non plus deux dossiers différents.
 *
 *   node --experimental-strip-types scripts/verifier-dedoublonnage.ts
 *
 * Aucun réseau. Les proximités utilisées ici ne sont pas inventées : elles ont
 * été mesurées le 4 sept. 2026 sur les empreintes réelles des 21 souvenirs de
 * Raphaël, par une requête sur toutes les paires. C'est ce qui donne les
 * seuils de `dedoublonnage.ts`, et c'est ce que ce contrôle protège : un seuil
 * relevé « pour être sûr » ne dédoublonnerait plus rien, un seuil baissé
 * « pour en attraper plus » fusionnerait deux dossiers distincts.
 */
import {
  SEUILS_PAR_DEFAUT,
  completude,
  decider,
  nombres,
  nomsPropres,
  recouvrementLexical,
} from "../supabase/functions/voice-command/dedoublonnage.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ---------------------------------------------------------------------------
// 1. Les trois doublons réels, écrits en 38 secondes le 3 sept. 2026.
// ---------------------------------------------------------------------------

const A = "Raphaël gère un projet ou dossier appelé « la boutique des fripouille »."
const B = "Raphaël est impliqué dans un projet ou dossier concernant une boutique appelée Fripouille à Hipouy."
const C = "Raphaël travaille sur un projet pour la boutique Fripouille à Hipouy."

const DOUBLONS_REELS: [string, string, number][] = [
  [C, B, 0.978],
  [A, B, 0.966],
  [A, C, 0.958],
]

for (const [nouveau, existant, proximite] of DOUBLONS_REELS) {
  const d = decider(nouveau, [{ id: "x", contenu: existant, proximite }])
  verifier(
    `doublon réel reconnu (cos ${proximite}) : « ${nouveau.slice(0, 40)}… »`,
    d.type === "fusion",
    `obtenu « ${d.type} » — la mémoire continuerait d'enfler en doublons`,
  )
}

// La formulation gardée est la plus complète, quel que soit l'ordre d'arrivée.
{
  const versLaRiche = decider(B, [{ id: "x", contenu: A, proximite: 0.966 }])
  const versLaPauvre = decider(A, [{ id: "x", contenu: B, proximite: 0.966 }])
  verifier(
    "la formulation la plus complète gagne, même si elle arrive en premier",
    versLaRiche.type === "fusion" &&
      versLaRiche.contenu === B &&
      versLaPauvre.type === "fusion" &&
      versLaPauvre.contenu === B,
    `obtenu « ${versLaRiche.type === "fusion" ? versLaRiche.contenu : versLaRiche.type} » puis ` +
      `« ${versLaPauvre.type === "fusion" ? versLaPauvre.contenu : versLaPauvre.type} »`,
  )
  verifier(
    "« Fripouille à Hipouy » est bien jugée plus complète que « des fripouille »",
    completude(B) > completude(A),
    `${completude(B)} contre ${completude(A)}`,
  )
}

// ---------------------------------------------------------------------------
// 2. Les faux amis réels : proches pour l'empreinte, faits distincts.
//    Aucun ne doit fusionner. Ce sont les paires les plus dangereuses de la
//    base — les suivantes descendent à 0,93 et en dessous.
// ---------------------------------------------------------------------------

const FAUX_AMIS: [string, string, number][] = [
  [
    "Jarvis est une personne avec laquelle Raphaël a des discussions liées au micro.",
    "Il y a un chantier en cours concernant le micro et les discussions avec Jarvis.",
    0.938,
  ],
  [
    "Jarvis est une personne avec laquelle Raphaël a des discussions liées au micro.",
    "Raphaël cherche une solution de discussion durable et viable pour le sujet du micro avec Jarvis.",
    0.937,
  ],
  [
    "Raphaël veut que les tâches du cockpit soient regroupées par thème pour que Claude puisse les traiter en bloc plutôt que de faire des solutions ponctuelles.",
    "Raphaël préfère que les tâches dans la vue cockpit soient triées et classées par section de chantier avec un résumé du nombre de tâches restantes.",
    0.93,
  ],
  [
    "Il faut acheter du matériel pour les pauses à la boutique Fripouille.",
    "Raphaël travaille sur un projet pour la boutique Fripouille à Hipouy.",
    0.913,
  ],
  ["Raphaël est marié.", B, 0.907],
  [
    "Raphaël a besoin de boîtes de rangement pour son scooter.",
    "Raphaël préfère une assistance directe et concise, sans bavardage inutile.",
    0.902,
  ],
]

for (const [nouveau, existant, proximite] of FAUX_AMIS) {
  const d = decider(nouveau, [{ id: "x", contenu: existant, proximite }])
  verifier(
    `faux ami écarté (cos ${proximite}) : « ${nouveau.slice(0, 40)}… »`,
    d.type === "nouveau",
    `obtenu « ${d.type} » — deux faits distincts seraient fusionnés, et l'un des deux perdu`,
  )
}

// ---------------------------------------------------------------------------
// 3. Le garde-fou des noms propres : deux dossiers qui se ressemblent mot pour
//    mot. C'est le cas où une fusion détruirait vraiment de l'information.
// ---------------------------------------------------------------------------

{
  const villaDan = "Le matériau choisi pour la villa Dan est le grès cérame."
  const villaBen = "Le matériau choisi pour la villa Ben est le grès cérame."
  const d = decider(villaBen, [{ id: "x", contenu: villaDan, proximite: 0.995 }])
  verifier(
    "villa Dan et villa Ben restent deux dossiers, malgré une proximité de 0,995",
    d.type === "nouveau",
    `obtenu « ${d.type} » — un des deux chantiers disparaîtrait de la mémoire`,
  )
  verifier(
    "les noms propres sont relevés hors début de phrase",
    nomsPropres(villaDan).has("dan") && !nomsPropres("Dan est content.").has("dan"),
    `relevés : ${[...nomsPropres(villaDan)].join(", ")}`,
  )
  verifier(
    "une précision d'un seul côté ne bloque pas la fusion",
    decider(B, [{ id: "x", contenu: A, proximite: 0.966 }]).type === "fusion",
    "« Fripouille à Hipouy » doit pouvoir enrichir « des fripouille »",
  )
}

// ---------------------------------------------------------------------------
// 4. Un chiffre qui change n'est pas un doublon : c'est une mise à jour.
//    L'ancien est périmé, pas effacé — Jarvis doit pouvoir dire « avant
//    c'était 4 000 ».
// ---------------------------------------------------------------------------

{
  const avant = "Le loyer de la villa Dan est de 4 000 shekels par mois."
  const apres = "Le loyer de la villa Dan est de 4 500 shekels par mois."
  const d = decider(apres, [{ id: "ancien", contenu: avant, proximite: 0.99 }])
  verifier(
    "un montant qui change périme l'ancien souvenir au lieu de le remplacer en silence",
    d.type === "remplacement" && d.id === "ancien",
    `obtenu « ${d.type} »`,
  )
  verifier(
    "les séparateurs de milliers ne créent pas de faux changement",
    nombres("4 000 shekels").has("4000") && nombres("4.000 shekels").has("4000"),
    `relevés : ${[...nombres("4 000 shekels")].join(", ")} / ${[...nombres("4.000 shekels")].join(", ")}`,
  )
  const identique = decider(
    "Le loyer de la villa Dan est de 4000 shekels par mois.",
    [{ id: "ancien", contenu: avant, proximite: 0.99 }],
  )
  verifier(
    "le même montant écrit autrement reste un doublon, pas une mise à jour",
    identique.type === "fusion",
    `obtenu « ${identique.type} »`,
  )
}

// ---------------------------------------------------------------------------
// 5. Le candidat le plus proche n'est pas toujours le bon : s'il est écarté,
//    on regarde le suivant.
// ---------------------------------------------------------------------------

{
  const d = decider(C, [
    { id: "villa", contenu: "Le matériau choisi pour la villa Dan est le grès cérame.", proximite: 0.97 },
    { id: "boutique", contenu: B, proximite: 0.96 },
  ])
  verifier(
    "un candidat écarté ne masque pas le vrai doublon derrière lui",
    d.type === "fusion" && d.id === "boutique",
    `obtenu « ${d.type} » sur ${d.type === "fusion" ? d.id : "-"}`,
  )
}

// ---------------------------------------------------------------------------
// 6. Cas dégradés : rien ne doit lever.
// ---------------------------------------------------------------------------

{
  verifier("aucun candidat : on insère", decider(C, []).type === "nouveau")
  verifier("texte vide : on n'invente rien", decider("   ", [{ id: "x", contenu: C, proximite: 0.99 }]).type === "nouveau")
  verifier(
    "candidat vide ignoré",
    decider(C, [{ id: "x", contenu: "", proximite: 0.99 }]).type === "nouveau",
  )
  verifier(
    "deux phrases identiques fusionnent sans réécrire",
    (() => {
      const d = decider(C, [{ id: "x", contenu: C, proximite: 1 }])
      return d.type === "fusion" && !d.garderNouvelleFormulation
    })(),
  )
  verifier(
    "le recouvrement lexical ignore les mots outils",
    recouvrementLexical("Le chat de la maison", "Un chat dans une maison") === 1,
    `obtenu ${recouvrementLexical("Le chat de la maison", "Un chat dans une maison")}`,
  )
  verifier(
    "singulier et pluriel comptent pour le même mot",
    recouvrementLexical("Il faut des boutiques", "Il faut une boutique") === 1,
    `obtenu ${recouvrementLexical("Il faut des boutiques", "Il faut une boutique")}`,
  )
}

// ---------------------------------------------------------------------------
// 7. Les seuils eux-mêmes : la marge doit rester visible dans les deux sens.
// ---------------------------------------------------------------------------

verifier(
  "le seuil de proximité laisse une marge entre le vrai doublon le plus lâche (0,958) et le faux ami le plus proche (0,938)",
  SEUILS_PAR_DEFAUT.proximite > 0.938 && SEUILS_PAR_DEFAUT.proximite <= 0.958,
  `seuil ${SEUILS_PAR_DEFAUT.proximite}`,
)
verifier(
  "le seuil lexical laisse une marge entre 0,44 (vrai doublon) et 0,33 (faux ami)",
  SEUILS_PAR_DEFAUT.lexical > 0.33 && SEUILS_PAR_DEFAUT.lexical <= 0.44,
  `seuil ${SEUILS_PAR_DEFAUT.lexical}`,
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
