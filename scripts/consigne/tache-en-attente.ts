/**
 * « non mets-le dans la catégor » doit viser la tâche QUI ATTEND.
 *
 *   scripts/essayer-consigne.sh tache-en-attente
 *
 * Le cas du 15-16 sept. 2026 (chantiers 7b2c99e2, v109), déjà couvert par
 * `verifier-commande-vocale.mjs` sur la fonction DÉPLOYÉE. Ce banc-ci le
 * rejoue sur la consigne telle qu'elle est SUR LE DISQUE, plusieurs fois, et
 * avec un témoin — parce que ce cas a échoué le 27 sept. juste après qu'on
 * ait ajouté quelques lignes sur le widget à la description de l'énumération
 * `action`, et qu'un échec unique ne dit pas s'il est causé ou s'il varie.
 *
 * Le témoin retire l'ajout du widget :
 *
 *   scripts/essayer-consigne.sh tache-en-attente --temoin
 *
 * Même nombre de tours des deux côtés, même contexte : c'est la COMPARAISON
 * qui tranche, pas un tour isolé.
 */
import {
  CONSIGNES,
  VOICE_ACTION_TOOL,
  blocTacheEnAttente,
  normaliserAction,
} from "./voice-command/consignes-extraites.ts"
import { appelerModele } from "./_shared/modele.ts"

const temoin = Deno.args.includes("--temoin")
const TOURS = Number(Deno.env.get("TOURS") ?? "4")

// Le contexte du banc bout-en-bout, mot pour mot (verifier-commande-vocale.mjs).
const TACHES = [
  { id: "t-plombier", title: "Appeler le plombier", notes: "Pour la fuite sous l'évier de la cuisine", category_id: null, status: "todo", due_date: null, due_time: null },
  { id: "t-facture", title: "Payer la facture d'électricité", notes: null, category_id: null, status: "todo", due_date: "2026-09-10", due_time: null },
  { id: "t-carreaux", title: "Commander les carreaux", notes: "Chantier villa Dan, 40 m2 de gres cerame", category_id: null, status: "done", due_date: null, due_time: null },
]
const CATEGORIES = [
  { id: "cat-leads", name: "Leads" }, { id: "cat-prelevements", name: "Prélèvements" },
  { id: "cat-hipouy", name: "Hipouy" }, { id: "cat-serrurerie", name: "Serrurerie" },
  { id: "cat-admin", name: "Admin" }, { id: "cat-perso", name: "Perso" },
  { id: "cat-achat", name: "Achat" }, { id: "cat-notes", name: "Notes" },
  { id: "cat-melissa", name: "Melissa" },
]
const ATTENTE = { id: "t-marciano", titre: "Rappeler Dan Marciano", sans_date: false, categorie_a_valider: true }

const outil = structuredClone(VOICE_ACTION_TOOL) as {
  input_schema: { properties: { actions: { items: { properties: { action: { description: string } } } } } }
}
if (temoin) {
  const champ = outil.input_schema.properties.actions.items.properties.action
  const i = champ.description.indexOf("'widget catégorie perso', 'montre toutes mes tâches sur le widget')")
  const fin = champ.description.indexOf("LES CONTACTS NE SONT PLUS UNE ACTION", i)
  if (i < 0 || fin < 0) {
    console.log("Le témoin ne peut pas être monté : l'ajout du widget est introuvable.")
    Deno.exit(2)
  }
  champ.description =
    champ.description.slice(0, i) + "'widget catégorie perso'). " + champ.description.slice(fin)
}

const contexte = `Date du jour : 2026-09-27. Heure locale actuelle (Israël) : dimanche 27 septembre 2026 à 23:00.
Catégories de tâches existantes : ${JSON.stringify(CATEGORIES)}.
Tâches existantes de l'utilisateur : ${JSON.stringify(TACHES)}.
Config actuelle du widget : ${JSON.stringify({ maxTasks: 0, urgentOnly: false, categoryId: null })}.${blocTacheEnAttente(ATTENTE)}`

async function demander() {
  const { args, echec } = await appelerModele({
    role: "commande",
    systeme: `${CONSIGNES}\n\n${contexte}`,
    texte: "non mets-le dans la catégor",
    outil,
    maxTokens: 4096,
    essai: true,
  })
  if (echec || !args) return { echec: echec?.statut ?? "sans appel d'outil" }
  const brutes = Array.isArray(args.actions) ? args.actions : [args]
  return brutes.map((a: Record<string, unknown>) =>
    normaliserAction(a, { idsContacts: new Set(), transcript: "non mets-le dans la catégor" }),
  )
}

/** Le MÊME verdict que le banc bout-en-bout, transposé ici. */
function juge(r: unknown): { ok: boolean; pourquoi: string } {
  if (!Array.isArray(r)) return { ok: false, pourquoi: `pas d'actions : ${JSON.stringify(r)}` }
  const texte = JSON.stringify(r).toLowerCase()
  const autre = ["t-plombier", "t-facture", "t-carreaux"].find((id) =>
    r.some((x: Record<string, unknown>) => x.task_id === id),
  )
  if (autre) return { ok: false, pourquoi: `vise ${autre}` }
  for (const mot of ["plombier", "electricite", "carreaux"]) {
    if (texte.includes(mot)) return { ok: false, pourquoi: `parle de « ${mot} »` }
  }
  const nomme = texte.includes("marciano") || r.some((x: Record<string, unknown>) => x.task_id === "t-marciano")
  if (!nomme) return { ok: false, pourquoi: "ne nomme pas la tâche qui attend" }
  const rangeRefuse = r.some(
    (x: Record<string, unknown>) =>
      x.action === "update_task" &&
      !!(x.changes as Record<string, unknown> | undefined)?.category_id,
  )
  if (rangeRefuse) return { ok: false, pourquoi: "range dans une catégorie qu'il ne peut pas connaître" }
  return { ok: true, pourquoi: "" }
}

console.log(`${temoin ? "TÉMOIN (sans l'ajout du widget)" : "CONSIGNE ACTUELLE"} — ${TOURS} tours\n`)
let bons = 0
for (let i = 1; i <= TOURS; i++) {
  const r = await demander()
  const v = juge(r)
  if (v.ok) bons++
  console.log(`${v.ok ? "OK  " : "ÉCHEC"} tour ${i} ${v.ok ? "" : `— ${v.pourquoi}`}\n      ${JSON.stringify(r).slice(0, 200)}`)
  if (i < TOURS) await new Promise((res) => setTimeout(res, 6000))
}
console.log(`\n${bons}/${TOURS} corrects.`)
// Ce banc MESURE, il ne barre pas la route : c'est la comparaison des deux
// côtés qui conclut, et un seul tour raté ne prouve rien dans un sens ni
// dans l'autre.
Deno.exit(0)
