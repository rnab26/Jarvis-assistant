/**
 * Vérifie la détection des doublons DÉJÀ en base.
 *
 *   node --experimental-strip-types scripts/verifier-doublons-existants.ts
 *
 * Ce qui compte ici n'est pas d'attraper le plus de paires possible : c'est de
 * ne pas crier au loup. Sa règle, écrite pour l'avertissement de saisie et
 * valable ici : « un avertissement qui se déclenche à tort n'est plus lu du
 * tout ». Les cas ci-dessous sont donc surtout des cas où il faut SE TAIRE.
 */
import { doublonsExistants, SEUIL_DOUBLON } from "../src/lib/doublonsExistants.ts"
import type { DevItem } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
function item(title: string, opts: Partial<DevItem> = {}): DevItem {
  n++
  return {
    id: `i${n}`,
    user_id: "u",
    title,
    notes: null,
    status: "todo",
    priority: "normal",
    theme: null,
    archived_at: null,
    created_at: `2026-09-0${Math.min(9, n)}T10:00:00Z`,
    updated_at: null,
    claimed_by: null,
    claim_expires_at: null,
    ...opts,
  } as DevItem
}

console.log("— Le vrai doublon est trouvé —")

{
  const a = item("Sous-sections pour sessions multiples Claude Code")
  const b = item("Sous-sections pour sessions multiples Claude Code")
  const p = doublonsExistants([a, b])
  verifier("deux titres identiques sont signalés", p.length === 1, JSON.stringify(p.length))
  verifier(
    "et c'est le PLUS RÉCENT qu'on propose d'archiver",
    p[0]?.recent.id === b.id && p[0]?.original.id === a.id,
    `récent = ${p[0]?.recent.id}`,
  )
}

{
  const livre = item("Retrouver une conversation passée", { archived_at: "2026-09-04T12:00:00Z" })
  const neuf = item("Retrouver une conversation passée")
  const p = doublonsExistants([livre, neuf])
  verifier("un chantier qui répète du DÉJÀ LIVRÉ est signalé", p.length === 1)
  verifier(
    "il est marqué comme tel, et c'est l'ouvert qu'on archive",
    p[0]?.dejaLivre === true && p[0]?.recent.id === neuf.id,
    JSON.stringify(p[0]),
  )
}

console.log("\n— Et surtout : il se tait le reste du temps —")

// Les vraies paires de son cockpit qui se ressemblent SANS être des doublons.
// Chacune était signalée par la mesure de la frappe, et aucune ne doit l'être
// ici.
const FAUX_AMIS: [string, string][] = [
  ["Réveil vocal « Jarvis » en arrière-plan (écran éteint)", "Réveil vocal « Jarvis » économe en batterie"],
  ["Recherche web + lecture de liens et de PDF", "Voir ce que donne la recherche web de Gemini, avant de choisir"],
  [
    "Notifications push Jarvis, qui apprennent ce qui intéresse vraiment Raphaël",
    "Notifications quand l'app est fermée : le vrai push (Firebase)",
  ],
  [
    "Savoir combien il reste de crédit, et à combien de temps de discussion ça équivaut",
    "Combien de temps Jarvis garde le mot-à-mot de vos conversations",
  ],
  [
    "Permettre à Jarvis d'agir directement sur le téléphone comme s'il était l'utilisateur",
    "Assistant par défaut du téléphone + actions dans les apps avec validation vocale",
  ],
]
for (const [a, b] of FAUX_AMIS) {
  const p = doublonsExistants([item(a), item(b)])
  verifier(
    `« ${a.slice(0, 34)}… » n'est pas « ${b.slice(0, 34)}… »`,
    p.length === 0,
    `signalé à tort, score ${p[0]?.score.toFixed(2)}`,
  )
}

verifier(
  "deux chantiers déjà archivés ne sont pas signalés",
  doublonsExistants([
    item("Sous-sections pour sessions multiples", { archived_at: "2026-09-01T10:00:00Z" }),
    item("Sous-sections pour sessions multiples", { archived_at: "2026-09-02T10:00:00Z" }),
  ]).length === 0,
  "c'est du passé : le signaler noierait ce qui compte",
)

verifier(
  "un titre d'un seul mot utile ne déclenche rien",
  doublonsExistants([item("Micro"), item("Micro")]).length === 0,
  "deux mots communs sur deux suffiraient à crier au doublon",
)

verifier(
  "aucun chantier, aucune paire",
  doublonsExistants([]).length === 0,
)

{
  // Vingt paires identiques : la carte ne doit pas devenir une deuxième liste.
  const beaucoup = Array.from({ length: 20 }, (_, i) => [
    item(`Chantier jumeau numéro ${i} sur le micro`),
    item(`Chantier jumeau numéro ${i} sur le micro`),
  ]).flat()
  verifier(
    "le nombre de paires affichées est plafonné",
    doublonsExistants(beaucoup).length <= 5,
    `${doublonsExistants(beaucoup).length} paires`,
  )
}

verifier(
  "le seuil retenu est celui qui a été mesuré",
  SEUIL_DOUBLON === 0.6,
  "le baisser sans refaire la mesure ramène les faux amis ci-dessus",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
