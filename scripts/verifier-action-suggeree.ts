/**
 * Le bouton d'action d'un rappel : ce qu'on propose, et surtout ce qu'on ne
 * propose PAS.
 *
 *   node --experimental-strip-types scripts/verifier-action-suggeree.ts
 *
 * Chantier 4363aecf. Sans réseau, sans téléphone : `actionSuggeree` est pure.
 *
 * LA MOITIÉ DE CES CONTRÔLES VÉRIFIE LE REFUS, et c'est le vrai sujet. Un
 * bouton « Appeler » proposé à tort sur « rappelle-moi de sortir les
 * poubelles » est absurde, et « appelle mail » a réellement composé un
 * répondeur le 5 sept. 2026 à 21 h 07. Composer le numéro de quelqu'un
 * d'autre est l'erreur qu'on ne rattrape pas.
 */
import { actionSuggeree, libelleAction } from "../src/lib/notifications/actionSuggeree.ts"
import { planifierEcheances } from "../src/lib/notifications/plan.ts"
import { PREFS_NOTIFS_DEFAUT } from "../src/lib/notifications/prefs.ts"
import type { Task } from "../src/types/database.ts"

let echecs = 0
function verifier(nom: string, ok: boolean, detail = "") {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── CE QU'ON PROPOSE ──────────────────────────────────────────────────────
{
  const cas: [string, string][] = [
    ["rappeler Jonathan", "Jonathan"],
    ["Rappeler Jonathan le comptable", "Jonathan le comptable"],
    ["appeler Yoni", "Yoni"],
    ["téléphoner à Melissa", "Melissa"],
    ["telephoner a Melissa", "Melissa"],
    ["joindre Daniel Nakache", "Daniel Nakache"],
    // Ses amorces habituelles, retirées avant de chercher le verbe.
    ["penser à rappeler Jonathan", "Jonathan"],
    ["il faut que je rappelle Avihai", "Avihai"],
    // Ce qui suit le nom n'en fait pas partie.
    ["rappeler Jonathan pour le devis", "Jonathan"],
    ["appeler Yoni au sujet de la villa Dan", "Yoni"],
    ["rappeler Melissa.", "Melissa"],
    // UN ARTICLE N'EST PAS UN PRONOM. « appeler le plombier » désigne bien
    // quelqu'un, qui peut très bien être dans son répertoire — c'est au
    // téléphone de répondre « je ne trouve personne », pas à nous de refuser
    // d'avance. C'est ce qui distingue « appeler LE plombier » de
    // « rappelle-LE », où le pronom est tout le reste.
    ["appeler le plombier", "le plombier"],
    ["rappeler la banque", "la banque"],
  ]
  for (const [titre, attendu] of cas) {
    const a = actionSuggeree(titre)
    verifier(`« ${titre} » → ${attendu}`, a?.qui === attendu, `obtenu ${JSON.stringify(a)}`)
  }
  verifier("le bouton s'appelle « Appeler »", libelleAction({ genre: "appeler", qui: "X" }) === "Appeler")
}

// ── CE QU'ON REFUSE, ET C'EST LE PLUS IMPORTANT ───────────────────────────
{
  const refus = [
    // LA tournure la plus fréquente de ses dictées : elle parle de la tâche,
    // pas de quelqu'un.
    "rappelle-moi de sortir les poubelles",
    "rappelle moi d'acheter du pain",
    "me rappeler de payer l'arnona",
    // Un mot d'appareil n'est jamais quelqu'un — le cas réel du 5 sept.
    "appelle mail",
    "appeler message",
    "rappeler sms",
    // Une phrase où le verbe se trouve par hasard : le répertoire n'y
    // trouverait rien, et un bouton qui échoue est pire que pas de bouton.
    // Une subordonnée : la tâche parle d'elle-même. Avant le correctif, ce
    // titre rendait « que » comme un nom de personne.
    "rappeler que le rendez-vous chez le dentiste est mardi prochain matin",
    "rappeler qu'il faut payer avant vendredi",
    // Le pronom seul : « rappelle-le » ne dit pas QUI.
    "rappelle le",
    // Aucun verbe de ce genre du tout.
    "commander les carreaux pour le chantier de la villa Dan",
    "racheter un spot pour l'entrée",
    "réserver le restaurant de samedi",
    // Un verbe, mais rien derrière.
    "appeler",
    "rappeler ",
  ]
  for (const titre of refus) {
    const a = actionSuggeree(titre)
    verifier(`« ${titre} » ne propose RIEN`, a === null, `obtenu ${JSON.stringify(a)}`)
  }
}

// ── LE NOM N'EST NI CORRIGÉ NI COMPLÉTÉ ───────────────────────────────────
{
  // C'est le répertoire du téléphone qui sait, pas nous. On lui passe ce qu'il
  // a dicté, tel quel — même logique que `contact_name` dans la commande
  // vocale, où le modèle ne voit pas le répertoire et le téléphone si.
  const a = actionSuggeree("appeler ma femme")
  verifier("un lien de parenté reste tel quel", a?.qui === "ma femme", JSON.stringify(a))
  verifier(
    "et il est bien proposé : « appelle ma femme » trouve son contact",
    a !== null,
    "c'est le cas réel du 5 sept., et MOTS_APPAREIL ne doit jamais contenir « femme »",
  )
}

// ── ET LE RAPPEL LE PORTE VRAIMENT ────────────────────────────────────────
//
// Le module pur pourrait être juste et n'arriver jamais jusqu'à la
// notification. On fait donc tourner le VRAI planificateur.
{
  const demain = new Date(Date.now() + 24 * 3600_000)
  const iso = `${demain.getFullYear()}-${String(demain.getMonth() + 1).padStart(2, "0")}-${String(demain.getDate()).padStart(2, "0")}`
  const tache = (titre: string): Task => ({
    id: `t-${titre}`,
    user_id: "u",
    category_id: null,
    title: titre,
    notes: null,
    due_date: iso,
    due_time: "14:00",
    status: "todo",
    created_at: "2026-09-08T10:00:00Z",
    updated_at: "2026-09-08T10:00:00Z",
  })

  const plan = planifierEcheances(
    [tache("rappeler Jonathan"), tache("racheter un spot pour l'entrée")],
    PREFS_NOTIFS_DEFAUT,
    new Date(),
  )
  const avec = plan.find((n) => n.titre === "rappeler Jonathan")
  const sans = plan.find((n) => n.titre === "racheter un spot pour l'entrée")
  verifier("le rappel d'une tâche qui nomme quelqu'un porte l'action",
    avec?.action?.qui === "Jonathan", JSON.stringify(avec?.action))
  verifier("et celui d'une tâche ordinaire n'en porte AUCUNE",
    sans?.action === undefined,
    `${JSON.stringify(sans?.action)} — un bouton qui n'aboutit à rien est pire que pas de bouton`)

  // LE RÉGLAGE PASSE AVANT, et c'est sa règle : coupé, la notification doit
  // redevenir exactement ce qu'elle était.
  const coupe = planifierEcheances(
    [tache("rappeler Jonathan")],
    { ...PREFS_NOTIFS_DEFAUT, actionRappel: false },
    new Date(),
  )
  verifier("réglage coupé : plus aucun bouton", coupe[0]?.action === undefined,
    JSON.stringify(coupe[0]?.action))
  verifier("mais le rappel sonne toujours", coupe.length === 1)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
