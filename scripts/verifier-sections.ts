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
): DevItem {
  n++
  return {
    id: `c${n}`,
    user_id: "u",
    title: titre,
    notes: null,
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

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
