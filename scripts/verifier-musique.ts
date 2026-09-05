/**
 * Vérifie que Jarvis ne ment plus quand il lance une musique.
 *
 *   node --experimental-strip-types scripts/verifier-musique.ts
 *
 * LE BUG, signalé par Raphaël le 5 sept. 2026 : « depuis le début j'essaie de
 * lancer une musique avec un titre particulier ou même sans titre
 * particulier, si je veux lancer un artiste, ça ne fonctionne pas. » Le
 * plugin se rabattait EN SILENCE sur l'ouverture nue de l'application quand
 * elle ne déclarait pas l'intent « joue ça » d'Android, et Jarvis répondait
 * « je lance » dans tous les cas. Rien, ni la réponse ni les journaux, ne
 * permettait de savoir depuis ici lequel des trois s'était produit chez lui.
 *
 * Ce qui se vérifie sans téléphone : que les trois issues donnent trois
 * phrases DIFFÉRENTES, qu'une seule dit « je lance », et que le plugin
 * essaie bien la lecture, puis la recherche, puis l'ouverture — dans cet
 * ordre. L'ordre inverse annulerait tout le correctif sans qu'aucun type ni
 * aucun typecheck ne s'en aperçoive.
 */
import { readFileSync } from "node:fs"
import { phraseMusique } from "../src/lib/actionsTelephoneMusique.ts"
import { erreurDepuisEcoute } from "../src/lib/erreurs.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const lecture = phraseMusique("lecture", "du Miles Davis", "Spotify")
const recherche = phraseMusique("recherche", "du Miles Davis", "Apple Music")
const ouverture = phraseMusique("ouverture", "du Miles Davis", "Apple Music")

verifier(
  "les trois issues ne disent pas la même chose",
  new Set([lecture, recherche, ouverture]).size === 3,
  [lecture, recherche, ouverture].join("\n      "),
)
verifier(
  "seule la vraie lecture annonce « je lance »",
  lecture.startsWith("Je lance") &&
    !recherche.startsWith("Je lance") &&
    !ouverture.startsWith("Je lance"),
  "c'est exactement le mensonge que Raphaël voit depuis le début",
)
verifier(
  "l'ouverture nue dit que rien ne joue",
  /refuse de lancer/.test(ouverture),
  ouverture,
)
verifier(
  "et elle nomme le réglage à changer",
  /Paramètres/.test(ouverture) && /application de musique/.test(ouverture),
  "sans ça il ne peut pas faire le lien entre son app par défaut et l'échec",
)
verifier(
  "la recherche dit ce qu'il lui reste à faire",
  /appuie/.test(recherche),
  recherche,
)
verifier(
  "les trois nomment ce qui a été demandé",
  [lecture, recherche, ouverture].every((p) => p.includes("du Miles Davis")),
)
verifier(
  "sans application connue, la phrase reste lisible",
  !phraseMusique("ouverture", "du Miles Davis", null).includes("null"),
  phraseMusique("ouverture", "du Miles Davis", null),
)

// ------------------------------------------------------ le plugin Android

const java = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/ActionsTelephonePlugin.java",
  "utf8",
)
const corps = java.slice(
  java.indexOf("public void ouvrirApplication(PluginCall call)"),
  java.indexOf("Le répertoire du téléphone, en lecture seule"),
)

verifier(
  "le plugin dit laquelle des trois issues s'est produite",
  ['"lecture"', '"recherche"', '"ouverture"'].every((v) => corps.includes(`res.put("resultat", ${v})`)),
  "sans ce retour, la phrase repart sur « je lance » quoi qu'il arrive",
)
verifier(
  "il essaie la lecture, PUIS la recherche, PUIS l'ouverture",
  corps.indexOf('res.put("resultat", "lecture")') <
    corps.indexOf('res.put("resultat", "recherche")') &&
    corps.indexOf('res.put("resultat", "recherche")') <
      corps.indexOf('res.put("resultat", "ouverture")'),
  "ouvrir l'app avant d'avoir essayé de jouer ne jouerait plus jamais rien",
)
verifier(
  "la requête part avec le type de recherche attendu par Android",
  corps.includes("EXTRA_MEDIA_FOCUS") && corps.includes("SearchManager.QUERY"),
  "sans EXTRA_MEDIA_FOCUS, plusieurs applications ignorent la requête",
)

const table = java.slice(java.indexOf("private String lienRecherche"), java.indexOf("public void ouvrirApplication"))
for (const paquet of [
  "com.spotify.music",
  "com.apple.android.music",
  "com.google.android.apps.youtube.music",
]) {
  verifier(
    `un lien de recherche existe pour ${paquet}`,
    table.includes(paquet),
    "sans lien, cette app retombe sur l'ouverture nue — le symptôme d'origine",
  )
}
verifier(
  "les requêtes sont encodées avant d'entrer dans une URL",
  table.includes("Uri.encode(requete)"),
  "« Miles Davis & Coltrane » casserait l'adresse en silence",
)

// ------------------------------------- l'échec ne se perd pas au bout de 7 j

const echec = erreurDepuisEcoute("musique_resultat", {
  resultat: "ouverture",
  requete: "du Miles Davis",
  app_choisie: "Apple Music",
  paquet_trouve: "com.apple.android.music",
})
verifier(
  "une musique non lancée entre au registre des erreurs",
  echec !== null && echec.categorie === "action",
  "journal_ecoute est purgé à 7 jours et ne se lit qu'en SQL : l'échec y disparaîtrait",
)
verifier(
  "et elle nomme l'application qui a refusé",
  (echec?.detail ?? "").includes("Apple Music"),
  echec?.detail ?? "(rien)",
)
verifier(
  "une lecture réussie n'encombre pas le registre",
  erreurDepuisEcoute("musique_resultat", { resultat: "lecture", requete: "x", app_choisie: "Spotify" }) ===
    null,
  "un registre plein de succès n'est plus lu du tout",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
