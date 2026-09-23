/**
 * La mémoire de travail (src/lib/memoireDeTravail.ts) essayée contre le VRAI
 * modèle, avec la VRAIE consigne de voice-command — sans déployer, sans base,
 * sans compte de test :
 *
 *   scripts/essayer-consigne.sh memoire-de-travail
 *
 * Chaque cas qui compte est rejoué une seconde fois SANS la mémoire (le
 * « témoin ») : c'est ce qui prouve que le bloc change quelque chose, et pas
 * que le modèle y arrivait déjà seul. Mesuré le 23 sept. 2026 : 8/8 avec,
 * et sans elle il rangeait le mauvais chantier, déplaçait la mauvaise tâche
 * et ne comprenait pas « à 9h » dit après sa propre question.
 */
import { CONSIGNES, VOICE_ACTION_TOOL, normaliserAction } from "./voice-command/consignes-extraites.ts"
import { appelerModele } from "./_shared/modele.ts"
import { blocDerniersTours } from "./_shared/derniersTours.ts"

const CATEGORIES = [
  { id: "cat-leads", name: "Leads" }, { id: "cat-serrurerie", name: "Serrurerie" },
  { id: "cat-perso", name: "Perso" }, { id: "cat-hipouy", name: "Hipouy" },
]
const TACHES = [
  { id: "t-easy", title: "Rappeler la société Easy", notes: null, category_id: "cat-serrurerie", status: "todo", due_date: null, due_time: null },
  { id: "t-pain", title: "Acheter du pain", notes: null, category_id: null, status: "todo", due_date: null, due_time: null },
  { id: "t-plombier", title: "Appeler le plombier", notes: null, category_id: null, status: "todo", due_date: null, due_time: null },
]
const CHANTIERS = [
  { id: "c-micro", title: "Micro", notes: "Le micro se coupe entre les phrases", status: "todo", priority: "normal", theme: "Voix et écoute" },
  { id: "c-param", title: "Conserver les paramètres après réinstallation", notes: null, status: "todo", priority: "normal", theme: null },
  { id: "c-quota", title: "Afficher le quota d'utilisation de Jarvis à côté du cœur", notes: null, status: "todo", priority: "normal", theme: null },
]
const SECTIONS = [
  { id: "s-voix", nom: "Voix et écoute" }, { id: "s-app", nom: "L'app elle-même" }, { id: "s-cockpit", nom: "Le cockpit" },
]
const CONTACTS = [{ id: "ct-yoni", name: "Yoni", notes: null, phone: "0612345678" }]

async function demander(phrase: string, tours: unknown[]) {
  const contexte = `Date du jour : 2026-09-23. Heure locale actuelle (Israël) : mercredi 23 septembre 2026 à 16:00.
Catégories de tâches existantes : ${JSON.stringify(CATEGORIES)}.
Tâches existantes de l'utilisateur : ${JSON.stringify(TACHES)}.
Chantiers de dev Jarvis existants (cockpit) : ${JSON.stringify(CHANTIERS)}.
Thèmes de chantiers déjà utilisés : ${JSON.stringify(["Voix et écoute"])}.
Sections de chantiers DÉCLARÉES, avec leur identifiant : ${JSON.stringify(SECTIONS)}.
Documents existants de l'utilisateur : [].
Contacts existants de l'utilisateur : ${JSON.stringify(CONTACTS)}.
Rappels de lieu existants de l'utilisateur : [].
Corrections de transcription déjà apprises : [].
Config actuelle du widget : {"maxTasks":3}.${blocDerniersTours(tours)}`
  const { args, echec } = await appelerModele({
    role: "commande",
    systeme: `${CONSIGNES}\n\n${contexte}`,
    texte: phrase,
    outil: VOICE_ACTION_TOOL,
    maxTokens: 4096,
    essai: true,
  })
  if (echec || !args) return { echec: echec?.statut ?? "sans appel d'outil" }
  const brutes = Array.isArray(args.actions) ? args.actions : [args]
  return brutes.map((a: Record<string, unknown>) => normaliserAction(a, { idsContacts: new Set(["ct-yoni"]), transcript: phrase }))
}

type Cas = { nom: string; phrase: string; tours: unknown[]; ok: (a: Record<string, unknown>[]) => boolean; temoin?: boolean }
const t = (il_y_a_s: number, dit: string, fait: string[], repondu: string | null) => ({ il_y_a_s, dit, fait, repondu })

const CAS: Cas[] = [
  {
    nom: "« le premier épisode » après une recherche YouTube → un clic, pas une nouvelle recherche",
    phrase: "Lance le premier épisode disponible",
    tours: [t(25, "lance un épisode de la série H sur YouTube", ["open_app (app_name=« YouTube », music_query=« série H »)"], "Je lance série H sur YouTube.")],
    ok: (a) => a.length === 1 && a[0].action === "screen_action",
    temoin: true,
  },
  {
    nom: "« les deux chantiers créés à l'instant » → les deux, rangés",
    phrase: "Classe les deux chantiers créés à l'instant dans les bonnes sections",
    tours: [
      t(70, "Lancer un chantier pour conserver les paramètres après réinstallation", ["add_dev_item (title=« Conserver les paramètres après réinstallation »)"], "Chantier \"Conserver les paramètres après réinstallation\" ajouté au cockpit."),
      t(20, "Ajouter un chantier pour afficher le quota d'utilisation de Jarvis à côté du cœur", ["add_dev_item (title=« Afficher le quota d'utilisation de Jarvis à côté du cœur »)"], "Chantier \"Afficher le quota…\" ajouté au cockpit."),
    ],
    ok: (a) => {
      const ids = a.filter((x) => x.action === "update_dev_item").map((x) => x.item_id).sort()
      return ids.length === 2 && ids[0] === "c-param" && ids[1] === "c-quota"
    },
    temoin: true,
  },
  {
    nom: "« mets-la plutôt dans Perso » → la tâche qu'il vient de créer",
    phrase: "mets-la plutôt dans Perso",
    tours: [t(15, "rajoute une tâche dans la serrurerie : rappeler la société Easy", ["add_task (title=« Rappeler la société Easy »)"], "Tâche \"Rappeler la société Easy\" ajoutée.")],
    ok: (a) => a.length === 1 && a[0].action === "update_task" && a[0].task_id === "t-easy" &&
      JSON.stringify(a[0].changes ?? {}).includes("cat-perso"),
    temoin: true,
  },
  {
    nom: "une réponse à sa question, dite dans une nouvelle phrase → le message programmé",
    phrase: "à 9h",
    tours: [t(40, "Envoyer un message programmé pour Yossi Keramika dans WhatsApp pour dimanche matin : on se voit à la boutique", ["clarify"], "À quelle heure dimanche matin souhaites-tu que le message soit envoyé à Yossi Keramika ?")],
    ok: (a) => a.length === 1 && a[0].action === "schedule_message" && String(a[0].due_time ?? "").startsWith("09") &&
      /yossi/i.test(String(a[0].contact_name ?? "")),
    temoin: true,
  },
  {
    nom: "« pourquoi tu ne l'as pas fait ? » → il le fait, sans demander lequel",
    phrase: "pourquoi tu n'as pas ouvert le chantier ?",
    tours: [t(30, "Ouvre un chantier comme quoi tu dois pouvoir créer des notes", ["unknown"], "Je n'ai pas compris.")],
    ok: (a) => a.some((x) => x.action === "add_dev_item" && /note/i.test(String(x.title ?? ""))),
    temoin: true,
  },
  {
    nom: "« annule ça » juste après une création → supprime CELLE-LÀ",
    phrase: "annule ça",
    tours: [t(10, "ajoute une tâche acheter du pain", ["add_task (title=« Acheter du pain »)"], "Tâche \"Acheter du pain\" ajoutée.")],
    ok: (a) => a.length === 1 && a[0].action === "delete_task" && a[0].task_id === "t-pain",
  },
  // ── Ce qu'il ne faut PAS faire ──
  {
    nom: "une nouvelle demande n'est pas rattachée de force (et rien n'est refait)",
    phrase: "appelle Yoni",
    tours: [t(20, "ajoute une tâche acheter du pain", ["add_task (title=« Acheter du pain »)"], "Tâche \"Acheter du pain\" ajoutée.")],
    ok: (a) => a.length === 1 && a[0].action === "call_contact",
  },
  {
    nom: "une demande complète après une recherche YouTube reste ce qu'elle dit",
    phrase: "ajoute une tâche acheter des piles",
    tours: [t(25, "lance un épisode de la série H sur YouTube", ["open_app (app_name=« YouTube », music_query=« série H »)"], "Je lance série H sur YouTube.")],
    ok: (a) => a.length === 1 && a[0].action === "add_task" && /piles/i.test(String(a[0].title ?? "")),
  },
  {
    nom: "une nouvelle tâche après une tâche n'est pas une modification de la première",
    phrase: "ajoute une tâche appeler le plombier demain",
    tours: [t(20, "ajoute une tâche acheter du pain", ["add_task (title=« Acheter du pain »)"], "Tâche \"Acheter du pain\" ajoutée.")],
    ok: (a) => a.every((x) => x.action !== "update_task" && x.action !== "delete_task") &&
      a.some((x) => x.action === "add_task" || (x.action === "update_task" && x.task_id === "t-plombier")),
  },
  {
    nom: "« appelle Yoni » après un autre appel ne rappelle pas le premier",
    phrase: "appelle Yoni",
    tours: [t(60, "appelle Dan Marciano", ["call_contact (contact_name=« Dan Marciano »)"], "J'appelle Dan Marciano.")],
    ok: (a) => a.length === 1 && a[0].action === "call_contact" && a[0].contact_id === "ct-yoni",
  },
]

const seulement = Deno.args[0]
let echecs = 0
for (const c of CAS) {
  if (seulement && !c.nom.includes(seulement)) continue
  const avec = await demander(c.phrase, c.tours)
  const ok = Array.isArray(avec) && c.ok(avec)
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${c.nom}\n      avec mémoire : ${JSON.stringify(avec).slice(0, 400)}`)
  await new Promise((r) => setTimeout(r, 5000))
  if (c.temoin) {
    const sans = await demander(c.phrase, [])
    console.log(`      témoin SANS mémoire : ${JSON.stringify(sans).slice(0, 300)}`)
    await new Promise((r) => setTimeout(r, 5000))
  }
}
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
Deno.exit(echecs === 0 ? 0 : 1)
