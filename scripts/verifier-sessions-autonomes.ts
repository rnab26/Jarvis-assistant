/**
 * Vérifie qu'une session autonome se retire quand il le faut.
 *
 *   node --experimental-strip-types scripts/verifier-sessions-autonomes.ts
 *
 * Ce qui est en jeu n'est pas symétrique. Une session qui se retire à tort ne
 * coûte rien : Raphaël en ouvre une lui-même. Une session qui démarre à tort
 * consomme son crédit pendant qu'il dort, ou pire, code un chantier qu'il
 * voulait d'abord trancher avec nous. Presque tous les cas ci-dessous sont
 * donc des cas où il faut S'ARRÊTER.
 */
import {
  autonomieActive,
  chantiersPrenables,
  deciderPasse,
  PASSE_PERIMEE_MINUTES,
  sujetReserve,
  type EtatAutonomie,
} from "../src/lib/passeAutonome.ts"
import type { DevItem } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = new Date("2026-09-06T08:00:00Z")
const dans = (minutes: number) =>
  new Date(MAINTENANT.getTime() + minutes * 60000).toISOString()

let n = 0
function item(title: string, opts: Partial<DevItem> = {}): DevItem {
  n++
  return {
    id: `00000000-0000-0000-0000-00000000000${n % 10}`,
    user_id: "u",
    title,
    notes: "[LIBRE] Spécifié de bout en bout.",
    status: "todo",
    priority: "normal",
    theme: "Le cockpit",
    archived_at: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...opts,
  }
}

function etat(opts: Partial<EtatAutonomie> = {}): EtatAutonomie {
  return { reglage: null, reservations: [], passes_ouvertes: [], chantiers: [], ...opts }
}

console.log("— L'interrupteur passe avant tout le reste —")

verifier(
  "jamais touché veut dire actif : c'est sa réponse, pas une absence de réponse",
  autonomieActive(null) && autonomieActive(undefined) && autonomieActive(""),
  "lui redemander de dire oui est exactement ce qu'il reproche",
)
verifier('« false » éteint', !autonomieActive("false"))
verifier('« true » allume', autonomieActive("true"))
verifier('« "true" » (JSON) allume aussi', autonomieActive('"true"'))

{
  const d = deciderPasse(etat({ reglage: "false", chantiers: [item("Un chantier libre")] }), MAINTENANT)
  verifier(
    "éteint : on ne démarre pas, même avec du travail disponible",
    d.verdict === "eteint" && d.chantier === null,
    JSON.stringify(d),
  )
  verifier(
    "et la raison dit OÙ l'éteindre et le rallumer",
    d.raison.includes("Paramètres") && d.raison.includes("cockpit"),
    d.raison,
  )
}

console.log("\n— « Éviter de lancer une session si une autre est déjà en cours » —")

{
  const d = deciderPasse(
    etat({
      reservations: [{ branche: "claude/voix-0509", titre: "Le micro n'entend rien", expire: dans(60) }],
      chantiers: [item("Un chantier libre")],
    }),
    MAINTENANT,
  )
  verifier(
    "une réservation vivante arrête la passe",
    d.verdict === "occupe" && d.chantier === null,
    JSON.stringify(d),
  )
  verifier("et elle nomme la session qui travaille", d.raison.includes("claude/voix-0509"), d.raison)
}

{
  const d = deciderPasse(
    etat({
      reservations: [{ branche: "claude/vieille", titre: "Fini depuis", expire: dans(-5) }],
      chantiers: [item("Un chantier libre")],
    }),
    MAINTENANT,
  )
  verifier(
    "une réservation EXPIRÉE n'arrête rien",
    d.verdict === "travaille",
    "sinon une session interrompue bloquerait l'autonomie pour toujours",
  )
}

{
  const d = deciderPasse(
    etat({
      passes_ouvertes: [{ branche: "claude/auto-1", demarre_at: dans(-20) }],
      chantiers: [item("Un chantier libre")],
    }),
    MAINTENANT,
  )
  verifier(
    "une passe autonome encore en cours arrête la suivante",
    d.verdict === "occupe",
    "deux passes autonomes en parallèle doublent la dépense pour rien",
  )
}

{
  const d = deciderPasse(
    etat({
      passes_ouvertes: [{ branche: "claude/auto-morte", demarre_at: dans(-PASSE_PERIMEE_MINUTES - 1) }],
      chantiers: [item("Un chantier libre")],
    }),
    MAINTENANT,
  )
  verifier(
    "une passe morte en route ne bloque pas éternellement",
    d.verdict === "travaille",
    "une session tuée par son conteneur arrêterait tout, en silence",
  )
}

console.log("\n— Ce qu'elle a le droit de prendre —")

{
  const d = deciderPasse(etat({ chantiers: [item("Ranger le cockpit")] }), MAINTENANT)
  verifier("un [LIBRE] disponible est pris", d.verdict === "travaille" && d.chantier?.title === "Ranger le cockpit", JSON.stringify(d))
}

const REFUSES: [string, Partial<DevItem>][] = [
  ["un [À CADRER] n'est jamais pris", { notes: "[À CADRER AVEC RAPHAËL AVANT DE COMMENCER] …" }],
  ["un chantier sans marqueur n'est pas pris", { notes: "Il faudrait revoir la carte." }],
  ["un chantier sans notes n'est pas pris", { notes: null }],
  ["un [BLOQUÉ PAR] n'est pas pris", { notes: "[BLOQUÉ PAR : 12ab] …" }],
  ["un [REPORTÉ] n'est pas pris", { notes: "[REPORTÉ] plus tard." }],
  ["un chantier déjà réservé n'est pas pris", { claimed_by: "claude/x", claim_expires_at: dans(30) }],
  ["un chantier archivé n'est pas pris", { archived_at: "2026-09-05T10:00:00Z" }],
  ["un chantier déjà fait n'est pas pris", { status: "done" }],
]
for (const [nom, opts] of REFUSES) {
  const d = deciderPasse(etat({ chantiers: [item("Un chantier", opts)] }), MAINTENANT)
  verifier(nom, d.verdict === "rien_a_prendre", JSON.stringify(d))
}

verifier(
  "un [LIBRE] cité au MILIEU d'une note ne rend pas le chantier prenable",
  chantiersPrenables(
    etat({
      chantiers: [
        item("Un chantier", {
          notes: "[À CADRER AVEC RAPHAËL] Voir aussi le chantier voisin, marqué [LIBRE].",
        }),
      ],
    }),
    MAINTENANT,
  ).length === 0,
  "une session partirait coder un sujet qu'il voulait trancher d'abord",
)

console.log("\n— Les sujets qu'il a mis à part, même marqués [LIBRE] —")

const RESERVES: [string, string][] = [
  ["Cloner la voix de Raphaël avec ElevenLabs", "clonage vocal"],
  ["Permettre à Jarvis de prendre le contrôle du téléphone", "contrôle du téléphone"],
  ["Envoyer un message WhatsApp à l'heure dite", "envoi de messages"],
  ["Autorisation par application tierce", "accès aux applications"],
  ["Géocodage payant pour les rappels de lieu", "dépense"],
]
for (const [titre] of RESERVES) {
  const it = item(titre)
  verifier(`« ${titre.slice(0, 40)}… » est écarté`, sujetReserve(it) !== null, "il a demandé à en parler d'abord")
  verifier(
    "   et la passe ne le prend pas",
    deciderPasse(etat({ chantiers: [it] }), MAINTENANT).verdict === "rien_a_prendre",
  )
}

// Le revers : écarter tout ce qui parle de près ou de loin d'une application
// viderait la liste. Ces titres-là sont de vrais chantiers du cockpit.
const AUTORISES = [
  "Ranger les chantiers par section dans le cockpit",
  "Le journal de bord ne s'ouvre plus tout seul",
  "Retrouver une conversation passée dans la mémoire",
  "Le thème sombre suit le réglage du téléphone",
]
for (const titre of AUTORISES) {
  verifier(`« ${titre.slice(0, 40)}… » reste prenable`, sujetReserve(item(titre)) === null, "écarté à tort")
}

console.log("\n— L'ordre, et les bords —")

{
  const d = deciderPasse(
    etat({
      chantiers: [
        item("Un chantier normal", { priority: "normal", created_at: "2026-09-01T08:00:00Z" }),
        item("Un chantier urgent", { priority: "high", created_at: "2026-09-04T08:00:00Z" }),
      ],
    }),
    MAINTENANT,
  )
  verifier(
    "la priorité haute passe devant, même arrivée plus tard",
    d.chantier?.title === "Un chantier urgent",
    `pris : ${d.chantier?.title}`,
  )
}

verifier(
  "aucun chantier du tout : on se retire, on n'invente rien",
  deciderPasse(etat(), MAINTENANT).verdict === "rien_a_prendre",
)

verifier(
  "chaque verdict porte une raison lisible",
  [
    deciderPasse(etat({ reglage: "false" }), MAINTENANT),
    deciderPasse(etat({ reservations: [{ branche: "b", titre: "t", expire: dans(10) }] }), MAINTENANT),
    deciderPasse(etat(), MAINTENANT),
    deciderPasse(etat({ chantiers: [item("Libre")] }), MAINTENANT),
  ].every((d) => d.raison.length > 20),
  "une passe sans raison lisible ne se distingue pas d'une Routine en panne",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
