/**
 * Passe de rattrapage sur les souvenirs déjà en base.
 *
 *   node --experimental-strip-types scripts/nettoyer-souvenirs.ts             # montre, n'écrit rien
 *   node --experimental-strip-types scripts/nettoyer-souvenirs.ts --appliquer # écrit
 *
 * `dedoublonnage.ts` empêche les doublons À PARTIR de maintenant. Ceux déjà
 * écrits avant ce chantier, eux, sont toujours là : ils mangent des places
 * dans les huit souvenirs rappelés à chaque phrase. Ce script applique
 * exactement la même décision (même module, mêmes seuils) à ce qui existe.
 *
 * RIEN N'EST SUPPRIMÉ. Un doublon est marqué périmé : il disparaît du rappel
 * (`chercher_souvenirs` filtre `perime_at is null`), reste lisible barré dans
 * l'onglet Mémoire, et Raphaël peut le réactiver d'un bouton. C'est réversible,
 * contrairement à un delete — et la colonne `perime_at` a été créée pour ça.
 *
 * Ce script ne réécrit jamais le texte d'un souvenir : l'empreinte vectorielle
 * se calcule dans les Edge Functions (`Supabase.ai`), pas ici, et une phrase
 * changée sans son empreinte serait introuvable par la recherche. Entre deux
 * formulations d'un même fait, il garde donc la ligne la plus complète telle
 * quelle et périme l'autre.
 *
 * Passe par scripts/sql.sh, donc par la clé de service : aucune validation
 * manuelle à demander à Raphaël.
 */
import { execFileSync } from "node:child_process"
import { decider, completude, type CandidatSouvenir } from "../supabase/functions/voice-command/dedoublonnage.ts"

const APPLIQUER = process.argv.includes("--appliquer")

function sql(requete: string): Record<string, unknown>[] {
  const sortie = execFileSync("scripts/sql.sh", [requete], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const reponse = JSON.parse(sortie) as { ok: boolean; rows: Record<string, unknown>[] | null }
  if (!reponse.ok) throw new Error(`SQL en échec : ${sortie}`)
  return reponse.rows ?? []
}

interface Ligne {
  id: string
  contenu: string
  categorie: string
  created_at: string
}

const souvenirs = sql(
  "select id, contenu, categorie, created_at from souvenirs where perime_at is null and embedding is not null order by created_at",
) as unknown as Ligne[]

console.log(`${souvenirs.length} souvenirs vivants.`)
if (!souvenirs.length) process.exit(0)

// Toutes les paires assez proches pour être examinées, en une requête.
const paires = sql(
  "select a.id as a, b.id as b, (1 - (a.embedding operator(extensions.<=>) b.embedding))::float as prox " +
    "from souvenirs a join souvenirs b on a.id < b.id " +
    "where a.perime_at is null and b.perime_at is null " +
    "and 1 - (a.embedding operator(extensions.<=>) b.embedding) > 0.84",
) as unknown as { a: string; b: string; prox: number }[]

const proximite = new Map<string, number>()
for (const p of paires) {
  proximite.set(`${p.a}|${p.b}`, p.prox)
  proximite.set(`${p.b}|${p.a}`, p.prox)
}
console.log(`${paires.length} paires au-dessus de 0,84 à examiner.`)

/** Les souvenirs qu'on garde, dans l'ordre où on les a rencontrés. */
const gardes: Ligne[] = []
/** id du souvenir à périmer → pourquoi. */
const aPerimer = new Map<string, string>()

for (const ligne of souvenirs) {
  const candidats: CandidatSouvenir[] = gardes
    .map((garde) => ({
      id: garde.id,
      contenu: garde.contenu,
      categorie: garde.categorie,
      proximite: proximite.get(`${ligne.id}|${garde.id}`) ?? 0,
    }))
    .filter((c) => c.proximite > 0)

  const decision = decider(ligne.contenu, candidats)

  if (decision.type === "nouveau") {
    gardes.push(ligne)
    continue
  }

  const garde = gardes.find((g) => g.id === decision.id)!
  const cos = decision.proximite.toFixed(3)

  if (decision.type === "remplacement") {
    // Chiffres différents, le plus récent fait foi : l'ancien devient l'histoire.
    aPerimer.set(garde.id, `mis à jour par « ${ligne.contenu} » (cos ${cos})`)
    gardes.splice(gardes.indexOf(garde), 1, ligne)
    continue
  }

  if (decision.garderNouvelleFormulation) {
    aPerimer.set(garde.id, `dit plus complètement par « ${ligne.contenu} » (cos ${cos})`)
    gardes.splice(gardes.indexOf(garde), 1, ligne)
  } else {
    aPerimer.set(ligne.id, `déjà dit par « ${garde.contenu} » (cos ${cos})`)
  }
}

const parId = new Map(souvenirs.map((s) => [s.id, s]))
console.log(`\n${aPerimer.size} doublon(s) à périmer, ${souvenirs.length - aPerimer.size} souvenirs gardés.\n`)
for (const [id, raison] of aPerimer) {
  console.log(`- « ${parId.get(id)?.contenu} »`)
  console.log(`    ${raison}`)
  console.log(`    mots porteurs de sens : ${completude(parId.get(id)?.contenu ?? "")}`)
}

if (!aPerimer.size) {
  console.log("Rien à faire.")
  process.exit(0)
}

if (!APPLIQUER) {
  console.log("\nRien n'a été écrit. Relance avec --appliquer pour périmer ces doublons.")
  process.exit(0)
}

const ids = [...aPerimer.keys()].map((id) => `'${id}'`).join(", ")
sql(`update souvenirs set perime_at = now(), updated_at = now() where id in (${ids}) and perime_at is null`)
const restants = sql("select count(*)::int as n from souvenirs where perime_at is null")
console.log(`\nFait. ${(restants[0] as { n: number }).n} souvenirs vivants restants.`)
console.log("Ils restent visibles barrés dans l'onglet Mémoire, et réactivables d'un bouton.")
