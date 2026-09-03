/**
 * Vérifie qu'un thème ne peut pas exister en deux exemplaires.
 *
 *   node --experimental-strip-types scripts/verifier-theme.ts
 *
 * Aucun réseau. Le 3 sept. 2026 la base portait « L'app elle-même » ET
 * « L app elle-meme », « Voix et écoute » ET « Voix et ecoute » : même sujet,
 * deux groupes dans le cockpit, et le regroupement par thème — la façon dont
 * Raphaël veut qu'on travaille — coupé en deux. Les doublons se voient à l'œil
 * dans une liste de huit thèmes ; dans une liste de trente, non.
 *
 * Ce qui est vérifié ici : une saisie équivalente à un thème existant renvoie
 * TOUJOURS l'existant, à l'orthographe près — et un thème réellement nouveau
 * passe quand même.
 */
import { cleTheme, resoudreTheme } from "../src/lib/themeChantier.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/** Les thèmes réellement en base après le nettoyage du 3 sept. */
const EXISTANTS = [
  "L'app elle-même",
  "Voix et écoute",
  "Le téléphone",
  "Mémoire et apprentissage",
  "Ce qu'il me signale",
  "Recherche et veille",
  "Messagerie et agenda",
  "Coût de fonctionnement",
]

// Les vraies formes fautives trouvées en base, plus les façons dont une
// dictée ou un clavier de téléphone peuvent les écrire.
const DOIT_RETOMBER_SUR: [string, string][] = [
  ["L app elle-meme", "L'app elle-même"],
  ["l'app elle-meme", "L'app elle-même"],
  ["L'APP ELLE-MÊME", "L'app elle-même"],
  ["L’app elle-même", "L'app elle-même"], // apostrophe courbe du clavier iOS
  ["  L'app   elle-même  ", "L'app elle-même"],
  ["Voix et ecoute", "Voix et écoute"],
  ["voix et écoute", "Voix et écoute"],
  ["Le telephone", "Le téléphone"],
  ["Cout de fonctionnement", "Coût de fonctionnement"],
  ["memoire et apprentissage", "Mémoire et apprentissage"],
  ["L'app elle même", "L'app elle-même"], // tiret oublié
  ["L'app_elle_meme", "L'app elle-même"],
]

for (const [saisie, attendu] of DOIT_RETOMBER_SUR) {
  const r = resoudreTheme(saisie, EXISTANTS)
  verifier(
    `« ${saisie} » retombe sur « ${attendu} »`,
    r === attendu,
    `obtenu « ${r} » — un thème jumeau serait créé`,
  )
}

// Un thème vraiment nouveau doit passer : la règle regroupe, elle n'interdit pas.
const NOUVEAUX = ["Facturation", "Sécurité et accès", "Trésorerie"]
for (const saisie of NOUVEAUX) {
  const r = resoudreTheme(saisie, EXISTANTS)
  verifier(`« ${saisie} » reste un nouveau thème`, r === saisie, `obtenu « ${r} »`)
}

// Rien de saisi : pas de thème, et surtout pas une chaîne vide en base.
for (const vide of ["", "   ", "\n\t "]) {
  verifier(
    `rien pour ${JSON.stringify(vide)}`,
    resoudreTheme(vide, EXISTANTS) === null,
    "une chaîne a été renvoyée au lieu de null",
  )
}

// Deux thèmes distincts ne doivent pas fusionner par excès de zèle : la clé
// efface les accents et la ponctuation, pas les mots.
const DOIVENT_RESTER_DISTINCTS: [string, string][] = [
  ["Voix et écoute", "Voix"],
  ["Le téléphone", "Les téléphones"],
  ["Recherche et veille", "Recherche"],
  ["Mémoire et apprentissage", "Apprentissage"],
]
for (const [a, b] of DOIVENT_RESTER_DISTINCTS) {
  verifier(
    `« ${a} » et « ${b} » restent deux thèmes`,
    cleTheme(a) !== cleTheme(b),
    "les deux ont la même clé : ils fusionneraient à tort",
  )
}

// La liste réelle ne doit contenir aucun jumeau : ce contrôle échouera le jour
// où une session en réintroduira un.
const parCle = new Map<string, string[]>()
for (const t of EXISTANTS) {
  const c = cleTheme(t)
  parCle.set(c, [...(parCle.get(c) ?? []), t])
}
for (const [c, noms] of parCle) {
  verifier(`aucun jumeau pour « ${c} »`, noms.length === 1, `trouvés : ${noms.join(" / ")}`)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
