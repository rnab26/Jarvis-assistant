/**
 * Vérifie ce qu'on dit à Raphaël de sa consommation — et surtout ce qu'on ne
 * lui dit pas.
 *
 *   node --experimental-strip-types scripts/verifier-consommation.ts
 *
 * Aucun réseau. Ce qui se joue ici est faux EN SILENCE : un chiffre rassurant
 * devant un quota vide se lit exactement comme un chiffre juste. Il s'est
 * retrouvé sans Jarvis deux fois alors que tout avait l'air normal ; cette
 * page-là ne doit pas être la troisième.
 *
 * La moitié de ces contrôles vérifie le SILENCE. Un bandeau qui s'allume tous
 * les jours n'est plus lu, et c'est la panne qu'on ne verra pas.
 */
import {
  type LigneConsommation,
  PLAFONDS_MESURES,
  alerteDe,
  margeDe,
  resumerConsommation,
} from "../src/lib/consommationModele.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const PRINCIPAL = "gemini-3.1-flash-lite"

const ligne = (p: Partial<LigneConsommation> = {}): LigneConsommation => ({
  role: "commande",
  modele: PRINCIPAL,
  fournisseur: "gemini",
  appels: 10,
  reussis: 10,
  refus_minute: 0,
  refus_jour: 0,
  jetons_entree: 11000,
  jetons_sortie: 300,
  jetons_reflexion: 200,
  ms_median: 940,
  dernier_at: "2026-09-06T09:00:00Z",
  rang: 0,
  ...p,
})

// ── Ses phrases, et ce qui n'en est pas ────────────────────────────────────
{
  const r = resumerConsommation(
    [ligne({ reussis: 12 }), ligne({ role: "memoire", modele: "gemini-3.5-flash-lite", reussis: 12 })],
  )
  verifier(
    "la mémoire ne compte pas comme des phrases qu'il a dites",
    r.phrases === 12,
    `${r.phrases} — chaque phrase déclenche DEUX appels, comprendre puis mémoriser ; les confondre afficherait le double`,
  )
  verifier(
    "mais ses jetons comptent : ils remplissent les mêmes seaux",
    r.jetons === 2 * (11000 + 300 + 200),
    `${r.jetons}`,
  )
  verifier("le modèle qui a répondu est nommé", r.modele === PRINCIPAL)
  verifier("et rien ne l'alerte quand tout va bien", r.alerte === null, JSON.stringify(r.alerte))
}

// ── Un modèle beaucoup essayé mais muet n'est pas « le » modèle ────────────
{
  const r = resumerConsommation(
    [
      ligne({ modele: "un-modele-mort", appels: 90, reussis: 0, ms_median: null, rang: 0 }),
      ligne({ modele: PRINCIPAL, appels: 5, reussis: 5, rang: 0 }),
    ],
  )
  verifier(
    "on nomme celui qui a RÉPONDU, pas celui qu'on a le plus essayé",
    r.modele === PRINCIPAL,
    `${r.modele} — un modèle mort peut être tenté cent fois sans jamais parler`,
  )
  verifier("et on ne croit donc pas être sur un secours", r.surSecours === false)
}

// ── Tourner sur un secours doit se voir ────────────────────────────────────
{
  const r = resumerConsommation(
    [ligne({ modele: "gemini-3.1-flash-lite-preview", reussis: 8, rang: 1 })],
  )
  verifier("un secours qui répond à sa place se signale", r.surSecours && r.alerte?.niveau === "orange")
  verifier(
    "et l'alerte NOMME le secours : c'est le seul mot qui lui dit quoi regarder",
    !!r.alerte && r.alerte.texte.includes("preview"),
    r.alerte?.texte ?? "",
  )
}

// ── Le quota du JOUR : le seul qui ne se lève pas tout seul ────────────────
{
  const r = resumerConsommation([ligne({ refus_jour: 3, reussis: 40 })])
  verifier("un quota journalier vide passe en rouge", r.alerte?.niveau === "rouge")
  verifier(
    "et la marge le dit clairement, sans chiffre rassurant",
    r.marge.includes("épuisé") && !/\d+ phrases? avant/.test(r.marge),
    r.marge,
  )
  verifier(
    "le rouge du jour l'emporte sur le orange du secours",
    resumerConsommation([
      ligne({ modele: "gemini-3-flash-preview", refus_jour: 1, rang: 2 }),
    ]).alerte?.niveau === "rouge",
  )
}

// ── Le SILENCE : ce qui ne doit surtout pas l'alerter ──────────────────────
{
  const r = resumerConsommation([ligne({ refus_minute: 4 })])
  verifier(
    "enchaîner vite (refus par MINUTE) n'alerte pas : ça se lève en 60 s",
    r.alerte === null,
    `${r.alerte?.texte ?? ""} — un bandeau qui s'allume tous les jours n'est plus lu`,
  )
  verifier("mais le nombre reste consultable", r.refusMinute === 4)

  verifier(
    "une journée sans une seule phrase n'alerte pas non plus",
    resumerConsommation([]).alerte === null,
  )
  verifier(
    "et elle le dit, plutôt que d'afficher un zéro sans contexte",
    resumerConsommation([]).marge === "Aucune phrase aujourd'hui.",
  )
  verifier(
    "une réponse en 3 s est normale et n'alerte pas",
    alerteDe({ modele: PRINCIPAL, surSecours: false, refusJour: 0, refusMinute: 0, msMedian: 3000 }) === null,
  )
}

// ── Un historique d'avant la migration 0025 n'a pas de rang ───────────────
{
  const r = resumerConsommation([ligne({ modele: "un-vieux-modele", reussis: 5, rang: null })])
  verifier(
    "sans rang, on ne prétend pas être sur un secours",
    r.surSecours === false && r.alerte === null,
    "alerter sur un historique qu'on ne sait pas lire ferait un bandeau permanent",
  )
}

// ── La latence, la gêne qu'il signale le plus souvent ──────────────────────
{
  // Les anciens secours mesurés le 6 sept. : 13,8 s et 22,2 s, quand l'app
  // abandonne à 25 s.
  const a = alerteDe({ modele: PRINCIPAL, surSecours: false, refusJour: 0, refusMinute: 0, msMedian: 13800 })
  verifier("une réponse en 13,8 s se signale", a?.niveau === "orange", JSON.stringify(a))
  verifier(
    "et l'alerte rappelle qu'à 25 s l'app abandonne",
    !!a && a.texte.includes("25"),
    a?.texte ?? "",
  )
}

// ── La marge : jamais un plafond inventé ───────────────────────────────────
{
  verifier(
    "un plafond MESURÉ donne un reste chiffré",
    margeDe("gemini-3.7-flash", 12, 0).includes("8 phrases avant"),
    margeDe("gemini-3.7-flash", 12, 0),
  )
  verifier(
    "et il ne descend jamais sous zéro",
    margeDe("gemini-3.7-flash", 99, 0).includes("0 phrase"),
    margeDe("gemini-3.7-flash", 99, 0),
  )
  const sansPlafond = margeDe(PRINCIPAL, 30, 0)
  verifier(
    "sans plafond connu, on annonce un PLANCHER prouvé, pas une limite",
    sansPlafond.includes("au moins") && sansPlafond.includes("Aucun plafond journalier connu"),
    sansPlafond,
  )
  verifier(
    "et ce plancher suit son usage réel quand il le dépasse",
    margeDe(PRINCIPAL, 250, 0).includes("au moins 250"),
    margeDe(PRINCIPAL, 250, 0),
  )
  const inconnu = margeDe("un-modele-jamais-mesure", 7, 0)
  verifier(
    "un modèle jamais mesuré le DIT, au lieu d'inventer un pourcentage",
    inconnu.includes("jamais mesuré"),
    inconnu,
  )
  verifier(
    "aucune formulation ne parle d'argent : l'offre est gratuite, il n'y a pas de solde",
    ![
      margeDe(PRINCIPAL, 30, 0),
      margeDe("gemini-3.7-flash", 2, 0),
      margeDe(PRINCIPAL, 0, 3),
      margeDe(null, 0, 0),
    ].some((m) => /€|euro|dollar|crédit restant|solde/i.test(m)),
  )
}

// ── Les plafonds notés portent leur date ───────────────────────────────────
{
  const sansDate = Object.entries(PLAFONDS_MESURES).filter(
    ([, p]) => !/^\d{4}-\d{2}-\d{2}$/.test(p.mesureLe),
  )
  verifier(
    "chaque plafond dit QUAND il a été mesuré",
    sansDate.length === 0,
    sansDate.map(([m]) => m).join(", ") + " — un modèle meurt sans prévenir, une mesure vieillit",
  )
  const vides = Object.entries(PLAFONDS_MESURES).filter(
    ([, p]) => p.parMinute === undefined && p.parJour === undefined && p.auMoinsParJour === undefined,
  )
  verifier(
    "et aucune entrée n'est vide : une entrée sans mesure n'est qu'un nom",
    vides.length === 0,
    vides.map(([m]) => m).join(", "),
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
