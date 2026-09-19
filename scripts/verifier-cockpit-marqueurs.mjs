#!/usr/bin/env node
// Un chantier livré dont le crochet d'en-tête dit encore [LIBRE] est invisible
// deux fois : l'app le range parmi "libre" (une session le reprend comme
// neuf) au lieu de "à constater" (Raphaël doit juste l'essayer), et son statut
// réel n'apparaît nulle part. Trouvé le 18 sept. 2026 en lisant sa capture du
// cockpit : cinq chantiers réellement livrés (mergés, CI verte) portaient
// encore [LIBRE] parce que la règle "n'écrase jamais, ajoute en bas" avait été
// suivie à la lettre — sans que personne ne retouche ensuite le crochet du
// haut, qui est la SEULE chose que l'app lit (src/lib/marqueurChantier.ts).
//
// Ce script AUDITE, il ne corrige rien tout seul : une correction automatique
// par regex peut mal lire des crochets imbriqués (vécu ce jour-là sur un vrai
// chantier, réparé à la main) — un marqueur mal réécrit est pire qu'un
// marqueur resté faux, qui au moins ne casse pas la note. Une session qui lit
// une ligne flaggée ici relit la note, décide si c'est vraiment livré, et
// change le crochet À LA MAIN.
//
// La classification EST celle de src/lib/marqueurChantier.ts (classer()),
// recopiée ici en miniature parce que ce fichier importe des alias Vite
// ("@/...") qu'un script Node autonome ne résout pas. Si marqueurChantier.ts
// change sa table de correspondance, mets cette copie à jour dans le même
// travail — c'est le même risque de divergence documenté partout ailleurs
// dans ce dépôt pour les marqueurs (theme/section, destinataire...).
//
// Usage : SUPABASE_SERVICE_ROLE_KEY=... node scripts/verifier-cockpit-marqueurs.mjs

const URL = "https://bexiyvmdbxcwxasgslxp.supabase.co/rest/v1/rpc/exec_sql"
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY manquante.")
  process.exit(1)
}

function classer(entete) {
  const e = entete.toLowerCase()
  if (e.includes("doublon")) return "doublon"
  if (e.includes("a faire par raphael") || e.includes("à faire par raphaël")) return "pour_raphael"
  if (e.includes("reste a constater") || e.includes("reste à constater")) return "a_constater"
  if (e.includes("cadrer")) return "a_cadrer"
  if (e.includes("report")) return "reporte"
  if (e.includes("bloqu")) return "bloque"
  if (e.includes("libre")) return "libre"
  return null
}

function marqueurDe(notes) {
  if (!notes) return null
  let reste = notes.trimStart()
  const tete = []
  for (let i = 0; i < 2; i++) {
    const m = reste.match(/^\[([^\]]{0,400})\]/)
    if (!m) break
    tete.push(m[1].slice(0, 60))
    reste = reste.slice(m[0].length).trimStart()
  }
  if (tete.length === 0) return null
  return classer(tete.join(" "))
}

// Signaux forts qu'un chantier est réellement livré, cherchés dans le CORPS
// (hors du crochet d'en-tête) — mesurés sur les 5 cas trouvés le 18 sept.
const SIGNAUX_LIVRE = [
  "ne pas archiver avant",
  "rien d'autre à coder",
  "rien a coder",
  "rien à coder de plus",
  "fusionné dans le tronc",
  "fusionne dans le tronc",
  "mergé dans le tronc",
  "merge dans le tronc",
]

async function requete(query) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  if (!data.ok) throw new Error(JSON.stringify(data))
  return data.rows ?? []
}

const rows = await requete(
  `select id, title, notes from dev_items where archived_at is null and notes is not null`,
)

const suspects = []
for (const row of rows) {
  const marqueur = marqueurDe(row.notes)
  if (marqueur !== "libre" && marqueur !== null) continue // seuls "libre"/absent sont mal orientables
  const corps = row.notes.toLowerCase()
  if (SIGNAUX_LIVRE.some((s) => corps.includes(s))) {
    suspects.push({ id: row.id, title: row.title, marqueur: marqueur ?? "(aucun)" })
  }
}

if (suspects.length === 0) {
  console.log("Aucun crochet d'en-tête suspect. Tous les chantiers 'livré' portent le bon marqueur.")
  process.exit(0)
}

console.log(`${suspects.length} chantier(s) à vérifier — le corps dit "livré", le crochet dit autre chose :\n`)
for (const s of suspects) {
  console.log(`  [${s.marqueur}] ${s.id}  ${s.title}`)
}
console.log(
  "\nPour chacun : relis la note en entier, et si c'est vraiment livré, change le crochet\n" +
    "d'en-tête pour [LIVRÉ — RESTE À CONSTATER SUR SON TÉLÉPHONE] (jamais par regex\n" +
    "automatique sur un crochet qui peut être imbriqué — corrige à la main).",
)
process.exit(1)
