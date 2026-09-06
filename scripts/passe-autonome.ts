/**
 * Ce qu'une session autonome fait EN OUVRANT LES YEUX, avant tout le reste.
 *
 *   node --experimental-strip-types scripts/passe-autonome.ts            # regarde
 *   node --experimental-strip-types scripts/passe-autonome.ts --demarrer # regarde et s'inscrit
 *   node --experimental-strip-types scripts/passe-autonome.ts --terminer <id> --resume "…" [--commit <hash>]
 *
 * POURQUOI CE SCRIPT EXISTE. Sa consigne du 6 sept. 2026 : « Éviter de lancer
 * une session si une autre en est deja en cours et est disponible […] ne pas
 * consommer trop de crédit claude code ». Un déclencheur horaire ne sait pas
 * si une session travaille : il ouvre une session, point. C'est donc la
 * session ouverte qui doit se retirer d'elle-même, tout de suite, et sans rien
 * lire d'autre — d'où un seul appel à la base, et une réponse en clair.
 *
 * La DÉCISION n'est pas ici : elle est dans `src/lib/passeAutonome.ts`, pur et
 * vérifié hors ligne. Ici on ne fait que lire la base et écrire la trace.
 */
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { deciderPasse, identiteSession, type EtatAutonomie } from "../src/lib/passeAutonome.ts"

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..")
const SQL = join(RACINE, "scripts", "sql.sh")

function interroger(requete: string): unknown {
  const brut = execFileSync(SQL, [requete], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  const reponse = JSON.parse(brut) as { ok: boolean; rows: Record<string, unknown>[] | null }
  if (!reponse.ok) throw new Error(`SQL en échec : ${brut}`)
  const ligne = reponse.rows?.[0]
  if (!ligne) return null
  return Object.values(ligne)[0]
}

/** L'échappement d'un littéral SQL. Rien ici ne vient de l'extérieur, mais un
 * résumé de passe contient des apostrophes une fois sur deux. */
function litteral(valeur: string | null): string {
  if (valeur === null) return "null"
  return `'${valeur.replace(/'/g, "''")}'`
}

const args = process.argv.slice(2)
function option(nom: string): string | null {
  const i = args.indexOf(nom)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}

// Le clone d'une session ouverte par un déclencheur est en HEAD détaché :
// `--show-current` rend alors une chaîne VIDE, sans erreur. D'où le repli, qui
// vit dans le module pur pour être vérifiable.
const branche = identiteSession(
  (() => {
    try {
      return execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" })
    } catch {
      return ""
    }
  })(),
)

if (args.includes("--terminer")) {
  const id = option("--terminer")
  const resume = option("--resume")
  const commit = option("--commit")
  if (!id || !resume) {
    console.error("Usage : --terminer <id de passe> --resume \"ce qui a été livré\" [--commit <hash>]")
    process.exit(2)
  }
  const ok = interroger(
    `select public.terminer_passe_autonome(${litteral(id)}, ${litteral(resume)}, ${litteral(commit)})`,
  )
  console.log(ok === true ? "Passe refermée." : "Aucune passe ouverte sous cet identifiant.")
  process.exit(ok === true ? 0 : 1)
}

const etat = interroger("select public.etat_pour_passe_autonome()") as EtatAutonomie | null
if (!etat) {
  console.error("La base n'a rien renvoyé : ne pousse rien, préviens Raphaël.")
  process.exit(1)
}

const decision = deciderPasse(etat, new Date())

console.log(`verdict : ${decision.verdict}`)
console.log(`raison  : ${decision.raison}`)
if (decision.chantier) {
  console.log(`chantier: ${decision.chantier.id}`)
  console.log(`titre   : ${decision.chantier.title}`)
  console.log(`section : ${decision.chantier.theme ?? "À classer"}`)
}

if (args.includes("--demarrer")) {
  const id = interroger(
    `select public.demarrer_passe_autonome(${litteral(branche)}, ${litteral(decision.verdict)}, ` +
      `${litteral(decision.raison)}, ${litteral(decision.chantier?.id ?? null)})`,
  )
  console.log(`passe   : ${id}`)
}

// Le code de sortie porte la décision : `travaille` = 0, tout le reste = 3.
// Une session qui se retire n'est pas en échec — d'où un code à part, qu'un
// `&&` de shell ne confondra pas avec une panne.
process.exit(decision.verdict === "travaille" ? 0 : 3)
