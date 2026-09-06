/**
 * Vérifie la détection des thèmes sans section déclarée.
 *
 *   node --experimental-strip-types scripts/verifier-themes-non-declares.ts
 *
 * Chantier 765af020, 6 sept. 2026.
 */
import { themesNonDeclares } from "../src/lib/themesNonDeclares.ts"
import type { DevItem, DevSection } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

function item(theme: string | null, archived = false): DevItem {
  return {
    id: theme ?? "x",
    theme,
    archived_at: archived ? "2026-01-01T00:00:00Z" : null,
  } as DevItem
}

function section(nom: string): DevSection {
  return { nom } as DevSection
}

// ── Le cas réel du 6 sept. ──
{
  const items = [
    item("Site de Mélissa"), item("Site de Mélissa"), item("Le cockpit"),
    item("Le téléphone"), item("Le téléphone"),
  ]
  const sections = [section("Le téléphone"), section("L'app elle-même")]
  const resultat = themesNonDeclares(items, sections)
  verifier(
    "deux thèmes sans section, triés par nombre de chantiers décroissant",
    resultat.length === 2 &&
      resultat[0].theme === "Site de Mélissa" && resultat[0].chantiers === 2 &&
      resultat[1].theme === "Le cockpit" && resultat[1].chantiers === 1,
    JSON.stringify(resultat),
  )
}

// ── Accents, apostrophes, majuscules : ne comptent pas comme des thèmes différents ──
verifier(
  "« L app elle-meme » compte comme « L'app elle-même », déjà déclaré",
  themesNonDeclares([item("L app elle-meme")], [section("L'app elle-même")]).length === 0,
)

// ── Silence attendu ──
verifier("tous les thèmes déclarés : rien à signaler", themesNonDeclares(
  [item("Le téléphone"), item("L'app elle-même")],
  [section("Le téléphone"), section("L'app elle-même")],
).length === 0)

verifier("aucun chantier : rien à signaler", themesNonDeclares([], [section("Le téléphone")]).length === 0)

verifier(
  "un chantier archivé sans section ne compte pas : c'est du passé",
  themesNonDeclares([item("Ancien thème", true)], []).length === 0,
)

verifier(
  "un chantier sans thème n'en fabrique pas un",
  themesNonDeclares([item(null)], []).length === 0,
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
