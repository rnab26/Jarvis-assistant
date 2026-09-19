/**
 * Le moteur de langue que Jarvis annonce quand on lui demande lequel tourne.
 *
 *   node --experimental-strip-types scripts/verifier-moteur-actif.ts
 *
 * Chantier 920ff758, sa demande : pouvoir demander à voix haute quel moteur
 * tourne en ce moment, même en mode automatique de bascule.
 *
 * Aucun réseau. Deux choses, et la seconde est celle qui casse en silence :
 *
 * 1. le bloc dit le bon modèle, le bon fournisseur, et se TAIT quand rien n'a
 *    encore été mesuré (un compte de test, une base neuve) — jamais un nom
 *    deviné ou une configuration citée comme si elle avait répondu ;
 * 2. la règle de sélection (« le modèle qui a le plus répondu, pas le plus
 *    essayé ») rend le MÊME verdict côté serveur (`_shared/moteurActif.ts`)
 *    et côté cockpit (`resumerConsommation`, `src/lib/consommationModele.ts`)
 *    — deux fichiers distincts, une Edge Function ne pouvant pas importer
 *    `src/`, donc deux occasions de diverger. Le jour où elles divergent,
 *    Jarvis annoncerait à voix haute un modèle différent de celui que le
 *    cockpit affiche pour la même donnée.
 */
import {
  type LigneMoteur,
  formaterMoteurActif,
  moteurGagnant,
} from "../supabase/functions/_shared/moteurActif.ts"
import { type LigneConsommation, resumerConsommation } from "../src/lib/consommationModele.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const ligne = (p: Partial<LigneConsommation> = {}): LigneConsommation => ({
  role: "commande",
  modele: "gemini-3.1-flash-lite",
  fournisseur: "gemini",
  appels: 10,
  reussis: 10,
  refus_minute: 0,
  refus_jour: 0,
  jetons_entree: 11000,
  jetons_sortie: 300,
  jetons_reflexion: 200,
  ms_median: 940,
  dernier_at: "2026-09-17T09:00:00Z",
  rang: 0,
  ...p,
})

// ── Rien mesuré : silence, jamais un nom deviné ────────────────────────────
{
  verifier("aucune ligne : bloc vide", formaterMoteurActif([]) === "")
  verifier(
    "que des lignes « mémoire » : bloc vide, ce n'est pas une phrase qu'il a dite",
    formaterMoteurActif([ligne({ role: "memoire", modele: "gemini-3.5-flash-lite" })]) === "",
  )
  verifier(
    "un modèle jamais RÉPONDU (essayé mais 0 succès) : bloc vide",
    formaterMoteurActif([ligne({ reussis: 0 })]) === "",
    "un modèle mort a pu être tenté cent fois sans jamais parler : ce n'est pas lui qui tourne",
  )
}

// ── Le modèle principal ─────────────────────────────────────────────────
{
  const bloc = formaterMoteurActif([ligne({ modele: "gemini-3.1-flash-lite", rang: 0 })])
  verifier("nomme le modèle principal", bloc.includes("gemini-3.1-flash-lite"))
  verifier("nomme le fournisseur", bloc.includes("gemini"))
  verifier("dit que c'est le principal, pas un secours", bloc.includes("PRINCIPAL"))
  verifier("ne dit jamais SECOURS pour le principal", !bloc.includes("SECOURS"))
}

// ── Un secours : le dire, sans alarmer plus que ça ─────────────────────────
{
  const bloc = formaterMoteurActif([ligne({ modele: "gemini-3.1-flash-lite-preview", rang: 1 })])
  verifier("nomme le secours qui a répondu", bloc.includes("gemini-3.1-flash-lite-preview"))
  verifier("dit que c'est un secours", bloc.includes("SECOURS"))
}

// ── Le plus RÉPONDU l'emporte, pas le plus essayé ──────────────────────────
{
  const gagnant = moteurGagnant([
    ligne({ modele: "gemini-3.1-flash-lite", reussis: 2, rang: 0 }),
    ligne({ modele: "gemini-3.1-flash-lite-preview", reussis: 40, rang: 1 }),
  ])
  verifier(
    "le secours sollicité 40 fois l'emporte sur le principal qui n'a répondu que 2 fois",
    gagnant?.modele === "gemini-3.1-flash-lite-preview",
    `gagnant : ${gagnant?.modele}`,
  )
}

// ── Les deux règles (serveur, cockpit) rendent le même verdict ─────────────
{
  const jeuxDEssai: LigneConsommation[][] = [
    [ligne({ modele: "gemini-3.1-flash-lite", reussis: 30, rang: 0 })],
    [
      ligne({ modele: "gemini-3.1-flash-lite", reussis: 1, rang: 0 }),
      ligne({ modele: "gemini-3.1-flash-lite-preview", reussis: 12, rang: 1 }),
    ],
    [ligne({ role: "memoire", modele: "gemini-3.5-flash-lite", reussis: 50 })],
    [ligne({ reussis: 0 })],
    [],
  ]
  for (const [i, lignes] of jeuxDEssai.entries()) {
    const cotéServeur = moteurGagnant(lignes as LigneMoteur[])?.modele ?? null
    const cotéCockpit = resumerConsommation(lignes).modele
    verifier(
      `même modèle « actif » côté serveur et côté cockpit (cas ${i + 1})`,
      cotéServeur === cotéCockpit,
      `serveur : ${cotéServeur} — cockpit : ${cotéCockpit}`,
    )
  }
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
