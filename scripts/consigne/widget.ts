/**
 * Le widget de tâches DÉFILE : le plafond « 1 à 5 » a disparu de la consigne.
 *
 *   scripts/essayer-consigne.sh widget
 *
 * Ce que ce fichier garde (chantier 562f1475, 27 sept. 2026) : la description
 * de `max_tasks` disait « nombre de tâches à afficher sur le widget (1 à 5) ».
 * Un modèle qui lit ça ramène « montre-moi tout » à 5 — c'est-à-dire
 * exactement le plafond où son réglage était coincé. Le TÉMOIN est là pour ça :
 * avec l'ancienne description, « montre toutes mes tâches » ne rend pas 0.
 *
 *   scripts/essayer-consigne.sh widget --temoin
 */
import { CONSIGNES, VOICE_ACTION_TOOL, normaliserAction } from "./voice-command/consignes-extraites.ts"
import { appelerModele } from "./_shared/modele.ts"

const temoin = Deno.args.includes("--temoin")

/**
 * LE TÉMOIN PATCHE LE SCHÉMA D'OUTIL, PAS `CONSIGNES` — et c'est le piège payé
 * en l'écrivant : la description de `max_tasks` vit dans `ACTION_SCHEMA`, pas
 * dans la prose. Une première version cherchait la phrase dans `CONSIGNES` et
 * s'arrêtait sur « la nouvelle description est introuvable », ce qui se lisait
 * comme un bug de la consigne alors que c'était le témoin qui visait à côté.
 */
const AVANT_SCHEMA =
  "configure_widget uniquement : nombre de tâches à afficher sur le widget (1 à 5), n'inclure que si précisé."
const AVANT_PROSE = "'widget catégorie perso')."

const outil = structuredClone(VOICE_ACTION_TOOL) as {
  input_schema: {
    properties: {
      actions: {
        items: {
          properties: {
            action: { description: string }
            max_tasks: { description: string }
          }
        }
      }
    }
  }
}
const champs = outil.input_schema.properties.actions.items.properties

if (temoin) {
  if (!/combien de tâches/.test(champs.max_tasks.description)) {
    console.log("Le témoin ne peut pas être monté : la nouvelle description de max_tasks est introuvable.")
    Deno.exit(2)
  }
  champs.max_tasks.description = AVANT_SCHEMA

  // LES DEUX MENTIONS VIVENT DANS LE SCHÉMA, pas dans `CONSIGNES` : la longue
  // prose est la description de l'énumération `action`. Le témoin doit retirer
  // les deux, sinon on ne sait pas laquelle fait le travail.
  const prose = champs.action.description
  const i = prose.indexOf("'widget catégorie perso', 'montre toutes mes tâches sur le widget')")
  const fin = prose.indexOf("LES CONTACTS NE SONT PLUS UNE ACTION", i)
  if (i < 0 || fin < 0) {
    console.log("Le témoin ne peut pas être monté : la mention en prose est introuvable.")
    Deno.exit(2)
  }
  champs.action.description = prose.slice(0, i) + AVANT_PROSE + " " + prose.slice(fin)
}

async function demander(phrase: string) {
  const { args, echec } = await appelerModele({
    role: "commande",
    systeme: `${CONSIGNES}\n\nDate du jour : 2026-09-27. Heure locale actuelle (Israël) : dimanche 27 septembre 2026 à 23:00.\nTâches existantes de l'utilisateur : [].`,
    texte: phrase,
    outil,
    maxTokens: 4096,
    essai: true,
  })
  if (echec || !args) return { echec: echec?.statut ?? "sans appel d'outil" }
  const brutes = Array.isArray(args.actions) ? args.actions : [args]
  return brutes.map((a: Record<string, unknown>) => normaliserAction(a, { idsContacts: new Set(), transcript: phrase }))
}

type Action = Record<string, unknown>
const widget = (a: Action[]) => a.find((x) => x.action === "configure_widget")

const CAS: { phrase: string; ok: (a: Action[]) => boolean; attendu: string; temoinDoitEchouer?: boolean }[] = [
  {
    // LE CAS QUI COMPTE, et celui que l'ancienne description empêchait.
    phrase: "montre toutes mes tâches sur le widget",
    ok: (a) => widget(a)?.max_tasks === 0,
    attendu: "configure_widget max_tasks = 0 (toutes)",
    temoinDoitEchouer: true,
  },
  {
    phrase: "limite le widget à dix tâches",
    ok: (a) => widget(a)?.max_tasks === 10,
    attendu: "configure_widget max_tasks = 10",
    temoinDoitEchouer: true,
  },
  {
    // Un plafond qu'il dit explicitement reste respecté tel quel.
    phrase: "mets cinq tâches sur le widget",
    ok: (a) => widget(a)?.max_tasks === 5,
    attendu: "configure_widget max_tasks = 5",
  },
  {
    // Les autres champs ne bougent pas : « n'inclure que si précisé ».
    phrase: "sur le widget, n'affiche que les urgentes",
    ok: (a) => widget(a)?.urgent_only === true && widget(a)?.max_tasks === undefined,
    attendu: "configure_widget urgent_only = true, max_tasks absent",
  },
  {
    // L'inverse : une tâche n'est pas un réglage de widget.
    phrase: "ajoute une tâche : racheter un spot pour l'entrée",
    ok: (a) => !widget(a) && a.some((x) => x.action === "add_task"),
    attendu: "add_task, le widget n'est pas touché",
  },
]

let echecs = 0
for (const c of CAS) {
  const r = await demander(c.phrase)
  const ok = Array.isArray(r) && c.ok(r)
  // Sous témoin, les cas marqués doivent ÉCHOUER : c'est ce qui prouve que la
  // consigne sert. Un témoin tout vert voudrait dire qu'on a écrit du texte
  // pour rien.
  const attenduIci = temoin && c.temoinDoitEchouer ? !ok : ok
  if (!attenduIci) echecs++
  const etiquette = temoin && c.temoinDoitEchouer ? "(témoin : doit échouer)" : ""
  console.log(
    `${attenduIci ? "OK  " : "ÉCHEC"} « ${c.phrase} » → ${c.attendu} ${etiquette}\n      ${JSON.stringify(r).slice(0, 220)}`,
  )
  await new Promise((res) => setTimeout(res, 4000))
}
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
Deno.exit(echecs === 0 ? 0 : 1)
