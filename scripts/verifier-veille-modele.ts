/**
 * Vérifie qu'un modèle ne peut pas devenir le cerveau de Jarvis à la légère.
 *
 *   node --experimental-strip-types scripts/verifier-veille-modele.ts
 *
 * Aucun réseau. Ce mécanisme décide TOUT SEUL, la nuit, de changer le modèle
 * de Jarvis. S'il se trompe, Raphaël se réveille sans assistant et sans savoir
 * pourquoi — c'est exactement ce qui lui est arrivé les 3 et 4 sept. 2026.
 *
 * La moitié de ces contrôles vérifie donc qu'on NE promeut PAS : un mécanisme
 * qui adopte trop facilement est bien pire qu'un mécanisme qui n'adopte jamais,
 * parce que le second se remarque et se corrige, tandis que le premier casse
 * une nuit au hasard.
 */
import {
  APPELS_AVANT_DE_JUGER,
  type Essai,
  type EtatVeille,
  INTERVALLE_VEILLE_MS,
  JOURS_DE_PREUVE,
  PLAFOND_JOUR_MINIMUM,
  REPOS_ENTRE_PROMOTIONS_MS,
  type SantePromotion,
  decider,
  doitRevenirEnArriere,
  doitVeiller,
  essaiConcluant,
  meilleurCandidat,
  nouvelleChaine,
} from "../supabase/functions/_shared/veilleModele.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = new Date("2026-09-20T02:00:00Z")
const ilYA = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString()
const JOURS = (n: number) => n * 24 * 60 * 60 * 1000

const essai = (p: Partial<Essai> = {}): Essai => ({
  modele: "un-candidat",
  jour: "2026-09-18",
  repond: true,
  appelle_outil: true,
  controles_reussis: 5,
  controles_total: 5,
  ms_median: 800,
  plafond_jour: null,
  plafond_minute: 15,
  ...p,
})

const sante = (p: Partial<SantePromotion> = {}): SantePromotion => ({
  modele: "le-promu",
  promu_at: ilYA(JOURS(1)),
  promu_par: "veille",
  a_un_precedent: true,
  appels: 50,
  echecs: 1,
  refus_jour: 0,
  ...p,
})

const etat = (p: Partial<EtatVeille> = {}): EtatVeille => ({
  reglage: null,
  derniere_veille: ilYA(JOURS(2)),
  veille_en_cours: false,
  en_service: [
    {
      role: "commande",
      fournisseur: "gemini",
      modele: "en-service",
      secours: ["secours-a", "secours-b"],
      promu_at: ilYA(JOURS(30)),
      promu_par: "veille",
    },
    {
      role: "memoire",
      fournisseur: "gemini",
      modele: "memoire-principal",
      secours: ["memoire-secours"],
      promu_at: ilYA(JOURS(30)),
      promu_par: "main",
    },
  ],
  sante_commande: null,
  essais_recents: [],
  ...p,
})

// ── Quand la veille tourne, et quand elle se tait ──────────────────────────
{
  verifier("elle passe quand l'heure est venue", doitVeiller(etat(), MAINTENANT) === "veille")
  verifier(
    "elle ne repasse pas dans la même journée",
    doitVeiller(etat({ derniere_veille: ilYA(INTERVALLE_VEILLE_MS - 1000) }), MAINTENANT) === "trop_tot",
  )
  verifier(
    "elle passe la toute première fois, sans repère",
    doitVeiller(etat({ derniere_veille: null }), MAINTENANT) === "veille",
  )
  verifier(
    "deux passes ne se marchent pas dessus",
    doitVeiller(etat({ veille_en_cours: true }), MAINTENANT) === "occupee",
  )
  verifier(
    "« false » la gèle : c'est son interrupteur, il doit vraiment éteindre",
    doitVeiller(etat({ reglage: "false" }), MAINTENANT) === "gelee",
  )
  verifier(
    "un réglage JAMAIS POSÉ ne se lit pas comme un refus",
    doitVeiller(etat({ reglage: null }), MAINTENANT) === "veille",
    "il a demandé que ça se fasse « sans que je puisse le demander à chaque fois manuellement »",
  )
  verifier(
    "et « true » la laisse passer",
    doitVeiller(etat({ reglage: "true" }), MAINTENANT) === "veille",
  )
}

// ── Le retour arrière : ce qui le déclenche ────────────────────────────────
{
  verifier(
    "un taux d'échec intolérable fait revenir en arrière",
    doitRevenirEnArriere(sante({ appels: 100, echecs: 40 })).quoi === "retour_arriere",
  )
  verifier(
    "un seul refus JOURNALIER suffit : ça ne se lève pas avant demain",
    doitRevenirEnArriere(sante({ appels: 3, echecs: 3, refus_jour: 1 })).quoi === "retour_arriere",
    "c'est exactement ce qui l'a laissé sans Jarvis le 3 sept. à 21h28",
  )
  verifier(
    "et la raison NOMME le modèle, sinon elle n'apprend rien",
    doitRevenirEnArriere(sante({ appels: 100, echecs: 40 })).raison.includes("le-promu"),
  )
}

// ── Le retour arrière : ce qui NE doit PAS le déclencher ───────────────────
{
  const zero = doitRevenirEnArriere(sante({ appels: 0, echecs: 0 }))
  verifier("zéro appel ne fait pas revenir en arrière", zero.quoi === "rien")
  verifier(
    "et on dit qu'on ne SAIT rien, pas que tout va bien",
    zero.raison.includes("on ne sait rien"),
    `${zero.raison} — c'est le cas tant que voice-command n'écrit pas dans appels_modele`,
  )
  verifier(
    "trop peu d'appels : on ne juge pas encore",
    doitRevenirEnArriere(sante({ appels: APPELS_AVANT_DE_JUGER - 1, echecs: 5 })).quoi === "rien",
  )
  verifier(
    "un modèle sain reste en place",
    doitRevenirEnArriere(sante({ appels: 200, echecs: 2 })).quoi === "rien",
  )
  verifier(
    "on ne défait JAMAIS un choix fait à la main",
    doitRevenirEnArriere(sante({ promu_par: "main", appels: 100, echecs: 90 })).quoi === "rien",
    "prendre le contre-pied d'une décision humaine est la faute que ce projet évite partout",
  )
  verifier(
    "sans précédent enregistré, il n'y a rien à remettre",
    doitRevenirEnArriere(sante({ a_un_precedent: false, appels: 100, echecs: 90 })).quoi === "rien",
  )
  verifier("et sans promotion du tout, rien non plus", doitRevenirEnArriere(null).quoi === "rien")
}

// ── Ce qui fait un essai concluant ─────────────────────────────────────────
{
  verifier("un essai tout vert est concluant", essaiConcluant(essai()))
  verifier("un modèle qui ne répond pas ne l'est pas", !essaiConcluant(essai({ repond: false })))
  verifier(
    "un modèle qui répond sans APPELER L'OUTIL ne l'est pas",
    !essaiConcluant(essai({ appelle_outil: false })),
    "répondre n'est pas obéir",
  )
  verifier(
    "un seul contrôle raté suffit à écarter",
    !essaiConcluant(essai({ controles_reussis: 4, controles_total: 5 })),
  )
  verifier(
    "aucun contrôle passé ne vaut pas réussite",
    !essaiConcluant(essai({ controles_reussis: 0, controles_total: 0 })),
  )
  verifier(
    "un plafond journalier trop bas condamne le modèle",
    !essaiConcluant(essai({ plafond_jour: 20 })),
    "la mémoire est morte en silence à cause d'un modèle à 20 requêtes par jour",
  )
  verifier(
    "un plafond journalier confortable passe",
    essaiConcluant(essai({ plafond_jour: PLAFOND_JOUR_MINIMUM })),
  )
}

// ── Le choix du candidat ───────────────────────────────────────────────────
{
  const surDeuxJours = [essai({ jour: "2026-09-18" }), essai({ jour: "2026-09-19" })]
  verifier(
    "deux jours de preuves suffisent",
    meilleurCandidat(surDeuxJours, "en-service", [])?.modele === "un-candidat",
  )
  verifier(
    "UNE SEULE bonne journée ne suffit pas",
    meilleurCandidat([essai()], "en-service", []) === null,
    `les trois modèles morts du 4 sept. répondaient parfaitement la veille (${JOURS_DE_PREUVE} jours exigés)`,
  )
  verifier(
    "trois essais le MÊME jour ne valent pas deux jours",
    meilleurCandidat(
      [essai({ jour: "2026-09-18" }), essai({ jour: "2026-09-18" }), essai({ jour: "2026-09-18" })],
      "en-service",
      [],
    ) === null,
  )
  verifier(
    "un seul essai raté, même ancien, écarte le candidat",
    meilleurCandidat(
      [...surDeuxJours, essai({ jour: "2026-09-17", repond: false })],
      "en-service",
      [],
    ) === null,
  )
  verifier(
    "le modèle déjà en service n'est pas son propre candidat",
    meilleurCandidat(
      surDeuxJours.map((e) => ({ ...e, modele: "en-service" })),
      "en-service",
      [],
    ) === null,
  )
  verifier(
    "UN MODÈLE DE LA MÉMOIRE NE PEUT PAS DEVENIR CELUI DE LA COMMANDE",
    meilleurCandidat(
      surDeuxJours.map((e) => ({ ...e, modele: "memoire-principal" })),
      "en-service",
      ["memoire-principal", "memoire-secours"],
    ) === null,
    "partager un seau est ce qui a rendu Jarvis muet le 3 sept.",
  )
  verifier(
    "à preuves égales, le plus rapide gagne",
    meilleurCandidat(
      [
        essai({ modele: "lent", jour: "2026-09-18", ms_median: 4000 }),
        essai({ modele: "lent", jour: "2026-09-19", ms_median: 4000 }),
        essai({ modele: "rapide", jour: "2026-09-18", ms_median: 700 }),
        essai({ modele: "rapide", jour: "2026-09-19", ms_median: 700 }),
      ],
      "en-service",
      [],
    )?.modele === "rapide",
  )
}

// ── La nouvelle chaîne ─────────────────────────────────────────────────────
{
  verifier(
    "l'ancien principal devient le premier secours",
    JSON.stringify(nouvelleChaine("neuf", "ancien", ["a", "b"])) === JSON.stringify(["ancien", "a", "b"]),
  )
  verifier(
    "le promu ne se retrouve pas aussi dans ses propres secours",
    !nouvelleChaine("a", "ancien", ["a", "b"]).includes("a"),
    "il serait rejoué juste après lui-même, pour rien",
  )
  verifier(
    "la chaîne reste à trois : au-delà, les 25 s de l'app sont dépassées",
    nouvelleChaine("neuf", "ancien", ["a", "b", "c", "d"]).length === 3,
  )
}

// ── La décision d'ensemble ─────────────────────────────────────────────────
{
  const deuxJours = [
    essai({ modele: "candidat", jour: "2026-09-18" }),
    essai({ modele: "candidat", jour: "2026-09-19" }),
  ]

  const d = decider(etat({ essais_recents: deuxJours }), [], MAINTENANT)
  verifier("un candidat prouvé est promu", d.quoi === "promouvoir" && d.modele === "candidat", JSON.stringify(d))
  verifier(
    "et l'ancien passe en premier secours",
    d.secours?.[0] === "en-service",
    JSON.stringify(d.secours),
  )
  verifier(
    "la raison dit sur quels jours il a fait ses preuves",
    d.raison.includes("2026-09-18") && d.raison.includes("2026-09-19"),
    d.raison,
  )

  verifier(
    "LE RETOUR ARRIÈRE PASSE AVANT LA PROMOTION",
    decider(
      etat({ essais_recents: deuxJours, sante_commande: sante({ appels: 100, echecs: 60 }) }),
      [],
      MAINTENANT,
    ).quoi === "retour_arriere",
    "promouvoir par-dessus un modèle qui va mal ferait perdre le seul qui marchait encore",
  )

  const recent = etat({
    essais_recents: deuxJours,
    en_service: [
      { ...etat().en_service![0], promu_at: ilYA(REPOS_ENTRE_PROMOTIONS_MS - JOURS(1)) },
      etat().en_service![1],
    ],
  })
  verifier(
    "on ne change pas de modèle deux fois dans la semaine",
    decider(recent, [], MAINTENANT).quoi === "rien",
    "une série de « preview » ferait sinon changer le cerveau de Jarvis tous les jours",
  )

  verifier(
    "sans rien de mieux, on ne touche à rien",
    decider(etat(), [], MAINTENANT).quoi === "rien",
  )
  verifier(
    "sans modèle en base, on laisse le serveur suivre son code",
    decider(etat({ en_service: null, essais_recents: deuxJours }), [], MAINTENANT).quoi === "rien",
  )
  verifier(
    "les essais du jour comptent autant que ceux d'avant",
    decider(etat(), deuxJours, MAINTENANT).quoi === "promouvoir",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
