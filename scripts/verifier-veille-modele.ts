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
  APPELS_OBSERVES_MINIMUM,
  type Essai,
  type EtatVeille,
  INTERVALLE_VEILLE_MS,
  JOURS_DE_PREUVE,
  PLAFOND_JOUR_MINIMUM,
  PLAFOND_MINUTE_MINIMUM,
  REPOS_ENTRE_PROMOTIONS_MS,
  type SantePromotion,
  decider,
  doitRevenirEnArriere,
  doitVeiller,
  essaiConcluant,
  meilleurCandidat,
  nouvelleChaine,
} from "../supabase/functions/_shared/veilleModele.ts"
import {
  SILENCE_ANORMAL_MS,
  VEILLE_PAR_DEFAUT,
  etatDeLaVeille,
  type MoteurChoisi,
  type PasseVeille,
} from "../src/lib/veilleMoteur.ts"

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
  appels_observes: 500,
  ...p,
})

/** Ce que le serveur utilise en ce moment, tel que l'appelant le passe. */
const courant = (p: Partial<{ modele: string; secours: string[]; promu_at: string }> = {}) => ({
  modele: "en-service",
  secours: ["secours-a", "secours-b"],
  promu_at: ilYA(JOURS(30)),
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
  verifier(
    "un modèle trop étroit à la MINUTE ne peut pas être principal",
    !essaiConcluant(essai({ plafond_minute: 5 })),
    "mesuré le 6 sept. : gemini-3-flash-preview ne passe qu'une requête sur une rafale de vingt",
  )
  verifier(
    "mais une limite/minute confortable passe",
    essaiConcluant(essai({ plafond_minute: PLAFOND_MINUTE_MINIMUM })),
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

  const d = decider(etat({ essais_recents: deuxJours }), [], courant(), MAINTENANT)
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
      courant(),
      MAINTENANT,
    ).quoi === "retour_arriere",
    "promouvoir par-dessus un modèle qui va mal ferait perdre le seul qui marchait encore",
  )

  verifier(
    "on ne change pas de modèle deux fois dans la semaine",
    decider(etat({ essais_recents: deuxJours }), [], courant({ promu_at: ilYA(REPOS_ENTRE_PROMOTIONS_MS - JOURS(1)) }), MAINTENANT).quoi === "rien",
    "une série de « preview » ferait sinon changer le cerveau de Jarvis tous les jours",
  )

  verifier(
    "sans rien de mieux, on ne touche à rien",
    decider(etat(), [], courant(), MAINTENANT).quoi === "rien",
  )
  verifier(
    "LA TOUTE PREMIÈRE promotion est possible, table vide comprise",
    decider(etat({ en_service: null, essais_recents: deuxJours }), [], courant(), MAINTENANT).quoi === "promouvoir",
    "une décision qui exigerait une ligne en base ne pourrait jamais en écrire la première",
  )

  verifier(
    "ON NE PROMEUT PAS TANT QU'ON NE SAIT PAS OBSERVER LE RÉSULTAT",
    decider(
      etat({ essais_recents: deuxJours, appels_observes: APPELS_OBSERVES_MINIMUM - 1 }),
      [],
      courant(),
      MAINTENANT,
    ).quoi === "rien",
    "sans appels observés, le retour arrière automatique est aveugle : promouvoir reviendrait à changer le cerveau de Jarvis en ayant débranché l'alarme",
  )
  verifier(
    "et on dit pourquoi, plutôt que de se taire",
    decider(
      etat({ essais_recents: deuxJours, appels_observes: 0 }),
      [],
      courant(),
      MAINTENANT,
    ).raison.includes("aveugle"),
  )
  verifier(
    "mais un retour arrière, lui, reste possible même sans promotion en cours",
    decider(
      etat({ appels_observes: 0, sante_commande: sante({ appels: 100, echecs: 60 }) }),
      [],
      courant(),
      MAINTENANT,
    ).quoi === "retour_arriere",
    "le refus de promouvoir ne doit jamais empêcher de réparer",
  )
  verifier(
    "les essais du jour comptent autant que ceux d'avant",
    decider(etat(), deuxJours, courant(), MAINTENANT).quoi === "promouvoir",
  )
}

// ── Ce qu'il voit dans Paramètres ──────────────────────────────────────────
{
  const passe = (p: Partial<PasseVeille> = {}): PasseVeille => ({
    id: "p1",
    demarre_at: ilYA(JOURS(1)),
    fini_at: ilYA(JOURS(1)),
    verdict: "rien_a_faire",
    detail: "Rien de mieux n'a fait ses preuves.",
    ...p,
  })
  const choix: MoteurChoisi = {
    role: "commande",
    modele: "modele-en-service",
    secours: ["secours-1"],
    promu_at: ilYA(JOURS(9)),
    promu_par: "veille",
    raison: null,
  }

  verifier(
    "la veille tourne par défaut : c'est sa demande, l'interrupteur sert à GELER",
    VEILLE_PAR_DEFAUT === true,
  )

  const normal = etatDeLaVeille([passe()], choix, true, MAINTENANT)
  verifier("une passe récente sans changement n'alarme pas", normal.ton === "ok", JSON.stringify(normal))
  verifier(
    "et on lui dit QUEL modèle lui répond, pas seulement que tout va bien",
    normal.detail.includes("modele-en-service"),
    normal.detail,
  )

  const muet = etatDeLaVeille(
    [passe({ demarre_at: ilYA(SILENCE_ANORMAL_MS + JOURS(1)) })],
    choix,
    true,
    MAINTENANT,
  )
  verifier(
    "UN SILENCE PROLONGÉ N'EST PAS « RIEN DE NEUF » : c'est une panne",
    muet.ton === "alerte",
    `${muet.titre} — les deux se ressemblent parfaitement quand on ne regarde que l'absence de changement`,
  )

  verifier(
    "un retour arrière se signale",
    etatDeLaVeille([passe({ verdict: "retour_arriere" })], choix, true, MAINTENANT).ton === "alerte",
  )
  verifier(
    "une passe en échec aussi",
    etatDeLaVeille([passe({ verdict: "echec" })], choix, true, MAINTENANT).ton === "alerte",
  )
  verifier(
    "une adoption se dit, sans alarmer",
    etatDeLaVeille([passe({ verdict: "promotion" })], choix, true, MAINTENANT).ton === "ok",
  )

  const gele = etatDeLaVeille([passe()], choix, false, MAINTENANT)
  verifier("gelé, on le dit et on n'alarme pas", gele.ton === "eteint", gele.titre)
  verifier(
    "et un long silence ne se signale PAS quand c'est lui qui a éteint",
    etatDeLaVeille([passe({ demarre_at: ilYA(SILENCE_ANORMAL_MS * 2) })], choix, false, MAINTENANT).ton ===
      "eteint",
    "l'alarmer sur un silence qu'il a demandé, c'est le bandeau qu'on n'écoute plus",
  )

  const jamais = etatDeLaVeille([], null, true, MAINTENANT)
  verifier("aucune passe encore : on le dit sans alarmer", jamais.ton === "jamais")
  verifier(
    "et sans modèle en base, on ne prétend pas en connaître un",
    jamais.detail.includes("écrit dans son code"),
    jamais.detail,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
