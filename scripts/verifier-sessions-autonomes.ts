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
  identiteSession,
  NOM_PASSE_SANS_BRANCHE,
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

// CES TITRES SONT COPIÉS DU COCKPIT, MOT POUR MOT, et c'est tout l'intérêt.
// La version d'avant en avait cinq, tous PARAPHRASÉS des expressions
// régulières — « Permettre à Jarvis de prendre le contrôle du téléphone »
// reprenait le motif « prendre le controle ». Elle vérifiait que la regex se
// reconnaît elle-même, et elle est restée verte le 6 sept. 2026 pendant que la
// passe autonome de 10 h 15 proposait le service d'accessibilité qui clique à
// la place de Raphaël. Un contrôle doit viser la vraie donnée.
//
// Le second champ est un extrait des VRAIES notes quand c'est la note, et non
// le titre, qui porte le sujet — c'est le cas de la bulle flottante, dont le
// titre ne dit pas de quel accès spécial il s'agit.
const RESERVES: { titre: string; notes?: string; pourquoi: string }[] = [
  {
    titre:
      "Permettre à Jarvis d'agir directement sur le téléphone comme s'il était l'utilisateur (contrôle des applications et actions sur commande)",
    pourquoi:
      "le service d'accessibilité qui clique à sa place — le motif cherchait « controle du telephone », le chantier dit « contrôle des APPLICATIONS »",
  },
  {
    titre: "Assistant par défaut du téléphone + actions dans les apps avec validation vocale",
    pourquoi: "« actions dans les apps » : agir à sa place dans une autre application",
  },
  {
    titre: "Mode entraînement : lui montrer une tâche, il la reproduit sur demande",
    notes:
      "[LIBRE] SA RÉPONSE : « Oui, garde mes identifiants. » La question lui a été posée avec son coût énoncé — stocker ses identifiants chiffrés en base pour que Jarvis se connecte à sa place.",
    pourquoi:
      "il détient les clés de ses comptes, et AUCUNE catégorie du filtre ne parlait d'identifiants avant le 6 sept.",
  },
  {
    titre: "Bulle Jarvis flottante à l'écran, atteignable partout (sans écoute permanente)",
    notes:
      "[LIBRE] DEMANDE DE RAPHAEL, 3 sept. 2026. Ce chantier ne fait QUE la bulle : une vue affichee par-dessus les autres apps, sur laquelle il appuie pour parler.",
    pourquoi: "afficher par-dessus les autres applications est un accès spécial d'Android",
  },
  {
    titre: "Voix : conversation continue et voix naturelle via le compte ElevenLabs pro existant",
    pourquoi: "clonage vocal via un service tiers payant",
  },
  {
    titre: "WhatsApp : rédiger, corriger et valider à la voix, et programmer des envois",
    pourquoi: "envoi de messages en son nom",
  },
  {
    titre:
      "Donner à Jarvis les autorisations d'accès aux applications du téléphone (mails, agenda, contacts, WhatsApp)",
    pourquoi: "accès aux applications du téléphone",
  },
  {
    titre: "Rappels déclenchés par ta position réelle : la clé de géocodage",
    notes: "[LIBRE] Il faut une clé de géocodage Google, qui est payante au-delà du quota.",
    pourquoi: "une dépense",
  },
]
for (const { titre, notes, pourquoi } of RESERVES) {
  const it = notes ? item(titre, { notes }) : item(titre)
  verifier(
    `« ${titre.slice(0, 44)}… » est écarté`,
    sujetReserve(it) !== null,
    `il a demandé à en parler d'abord : ${pourquoi}`,
  )
  verifier(
    "   et la passe ne le prend pas",
    deciderPasse(etat({ chantiers: [it] }), MAINTENANT).verdict === "rien_a_prendre",
  )
}

// Le sujet doit aussi être trouvé quand il n'est PAS dans l'en-tête de la note :
// une note de chantier s'ouvre par le marqueur, la date et l'historique, et le
// périmètre réel vient après. À 400 caractères de lecture, la bulle flottante
// passait au travers.
verifier(
  "un sujet mis à part est vu même loin dans la note, pas seulement dans l'en-tête",
  sujetReserve(
    item("Un chantier au titre anodin", {
      notes:
        "[LIBRE] " +
        "Rappel de l'historique, des décisions déjà prises et de ce qui a été écarté. ".repeat(8) +
        "Concrètement : Jarvis doit appuyer sur l'écran à sa place.",
    }),
  ) !== null,
  "le périmètre d'une note arrive après son en-tête — le lire trop court revient à ne pas le lire",
)

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

console.log("\n— Le nom sous lequel elle réserve —")

verifier(
  "une branche vide ne donne jamais une réservation sans nom",
  identiteSession("") === NOM_PASSE_SANS_BRANCHE &&
    identiteSession(null) === NOM_PASSE_SANS_BRANCHE &&
    identiteSession("   \n") === NOM_PASSE_SANS_BRANCHE,
  "c'est arrivé le 6 sept. : le clone était en HEAD détaché, la réservation était anonyme et ne pouvait plus se libérer",
)
verifier(
  "« HEAD » non plus : il ne distingue aucune session",
  identiteSession("HEAD") === NOM_PASSE_SANS_BRANCHE,
)
verifier(
  "une vraie branche est gardée telle quelle",
  identiteSession("claude/cockpit-0609\n") === "claude/cockpit-0609",
  "c'est ce que Raphaël lit dans « Prise par … »",
)

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
