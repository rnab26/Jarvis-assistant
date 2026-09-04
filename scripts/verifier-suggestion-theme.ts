/**
 * Vérifie la section suggérée à la saisie d'un chantier.
 *
 *   node --experimental-strip-types scripts/verifier-suggestion-theme.ts
 *
 * Aucun réseau — et c'est le point : la suggestion ne doit RIEN coûter en
 * quota Gemini (chantier 41816bdc). Les données ci-dessous sont les vraies
 * sections du cockpit avec de vrais titres de chantiers, au 4 sept. 2026.
 *
 * Ce qui est vérifié, et pourquoi : une suggestion FAUSSE coûte plus cher
 * qu'une absence de suggestion, parce qu'elle est acceptée sans être relue —
 * le chantier part alors dans la mauvaise section, et n'est plus traité avec
 * ses voisins, ce qui est exactement le contraire de ce que Raphaël demande.
 * D'où les deux moitiés du contrôle : les phrases claires tombent au bon
 * endroit, ET les phrases ambiguës ne suggèrent rien du tout.
 */
import { classerSections, suggererSection } from "../src/lib/suggestionTheme.ts"
import type { DevItem, DevSection } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
const chantier = (titre: string, theme: string): DevItem => ({
  id: `c${++n}`,
  user_id: "u",
  title: titre,
  notes: null,
  status: "todo",
  priority: "normal",
  theme,
  archived_at: null,
  claimed_by: null,
  claimed_at: null,
  claim_expires_at: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
})

const section = (nom: string, position: number, description: string | null = null): DevSection => ({
  id: `s${position}`,
  user_id: "u",
  nom,
  description,
  position,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
})

const SECTIONS = [
  section("Voix et écoute", 1),
  section("Le téléphone", 2),
  section("Mémoire et apprentissage", 3),
  section("Messagerie et agenda", 4),
  section("Recherche et veille", 5),
  section("Coût de fonctionnement", 6),
  section("L'app elle-même", 7),
]

const CHANTIERS = [
  chantier("Réveil vocal Jarvis en arrière-plan, écran éteint", "Voix et écoute"),
  chantier("Le micro se coupe à chaque respiration, tonalité Samsung", "Voix et écoute"),
  chantier("Conversation continue et voix naturelle via ElevenLabs", "Voix et écoute"),
  chantier("Reconnaissance vocale : passer sur le service Google natif", "Voix et écoute"),

  chantier("Widget d'écran d'accueil du téléphone", "Le téléphone"),
  chantier("Assistant par défaut du téléphone, appui long sur le bouton", "Le téléphone"),
  chantier("Rendre Jarvis compatible avec iOS", "Le téléphone"),
  chantier("Bulle flottante à l'écran, atteignable partout", "Le téléphone"),

  chantier("La mémoire accumule des doublons, dédoublonner les souvenirs", "Mémoire et apprentissage"),
  chantier("Mode entraînement : lui montrer une tâche, il la reproduit", "Mémoire et apprentissage"),
  chantier("Préférences et corrections apprises automatiquement", "Mémoire et apprentissage"),

  chantier("WhatsApp : rédiger, corriger et valider un message à la voix", "Messagerie et agenda"),
  chantier("Reçus et factures Gmail : les retrouver et les transmettre", "Messagerie et agenda"),
  chantier("Créer un événement dans l'agenda Google en parlant", "Messagerie et agenda"),

  chantier("Veille automatique sur des sujets choisis en parlant", "Recherche et veille"),
  chantier("Recherche web et lecture de liens et de PDF", "Recherche et veille"),

  chantier("Quota Gemini épuisé : la clé de test séparée", "Coût de fonctionnement"),
  chantier("Arbitrage : garder Flash-Lite rapide ou passer à Flash", "Coût de fonctionnement"),

  chantier("Le cockpit : vue filtre et résumé par section de chantier", "L'app elle-même"),
  chantier("Badge « nouvelle version disponible » dans les paramètres", "L'app elle-même"),
  chantier("Réglages : toute nouvelle fonctionnalité livre son réglage", "L'app elle-même"),
]

/** [ce qu'il tape, la section attendue] */
const DOIT_SUGGERER: [string, string][] = [
  ["Le micro coupe au milieu de ma phrase quand je dicte longtemps", "Voix et écoute"],
  ["Le réveil vocal ne répond pas quand l'écran est éteint", "Voix et écoute"],
  ["Le widget de l'écran d'accueil du téléphone n'affiche plus rien", "Le téléphone"],
  ["Envoyer un message WhatsApp à Melissa en le dictant", "Messagerie et agenda"],
  ["Retrouver une facture reçue par mail et la transmettre", "Messagerie et agenda"],
  ["Le quota Gemini est encore épuisé, il faut surveiller la clé", "Coût de fonctionnement"],
  ["Faire une veille sur les nouveautés d'un sujet en parlant", "Recherche et veille"],
  ["Dans les réglages, pouvoir changer le badge de version", "L'app elle-même"],
]

for (const [texte, attendu] of DOIT_SUGGERER) {
  const s = suggererSection(texte, CHANTIERS, SECTIONS)
  verifier(
    `« ${texte.slice(0, 46)}… » → ${attendu}`,
    s?.nom === attendu,
    `obtenu : ${s ? `${s.nom} (${s.score})` : "aucune suggestion"} — classement : ${classerSections(
      texte,
      CHANTIERS,
      SECTIONS,
    )
      .slice(0, 3)
      .map((c) => `${c.nom} ${c.score}`)
      .join(" / ")}`,
  )
}

// Un mot qui a deux sens ne doit pas décider tout seul. « la veille » (hier)
// et « Recherche et veille » (surveiller un sujet) s'écrivent pareil, et
// aucune méthode qui compte les mots ne les distingue. Ce qu'on exige donc
// ici, ce n'est pas la bonne réponse — c'est de ne pas donner la mauvaise :
// la phrase parle de mémoire, elle ne doit en aucun cas partir dans
// « Recherche et veille ». Se taire est une réponse acceptable.
{
  const texte = "Il oublie les souvenirs qu'on lui a donnés la veille"
  const s = suggererSection(texte, CHANTIERS, SECTIONS)
  verifier(
    "un mot à double sens ne range pas au mauvais endroit",
    s === null || s.nom === "Mémoire et apprentissage",
    `a suggéré « ${s?.nom} » — « la veille » a été pris pour de la veille documentaire`,
  )
}

// L'autre moitié, celle qu'on oublie toujours : se taire quand on ne sait pas.
const NE_DOIT_RIEN_SUGGERER = [
  "Voir ça plus tard",
  "Corriger le truc dont on a parlé hier",
  "aaaa",
  "",
  "   ",
]
for (const texte of NE_DOIT_RIEN_SUGGERER) {
  const s = suggererSection(texte, CHANTIERS, SECTIONS)
  verifier(
    `« ${texte.trim() || "(vide)"} » ne suggère rien`,
    s === null,
    `a suggéré « ${s?.nom} » (${s?.score}) — un rangement inventé, accepté sans être relu`,
  )
}

// Un cockpit neuf : aucune donnée, donc aucune suggestion — et surtout pas
// une erreur.
verifier(
  "sans aucun chantier ni section, pas de suggestion et pas de plantage",
  suggererSection("Le micro se coupe", [], []) === null,
)

// Les sections vides comptent quand même : leur NOM dit ce qu'on y range,
// c'est même la seule information dont on dispose avant le premier chantier.
verifier(
  "une section vide peut être suggérée par son nom",
  suggererSection("Ajouter un entraînement pour les tâches répétitives", [], [
    section("Entraînement", 1),
    section("Facturation", 2),
  ])?.nom === "Entraînement",
)

// La justification affichée doit être vraie : les mots annoncés sont bien
// dans la phrase.
const s = suggererSection("Le micro se coupe en pleine phrase quand je dicte", CHANTIERS, SECTIONS)
verifier(
  "les mots affichés comme raison sont bien ceux de la demande",
  !!s && s.motsCommuns.length > 0 && s.motsCommuns.every((m) => "le micro se coupe en pleine phrase quand je dicte".includes(m)),
  `mots : ${s?.motsCommuns.join(", ")}`,
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
