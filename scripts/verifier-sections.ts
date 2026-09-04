/**
 * Vérifie le rangement du cockpit : le groupement par section, l'ordre, les
 * compteurs, et le filtre.
 *
 *   node --experimental-strip-types scripts/verifier-sections.ts
 *
 * Aucun réseau. CE QUI EST EN JEU : tout ce qui se passe ici décide de ce que
 * Raphaël VOIT. Aucune de ces fautes ne lève d'erreur — un chantier qui
 * disparaît d'un groupe, une section déclarée qui n'apparaît pas tant qu'elle
 * est vide, un compteur qui additionne les archivés — et toutes se
 * remarqueraient des semaines plus tard, quand un chantier oublié refait
 * surface.
 */
import {
  FILTRE_VIDE,
  SANS_SECTION,
  filtreActif,
  filtrerChantiers,
  grouperParSection,
  themesSansSection,
} from "../src/lib/sections.ts"
import { compterMarqueurs, marqueurDe, notesSansMarqueur } from "../src/lib/marqueurChantier.ts"
import type { DevItem, DevPriority, DevSection, DevStatus } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
function chantier(
  titre: string,
  theme: string | null,
  statut: DevStatus = "todo",
  priorite: DevPriority = "normal",
  archive = false,
  notes: string | null = null,
): DevItem {
  n++
  return {
    id: `c${n}`,
    user_id: "u",
    title: titre,
    notes,
    status: statut,
    priority: priorite,
    theme,
    archived_at: archive ? "2026-09-01T10:00:00Z" : null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: `2026-09-0${(n % 9) + 1}T10:00:00Z`,
    updated_at: "2026-09-01T10:00:00Z",
  }
}

function section(nom: string, position: number, description: string | null = null): DevSection {
  return {
    id: `s-${nom}`,
    user_id: "u",
    nom,
    description,
    position,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  }
}

const SECTIONS = [
  section("Voix et écoute", 1),
  section("Le téléphone", 2),
  section("Entraînement", 3, "Ce qu'on lui apprend à faire"),
]

const CHANTIERS = [
  chantier("Le micro se coupe en pleine phrase", "Voix et écoute", "in_progress", "high"),
  chantier("Réveil vocal en arrière-plan", "Voix et écoute"),
  chantier("Voix naturelle ElevenLabs", "Voix et écoute", "done"),
  chantier("Widget d'écran d'accueil", "Le téléphone", "todo", "low"),
  // Écrit en SQL par une session, sans passer par l'app : pas de section
  // déclarée pour ce thème-là.
  chantier("Facture Gmail illisible", "Messagerie et agenda"),
  chantier("Un truc dicté trop vite", null),
  chantier("Ancien chantier livré", "Voix et écoute", "done", "normal", true),
]

const groupes = grouperParSection(
  CHANTIERS.filter((c) => !c.archived_at),
  SECTIONS,
)
const nomsAffichés = groupes.map((g) => g.nom)

verifier(
  "les sections déclarées viennent dans l'ordre choisi",
  nomsAffichés.slice(0, 3).join(" / ") === "Voix et écoute / Le téléphone / Entraînement",
  `obtenu : ${nomsAffichés.join(" / ")}`,
)

verifier(
  "une section déclarée mais VIDE reste affichée",
  groupes.some((g) => g.nom === "Entraînement" && g.chantiers.length === 0),
  "une section créée à l'avance disparaîtrait tant qu'on n'y a rien mis",
)

verifier(
  "un thème sans section déclarée apparaît quand même",
  nomsAffichés.includes("Messagerie et agenda"),
  `ses chantiers seraient invisibles — obtenu : ${nomsAffichés.join(" / ")}`,
)

verifier(
  "« À classer » ferme la marche",
  nomsAffichés[nomsAffichés.length - 1] === SANS_SECTION,
  `obtenu : ${nomsAffichés.join(" / ")}`,
)

const voix = groupes.find((g) => g.nom === "Voix et écoute")!
verifier(
  "« terminé » non archivé ne compte plus dans les restants",
  voix.total === 3 && voix.restants === 2,
  `total ${voix.total}, restants ${voix.restants}`,
)
verifier("les en cours sont comptés à part", voix.enCours === 1, `enCours = ${voix.enCours}`)
verifier(
  "un chantier archivé ne compte dans aucune section active",
  voix.chantiers.every((c) => !c.archived_at),
  "un archivé s'est glissé dans les chantiers actifs",
)
verifier(
  "dans une section, ce qui bouge est en haut",
  voix.chantiers[0].title === "Le micro se coupe en pleine phrase",
  `premier : ${voix.chantiers[0].title}`,
)

verifier(
  "aucun chantier n'est perdu en route",
  groupes.reduce((n, g) => n + g.chantiers.length, 0) ===
    CHANTIERS.filter((c) => !c.archived_at).length,
  "un chantier a disparu du groupement",
)

// Un thème mal orthographié par une session ne doit pas créer un second
// groupe à côté de sa section.
const avecJumeau = grouperParSection(
  [...CHANTIERS.filter((c) => !c.archived_at), chantier("Écrit sans accent", "Voix et ecoute")],
  SECTIONS,
)
verifier(
  "« Voix et ecoute » se range dans « Voix et écoute »",
  avecJumeau.filter((g) => g.nom.toLowerCase().startsWith("voix")).length === 1 &&
    avecJumeau.find((g) => g.nom === "Voix et écoute")!.chantiers.length === 4,
  `groupes : ${avecJumeau.map((g) => g.nom).join(" / ")}`,
)

verifier(
  "les thèmes sans section sont repérés pour être rangés",
  themesSansSection(CHANTIERS, SECTIONS).join(",") === "Messagerie et agenda",
  `obtenu : ${themesSansSection(CHANTIERS, SECTIONS).join(",")}`,
)

// ── Le filtre ──
const actifs = CHANTIERS.filter((c) => !c.archived_at)

verifier("aucun filtre laisse tout passer", filtrerChantiers(actifs, FILTRE_VIDE).length === 6)
verifier("et n'est pas signalé comme actif", !filtreActif(FILTRE_VIDE))

verifier(
  "filtrer sur une section ne garde qu'elle",
  filtrerChantiers(actifs, { ...FILTRE_VIDE, section: "Voix et écoute" }).length === 3,
)
verifier(
  "filtrer sur « À classer » retrouve les non classés",
  filtrerChantiers(actifs, { ...FILTRE_VIDE, section: SANS_SECTION }).length === 1,
)
verifier(
  "filtrer sur le statut",
  filtrerChantiers(actifs, { ...FILTRE_VIDE, statut: "in_progress" }).length === 1,
)
verifier(
  "chercher sans accents retrouve quand même",
  filtrerChantiers(actifs, { ...FILTRE_VIDE, recherche: "reveil" })[0]?.title ===
    "Réveil vocal en arrière-plan",
  "un mot tapé sans accent sur un clavier de téléphone ne trouverait rien",
)
verifier(
  "deux mots réduisent au lieu d'élargir",
  filtrerChantiers(actifs, { ...FILTRE_VIDE, recherche: "micro phrase" }).length === 1 &&
    filtrerChantiers(actifs, { ...FILTRE_VIDE, recherche: "micro widget" }).length === 0,
)
verifier(
  "la recherche porte aussi sur le nom de section",
  filtrerChantiers(actifs, { ...FILTRE_VIDE, recherche: "telephone" }).length === 1,
)
verifier(
  "section + statut se combinent",
  filtrerChantiers(actifs, { ...FILTRE_VIDE, section: "Voix et écoute", statut: "done" }).length ===
    1,
)
verifier("un filtre posé est signalé", filtreActif({ ...FILTRE_VIDE, recherche: "micro" }))

// ── Les marqueurs en tête des notes ──
// Ils commandent le travail des sessions (CLAUDE.md), et l'app ne les montrait
// pas : « qu'est-ce qui attend une décision de moi ? » demandait de déplier
// une cinquantaine de chantiers.
const AVEC_MARQUEURS: [string, string | null, string | null][] = [
  ["À cadrer", "[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]\nReporté à plus tard.", "a_cadrer"],
  ["À cadrer sans accents", "[A CADRER AVEC RAPHAEL AVANT DE COMMENCER]", "a_cadrer"],
  ["Libre", "[LIBRE] Répondu par Raphaël le 3 sept.", "libre"],
  ["Libre en partie", "[LIBRE pour la phase 1] DEMANDE DE RAPHAEL", "libre"],
  ["Bloqué", '[BLOQUÉ PAR : "Mémoire longue durée"] Oui.', "bloque"],
  ["Doublon", "[DOUBLON — traité par le chantier X]", "doublon"],
  ["Sans marqueur", "Une note ordinaire, sans crochets.", null],
  ["Note vide", null, null],
  [
    "Crochet cité plus bas",
    "Une longue note qui parle du sujet, du contexte, de ce qui a été vérifié, de ce qui reste en suspens, et qui cite bien plus loin un autre chantier écrit [LIBRE] au passage — sans que celui-ci soit libre pour autant, puisque ce n'est pas son en-tête.",
    null,
  ],
]
for (const [titre, notes, attendu] of AVEC_MARQUEURS) {
  const item = chantier(titre, null, "todo", "normal", false, notes)
  const obtenu = marqueurDe(item)
  verifier(
    `« ${titre} » → ${attendu ?? "aucun marqueur"}`,
    obtenu === attendu,
    `obtenu : ${obtenu}`,
  )
}

const comptes = compterMarqueurs(
  AVEC_MARQUEURS.map(([t, n]) => chantier(t, null, "todo", "normal", false, n)),
)
verifier(
  "« à cadrer » passe devant : c'est ce qui attend une décision de Raphaël",
  comptes[0]?.marqueur === "a_cadrer" && comptes[0]?.nb === 2,
  JSON.stringify(comptes),
)

const aCadrer = filtrerChantiers(
  AVEC_MARQUEURS.map(([t, n]) => chantier(t, null, "todo", "normal", false, n)),
  { ...FILTRE_VIDE, marqueur: "a_cadrer" },
)
verifier(
  "filtrer sur « à cadrer » ne garde que ceux-là",
  aCadrer.length === 2,
  `${aCadrer.length} chantiers : ${aCadrer.map((c) => c.title).join(", ")}`,
)
verifier(
  "et ce filtre est bien signalé comme actif",
  filtreActif({ ...FILTRE_VIDE, marqueur: "a_cadrer" }),
)

// L'aperçu d'une note ne doit pas répéter en toutes lettres ce que
// l'étiquette dit déjà : vu sur une capture d'écran, la moitié des chantiers
// gaspillaient leurs deux lignes visibles à réafficher « [À CADRER…] ».
const APERCUS: [string | null, string | null][] = [
  ["[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]\nIl faut trancher le coût.", "Il faut trancher le coût."],
  ["[LIBRE] Répondu par Raphaël le 3 sept.", "Répondu par Raphaël le 3 sept."],
  ["[BLOQUÉ PAR : \"Mémoire longue durée\"] Oui.", "Oui."],
  // Un crochet qui n'est PAS un marqueur reste : il dit quelque chose.
  ["[Questionnaire] Oui aux deux lignes.", "[Questionnaire] Oui aux deux lignes."],
  ["[CADRE — Raphael a tranché] Ne rouvre pas.", "[CADRE — Raphael a tranché] Ne rouvre pas."],
  ["Une note ordinaire.", "Une note ordinaire."],
  ["[LIBRE]", null],
  [null, null],
]
for (const [notes, attendu] of APERCUS) {
  const obtenu = notesSansMarqueur(notes)
  verifier(
    `aperçu de ${JSON.stringify((notes ?? "(vide)").slice(0, 34))}`,
    obtenu === attendu,
    `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
