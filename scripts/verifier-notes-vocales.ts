/**
 * Ses notes à la voix (chantier 447560d1) — et surtout ce qui n'en est PAS.
 *
 *   node --experimental-strip-types scripts/verifier-notes-vocales.ts
 *
 * Aucun réseau. Les phrases ci-dessous sont, pour la plupart, recopiées de
 * SES vraies dictées (`echanges`, relues le 23 sept. 2026) — pas inventées.
 * Mesuré ce jour-là sur les 477 : une seule est une création de note
 * (« Dons Septembre », 6 sept.), une seule un ajout à une note ; et une
 * troisième dit « note » en voulant un rappel (« créer une note me rappelant
 * d'appeler Adam… dans perso », 14 sept.) — elle doit rester une tâche.
 */
import { interpreterLocalement } from "../src/lib/commandeLocale.ts"
import { demandeNote, phraseLectureNote, phraseListeNotes, trouverNote } from "../src/lib/notesVocales.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const NOTES = [
  { id: "n1", title: "Dons Septembre", content: "Kapparot à Ruben : 570 shekels" },
  { id: "n2", title: "Code wifi bureau", content: "réseau Hipouy, mot de passe dans le tiroir" },
  { id: "n3", title: "Courses", content: "lait\nœufs" },
]
const ctx = { taches: [], chantiers: [], notes: NOTES }
const local = (phrase: string) => interpreterLocalement(phrase, ctx)
const action = (phrase: string) => local(phrase)?.[0] as Record<string, unknown> | undefined

// ── Créer ─────────────────────────────────────────────────────────────────
{
  const a = action(
    'Créer une note personnelle "Dons Septembre" avec les détails suivants : Kapparot à Ruben : 570 shekels, Mariage de Avi : 555 shekels',
  )
  verifier(
    "sa vraie dictée du 6 sept. : une NOTE, titrée par ce qu'il a mis entre guillemets",
    a?.action === "add_note" && a.title === "Dons Septembre",
    JSON.stringify(a),
  )
  verifier(
    "…son contenu commence à ce qu'il a dicté, sans « avec les détails suivants »",
    typeof a?.content === "string" && a.content.startsWith("Kapparot à Ruben : 570 shekels"),
    JSON.stringify(a?.content),
  )
  const b = action("Jarvis, crée une note courses : lait, œufs, café")
  verifier(
    "« crée une note courses : lait… » : titre avant les deux-points, contenu après",
    b?.action === "add_note" && b.title === "Courses" && b.content === "lait, œufs, café",
    JSON.stringify(b),
  )
  const c = action("Nouvelle note : idée de cadeau pour Mélissa, un week-end à Eilat")
  verifier(
    "« nouvelle note : … » : les accents de SA phrase sont gardés (Mélissa, week-end)",
    c?.action === "add_note" && String(c.content).includes("Mélissa"),
    JSON.stringify(c),
  )
  const d = action("mets dans mes notes que le code du portail est 4521")
  verifier("« mets dans mes notes que … » : une note", d?.action === "add_note", JSON.stringify(d))
}

// ── Le silence : ce qui n'est PAS une note ───────────────────────────────
{
  const rappel = action("créer une note me rappelant d'appeler Adam pour la prise pour le chargeur de la voiture dans perso")
  verifier(
    "sa dictée du 14 sept. « une note me rappelant d'appeler Adam… dans perso » n'est PAS une note",
    rappel?.action !== "add_note",
    JSON.stringify(rappel),
  )
  verifier(
    "« note un rappel comme quoi je dois rappeler Dan » reste une tâche (sa dictée du 15 sept.)",
    action("note un rappel comme quoi je dois rappeler dan Marciano jeudi matin à 10h")?.action === "add_task",
  )
  verifier("« note ça » reste « garder la réponse à l'écran »", action("note ça")?.action === "garder_reponse_ecran")
  verifier(
    "« note que Dylan est le client de Mélissa » n'est pas pris ici (la mémoire s'en occupe)",
    local("note que Dylan est le client de Mélissa") === null,
  )
  verifier(
    "« ajoute une note de frais de 50 euros » n'est pas une note personnelle",
    action("ajoute une note de frais de 50 euros")?.action !== "add_note",
  )
  verifier(
    "« ajoute une note à la tâche plombier » n'est pas une note personnelle",
    action("ajoute une note à la tâche plombier")?.action !== "add_note",
  )
  verifier(
    "« ajoute une tâche : acheter du pain » reste une tâche",
    action("ajoute une tâche : acheter du pain")?.action === "add_task",
  )
  // Ce qu'elle devient aujourd'hui (une tâche que `suppositionDictee` range
  // en chantier) n'est pas l'affaire de ce module : il doit seulement ne pas
  // la prendre pour une note.
  verifier(
    "« Note un nouveau chantier dans le cockpit » (sa dictée du 17 sept.) n'est pas une note",
    !String(
      action("Note un nouveau chantier dans le cockpit Dev que des fois je suis obligé de dire Jarvis plusieurs fois")
        ?.action ?? "",
    ).includes("note"),
  )
  verifier(
    "« j'avais écrit dans les notes comme quoi… » (un récit, 4 sept.) n'est pas une commande de note",
    !String(action("j'avais écrit dans les notes comme quoi il fallait que j'achète des boîtes")?.action ?? "").includes(
      "note",
    ),
  )
}

// ── Lire, chercher, compléter, supprimer ─────────────────────────────────
{
  verifier("« lis mes notes » les liste", action("lis mes notes")?.action === "list_notes")
  verifier("« qu'est-ce que j'ai dans mes notes » aussi", action("qu'est-ce que j'ai dans mes notes")?.action === "list_notes")
  const lu = action("lis-moi la note code wifi")
  verifier("« lis-moi la note code wifi » vise LA bonne note", lu?.action === "read_note" && lu.note_id === "n2", JSON.stringify(lu))
  const ajout = action('Ajouter à la note personnelle "Dons Septembre" : 700 shekels pour une Bar Mitzvah')
  verifier(
    "sa vraie dictée du 6 sept. « Ajouter à la note personnelle \"Dons Septembre\" : … » complète la bonne note",
    ajout?.action === "append_note" && ajout.note_id === "n1" && ajout.ajout === "700 shekels pour une Bar Mitzvah",
    JSON.stringify(ajout),
  )
  const sup = action("supprime la note courses")
  verifier("« supprime la note courses » vise la bonne note", sup?.action === "delete_note" && sup.note_id === "n3")
  const inconnue = action("lis la note sur le voyage au Japon")
  verifier(
    "une note introuvable : on DEMANDE, on ne lit pas une autre note au hasard",
    inconnue?.action === "clarify" && String(inconnue.message).includes("Code wifi bureau"),
    JSON.stringify(inconnue),
  )
  verifier(
    "deux notes à égalité : on ne choisit pas",
    trouverNote("bureau", [
      { id: "a", title: "Bureau Netanya", content: "" },
      { id: "b", title: "Bureau Tel Aviv", content: "" },
    ]) === null,
  )
}

// ── Ce que Jarvis dit ────────────────────────────────────────────────────
{
  verifier(
    "aucune note : il dit comment en créer une, plutôt que « rien »",
    phraseListeNotes([], null).includes("crée une note"),
  )
  verifier(
    "une recherche sans résultat le dit avec le mot cherché",
    phraseListeNotes(NOTES, "japon").includes("« japon »"),
  )
  const long = { id: "x", title: "Long", content: "mot ".repeat(400) }
  const lue = phraseLectureNote(long)
  verifier("une note longue est coupée au mot, et dit où lire la suite", lue.length < 700 && lue.includes("onglet Notes"))
  verifier(
    "demandeNote ne prend rien sans le mot « note »",
    demandeNote("ajoute du lait") === null && demandeNote("lis mes taches") === null,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
