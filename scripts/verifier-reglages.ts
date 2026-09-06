/**
 * Vérifie que chaque préférence de Raphaël est déclarée ET réglable.
 *
 *   node --experimental-strip-types scripts/verifier-reglages.ts
 *
 * Le chantier permanent 776235be tient en une règle : « toute fonctionnalité
 * qui introduit une préférence livre son réglage avec elle ». Elle était
 * écrite dans CLAUDE.md, dans le chantier, et rappelée à chaque session —
 * et elle a quand même été oubliée : au 4 sept. 2026, `jarvis_app_ia`
 * (l'application à qui Jarvis pose une question quand on le lui demande)
 * était stockée sur l'appareil, fixée une seule fois à l'oral, absente de la
 * liste recopiée en base et absente de Paramètres. Invisible, figée, et
 * perdue à la prochaine réinstallation.
 *
 * Une règle qu'aucun contrôle ne vérifie finit toujours par être oubliée.
 * Celui-ci lit le code plutôt que la bonne volonté :
 *
 * 1. Toute clé de stockage local « jarvis_… » utilisée dans src/ est soit
 *    déclarée dans REGLAGES (donc recopiée en base), soit inscrite dans
 *    STOCKAGE_LOCAL_ASSUME avec la raison de rester locale.
 * 2. Chaque réglage déclaré dit OÙ il se règle, et le fichier annoncé existe.
 * 3. Aucune clé déclarée deux fois.
 * 4. Le fichier annoncé est RÉELLEMENT atteignable depuis Paramètres — c'est
 *    la moitié de la règle que rien ne vérifiait. Un contrôle qui existe dans
 *    un fichier que l'écran de réglages ne monte jamais est aussi invisible
 *    qu'un contrôle absent : la préférence reste figée sur sa valeur de
 *    départ, et le contrôle qui la déclarait disait vrai sur toute la ligne.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { REGLAGES, STOCKAGE_LOCAL_ASSUME } from "../src/lib/reglages.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

function fichiersSource(racine: string): string[] {
  const trouves: string[] = []
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree)
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersSource(chemin))
    else if (/\.tsx?$/.test(entree)) trouves.push(chemin)
  }
  return trouves
}

const declarees = new Set(REGLAGES.map((r) => r.cle))

verifier(
  "aucune clé déclarée deux fois",
  declarees.size === REGLAGES.length,
  `${REGLAGES.length} déclarations pour ${declarees.size} clés distinctes`,
)

for (const reglage of REGLAGES) {
  verifier(
    `${reglage.cle} dit où il se règle`,
    reglage.ou.trim().length > 0,
    "une préférence sans contrôle est invisible et figée sur sa valeur de départ",
  )
  let existe = true
  try {
    statSync(reglage.fichier)
  } catch {
    existe = false
  }
  verifier(
    `${reglage.cle} : ${reglage.fichier} existe`,
    existe,
    "le fichier annoncé comme portant le contrôle est introuvable",
  )
}

// Les clés d'un fichier qui touche localStorage sont des préférences de
// l'appareil. Ailleurs (canaux de notification, stockage natif du widget),
// « jarvis_… » désigne autre chose et ne concerne pas la synchro.
/**
 * Tout ce que Paramètres monte, directement ou non.
 *
 * On suit les imports « @/… » depuis `SettingsPage.tsx`. Un fichier hors de
 * ce graphe n'est jamais affiché dans les réglages, quoi qu'en dise la
 * déclaration — c'est exactement le cas que le chantier permanent 776235be
 * signalait pour `jarvis_mode_live`, réglable seulement par une case sous le
 * cœur pendant plusieurs jours.
 */
function atteignableDepuisParametres(): Set<string> {
  const vus = new Set<string>()
  const aVoir = ["src/pages/SettingsPage.tsx"]

  while (aVoir.length > 0) {
    const fichier = aVoir.pop()!
    if (vus.has(fichier)) continue
    let contenu: string
    try {
      contenu = readFileSync(fichier, "utf8")
    } catch {
      continue
    }
    vus.add(fichier)

    for (const trouve of contenu.matchAll(/from "@\/([^"]+)"/g)) {
      const base = join("src", trouve[1])
      // L'import ne porte pas l'extension : on essaie celles du projet.
      for (const candidat of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
        try {
          statSync(candidat)
          aVoir.push(candidat)
          break
        } catch {
          // extension suivante
        }
      }
    }
  }
  return vus
}

const DEPUIS_PARAMETRES = atteignableDepuisParametres()

for (const reglage of REGLAGES) {
  verifier(
    `${reglage.cle} : son contrôle est atteignable depuis Paramètres`,
    DEPUIS_PARAMETRES.has(reglage.fichier),
    `${reglage.fichier} n'est monté par aucun écran de Paramètres : la préférence est invisible et figée sur sa valeur de départ, exactement comme si le contrôle n'existait pas`,
  )
}

const CLE = /"(jarvis_[a-z0-9_]*)"/g
const orphelines = new Map<string, string>()

for (const fichier of fichiersSource("src")) {
  const contenu = readFileSync(fichier, "utf8")
  if (!contenu.includes("localStorage")) continue
  for (const trouve of contenu.matchAll(CLE)) {
    const cle = trouve[1]
    if (declarees.has(cle)) continue
    if (STOCKAGE_LOCAL_ASSUME.some((l) => cle.startsWith(l.prefixe))) continue
    if (!orphelines.has(cle)) orphelines.set(cle, fichier)
  }
}

verifier(
  "aucune préférence stockée sur l'appareil sans être déclarée",
  orphelines.size === 0,
  [...orphelines]
    .map(
      ([cle, fichier]) =>
        `${cle} (${fichier}) — ajoute-la à REGLAGES avec son contrôle dans Paramètres, ou à STOCKAGE_LOCAL_ASSUME en disant pourquoi elle reste locale`,
    )
    .join("\n      "),
)

for (const local of STOCKAGE_LOCAL_ASSUME) {
  verifier(
    `${local.prefixe} dit pourquoi il reste local`,
    local.pourquoi.trim().length > 20,
    "sans raison écrite, la prochaine session ne saura pas si c'est un choix ou un oubli",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
