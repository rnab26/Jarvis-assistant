/**
 * Vérifie ce que devient la note d'un chantier « à constater » quand Raphaël
 * répond « Ça marche » ou « Ça ne marche pas » depuis le cockpit.
 *
 *   node --experimental-strip-types scripts/verifier-constat-chantier.ts
 *
 * Aucun réseau. Chantier 56b1a074, 23 sept. 2026 : « Impossible de répondre
 * aux chantiers "à constater" dans le cockpit ». Le défaut qui compte ici
 * n'est pas l'écran, c'est le CROCHET D'EN-TÊTE : `marqueurDe` ne lit que lui.
 * Un « Ça ne marche pas » qui ne le changerait pas laisserait le chantier
 * affiché « à constater » — aucune session ne le reprendrait, exactement le
 * défaut du 18 sept. (« toujours les mêmes chantiers »).
 *
 * Les en-têtes ci-dessous sont recopiés de VRAIES notes du cockpit au 23 sept.
 * (678a3bf5, 3f3ad20b, 4dabe586) — pas inventés.
 */
import {
  chantiersAConstater,
  crochetEnTete,
  notesApresConstat,
  paragrapheConstat,
} from "../src/lib/constatChantier.ts"
import { derniereMajChantier } from "../src/lib/derniereMajChantier.ts"
import { marqueurDe } from "../src/lib/marqueurChantier.ts"
import type { DevItem } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const item = (notes: string | null): DevItem =>
  ({
    id: "x",
    user_id: "u",
    title: "t",
    notes,
    status: "todo",
    priority: "normal",
    theme: null,
    archived_at: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: "",
    updated_at: "",
  }) as DevItem

const JOUR = new Date(2026, 8, 23, 10, 45)

// ── Le cas courant : crochet simple, recopié de 678a3bf5 ─────────────────
const SIMPLE = `[LIVRÉ — RESTE À CONSTATER SUR SON TÉLÉPHONE]

Sa dictée du 23 sept. 2026 à 10h11 : « Pouvoir moduler et créer ou réorganiser des sections de chantiers ».

C'EST DÉJÀ LÀ DEPUIS LE 4 SEPT.`

{
  verifier("la note de départ se lit bien « à constater »", marqueurDe(item(SIMPLE)) === "a_constater")

  const ko = notesApresConstat(SIMPLE, "ne_marche_pas", "Je ne trouve pas le bouton Sections", JOUR)
  verifier(
    "« Ça ne marche pas » : le chantier redevient LIBRE, une session le reprend",
    marqueurDe(item(ko)) === "libre",
    `marqueur : ${marqueurDe(item(ko))}\n${ko.slice(0, 200)}`,
  )
  verifier(
    "« Ça ne marche pas » : l'ancien crochet est REMPLACÉ, pas empilé",
    !ko.includes("RESTE À CONSTATER"),
    ko.slice(0, 200),
  )
  verifier(
    "« Ça ne marche pas » : rien de la note d'origine n'est perdu",
    ko.includes("Sa dictée du 23 sept. 2026 à 10h11") && ko.includes("C'EST DÉJÀ LÀ DEPUIS LE 4 SEPT."),
  )
  verifier(
    "« Ça ne marche pas » : ses mots sont la DERNIÈRE mise à jour affichée",
    (derniereMajChantier(ko) ?? "").includes("Je ne trouve pas le bouton Sections"),
    `obtenu : ${derniereMajChantier(ko)}`,
  )

  const ok = notesApresConstat(SIMPLE, "marche", "", JOUR)
  verifier(
    "« Ça marche » : plus aucun marqueur — rien à reprendre pour personne",
    marqueurDe(item(ok)) === null,
    `marqueur : ${marqueurDe(item(ok))}\n${ok.slice(0, 200)}`,
  )
  verifier(
    "« Ça marche » sans commentaire : le paragraphe le dit quand même",
    (derniereMajChantier(ok) ?? "").includes("ÇA MARCHE"),
    `obtenu : ${derniereMajChantier(ok)}`,
  )
}

// ── Le piège payé le 18 sept. : un crochet qui en contient un autre ───────
// Une regex naïve coupait au premier « ] ». Ici, on ne remplace PAS ce qu'on
// ne sait pas lire avec certitude : on pose le nouveau crochet au-dessus.
{
  const IMBRIQUE = `[LIVRÉ — RESTE À CONSTATER (voir [CADRE] plus bas)]

Le corps de la note.`
  const c = crochetEnTete(IMBRIQUE)
  verifier(
    "crochet imbriqué : lu jusqu'au BON « ] », et reconnu comme imbriqué",
    c !== null && c.imbrique && c.contenu.endsWith("(voir [CADRE] plus bas)"),
    JSON.stringify(c),
  )
  const ko = notesApresConstat(IMBRIQUE, "ne_marche_pas", "Ça plante encore", JOUR)
  verifier(
    "crochet imbriqué : le nouveau marqueur l'emporte quand même (libre)",
    marqueurDe(item(ko)) === "libre",
    `marqueur : ${marqueurDe(item(ko))}\n${ko.slice(0, 240)}`,
  )
  verifier(
    "crochet imbriqué : l'ancien crochet est gardé intact, pas tronqué",
    ko.includes("[LIVRÉ — RESTE À CONSTATER (voir [CADRE] plus bas)]"),
  )
}

// ── Crochet non « à constater » en tête (cas 3f3ad20b : une ligne entre) ──
{
  const DEUX_LIGNES = `[LIVRÉ — RESTE À CONSTATER SUR SON TÉLÉPHONE]
(crochet d'origine : LIBRE — PÉRIMÈTRE TRANCHÉ, ET ÉLARGI PAR RAPHAËL LE 6 SEPT. 2026.)

SON RETOUR DU 5 SEPT. AU SOIR`
  const ko = notesApresConstat(DEUX_LIGNES, "ne_marche_pas", "Ça ferme Jarvis au lieu de revenir en arrière dans YouTube", JOUR)
  verifier("3f3ad20b : « Ça ne marche pas » le rend libre", marqueurDe(item(ko)) === "libre")
  verifier(
    "3f3ad20b : la ligne « crochet d'origine » reste, elle dit d'où il vient",
    ko.includes("(crochet d'origine : LIBRE"),
  )
}

// ── Un crochet qui ne porte PAS « à constater » n'est jamais remplacé ─────
// (le bouton n'apparaît que sur « à constater », mais si la note a changé
// entre-temps, on ne détruit pas le crochet de quelqu'un d'autre)
{
  const CADRER = `[À CADRER AVEC RAPHAËL AVANT DE COMMENCER — le coût]

Corps.`
  const ok = notesApresConstat(CADRER, "marche", "", JOUR)
  verifier(
    "un crochet « à cadrer » n'est jamais écrasé : il reste lisible dessous",
    ok.includes("[À CADRER AVEC RAPHAËL AVANT DE COMMENCER — le coût]"),
  )
  verifier(
    "…et le nouveau crochet est séparé par une ligne, pour que marqueurDe ne lise que lui",
    marqueurDe(item(ok)) === null,
    `marqueur : ${marqueurDe(item(ok))}`,
  )
}

// ── Ses mots sur plusieurs paragraphes restent UNE mise à jour ────────────
{
  const long = "Le bouton est là.\n\nMais il ne fait rien quand j'appuie.\n\n\nEt ça plante après."
  const p = paragrapheConstat("ne_marche_pas", long, JOUR)
  verifier("un commentaire en trois paragraphes tient sur un seul", !/\n\s*\n/.test(p), p)
  const ko = notesApresConstat(SIMPLE, "ne_marche_pas", long, JOUR)
  verifier(
    "…et la dernière mise à jour affichée porte les TROIS morceaux",
    (derniereMajChantier(ko) ?? "").includes("Le bouton est là.") &&
      (derniereMajChantier(ko) ?? "").includes("Et ça plante après."),
    `obtenu : ${derniereMajChantier(ko)}`,
  )
}

// ── Notes vides ───────────────────────────────────────────────────────────
{
  const ok = notesApresConstat(null, "marche", "Parfait", JOUR)
  verifier("notes vides : la note créée porte le constat et ses mots", ok.includes("« Parfait »"), ok)
  verifier("un crochet jamais refermé n'est pas lu comme un crochet", crochetEnTete("[LIVRÉ sans fin") === null)
}

// ── Qui lui est proposé, et dans quel ordre ───────────────────────────────
{
  const base = (id: string, notes: string | null, extra: Partial<DevItem> = {}): DevItem =>
    ({ ...item(notes), id, ...extra }) as DevItem
  const liste = chantiersAConstater([
    base("vieux-normal", SIMPLE, { created_at: "2026-09-01", priority: "normal" }),
    base("recent-haute", SIMPLE, { created_at: "2026-09-20", priority: "high" }),
    base("archive", SIMPLE, { archived_at: "2026-09-21" }),
    base("libre", "[LIBRE]\n\nx"),
    base("cite-en-passant", "Une note qui cite [LIVRÉ — RESTE À CONSTATER] au milieu."),
    base("hors-ligne", SIMPLE, { enAttente: true }),
  ])
  verifier(
    "à essayer : seulement les « à constater » ouverts, jamais un archivé, un libre ni une citation",
    liste.map((i) => i.id).join(",") === "recent-haute,vieux-normal",
    liste.map((i) => i.id).join(","),
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
