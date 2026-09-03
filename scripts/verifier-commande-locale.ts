/**
 * Vérifie l'interprétation LOCALE des commandes vocales.
 *
 *   node --experimental-strip-types scripts/verifier-commande-locale.ts
 *
 * Aucun réseau, aucun modèle, aucun centime : c'est justement le sujet.
 * Ce que ce module reconnaît, Jarvis le fait sans appeler personne — donc
 * même sans crédit chez un fournisseur d'IA, et même hors ligne.
 *
 * Les deux moitiés comptent autant. Ce qu'il DOIT comprendre : les tournures
 * que Raphaël emploie tous les jours. Ce qu'il doit LAISSER PASSER : tout ce
 * qui demande un vrai raisonnement — mal deviné, ça crée une tâche fausse
 * qu'il faut ensuite retrouver et corriger.
 */
import { interpreterLocalement, type ContexteLocal } from "../src/lib/commandeLocale.ts"

// Jeudi 3 septembre 2026, 15 h 30 — figé pour que les dates soient vérifiables.
const MAINTENANT = new Date("2026-09-03T15:30:00")

const CTX: ContexteLocal = {
  taches: [
    { id: "t-plombier", title: "Appeler le plombier", notes: "fuite sous l'évier" },
    { id: "t-facture", title: "Payer la facture d'électricité", notes: null },
    { id: "t-carreaux", title: "Commander les carreaux", notes: "chantier villa Dan" },
  ],
  chantiers: [{ id: "c-micro", title: "Micro", notes: "se coupe entre les phrases" }],
  maintenant: MAINTENANT,
}

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

type Attendu = Record<string, unknown>

function doitDonner(phrase: string, attendu: Attendu) {
  const actions = interpreterLocalement(phrase, CTX)
  if (!actions || actions.length === 0) {
    verifier(`« ${phrase} »`, false, "non reconnu (retombe sur le serveur)")
    return
  }
  const a = actions[0] as unknown as Record<string, unknown>
  const manque = Object.entries(attendu).filter(([k, v]) => a[k] !== v)
  verifier(
    `« ${phrase} »`,
    manque.length === 0,
    manque.map(([k, v]) => `${k} = ${JSON.stringify(a[k])}, attendu ${JSON.stringify(v)}`).join(" ; "),
  )
}

function doitLaisserPasser(phrase: string, pourquoi: string) {
  const actions = interpreterLocalement(phrase, CTX)
  verifier(
    `laisse passer « ${phrase} » (${pourquoi})`,
    actions === null,
    `interprété comme ${JSON.stringify(actions)}`,
  )
}

console.log("— Ce qu'il doit comprendre tout seul —")

doitDonner("Jarvis, ajoute une tâche : appeler le carreleur", {
  action: "add_task",
  title: "Appeler le carreleur",
  due_date: null,
})
doitDonner("ajoute une tâche pour demain : sortir les poubelles", {
  action: "add_task",
  title: "Sortir les poubelles",
  due_date: "2026-09-04",
})
doitDonner("rappelle-moi d'appeler Yoni demain à 14h", {
  action: "add_task",
  title: "Appeler yoni",
  due_date: "2026-09-04",
  due_time: "14:00",
})
doitDonner("note d'acheter du pain", { action: "add_task", title: "Acheter du pain" })
doitDonner("liste mes tâches", { action: "list_tasks" })
doitDonner("qu'est-ce que j'ai à faire", { action: "list_tasks" })
doitDonner("marque la tâche appeler le plombier comme faite", {
  action: "update_task",
  task_id: "t-plombier",
})
doitDonner("marque le plombier comme terminé", {
  action: "update_task",
  task_id: "t-plombier",
})
doitDonner("supprime la tâche des carreaux", {
  action: "delete_task",
  task_id: "t-carreaux",
})
doitDonner("ajoute un chantier : le widget ne se met pas à jour", {
  action: "add_dev_item",
  title: "Le widget ne se met pas a jour",
})
doitDonner("liste mes chantiers", { action: "list_dev_items" })
doitDonner("coupe ta voix", { action: "set_voice", voice_enabled: false })
doitDonner("remets ta voix", { action: "set_voice", voice_enabled: true })
doitDonner("réponds-moi juste à l'écrit", { action: "set_voice", voice_enabled: false })

console.log("\n— L'agenda —")

doitDonner("qu'est-ce que j'ai dans mon agenda demain", {
  action: "list_calendar_events",
  event_depuis: "2026-09-04T00:00:00",
})
doitDonner("montre-moi mon planning", { action: "list_calendar_events" })
doitDonner("ajoute un rendez-vous avec Yoni mardi à 14h", {
  action: "add_calendar_event",
  event_debut: "2026-09-08T14:00:00",
})
doitDonner("prends un rendez-vous demain à 9h30 chez le dentiste", {
  action: "add_calendar_event",
  event_debut: "2026-09-04T09:30:00",
})

console.log("\n— Ses tournures réelles, relevées dans la table `echanges` —")

// Ces phrases ne sont pas inventées : ce sont celles que Raphaël a réellement
// dictées, telles que la table les a enregistrées. Elles disent deux choses
// qu'aucune supposition n'aurait données : il dit « rajoute », pas « ajoute »,
// et ses demandes sont longues et descriptives.
doitDonner("Jarvis rajoute un chantier pour un problème de micro", {
  action: "add_dev_item",
  title: "Un probleme de micro",
})
doitDonner(
  "rajoute un chantier pour un problème de micro à chaque fois qu'on termine une phrase il faut que je réappuie sur le bouton",
  {
    action: "add_dev_item",
    title: "Un probleme de micro a chaque fois",
  },
)
doitDonner("rajoute une tâche : vérifier le devis de la boutique", {
  action: "add_task",
  title: "Verifier le devis de la boutique",
})
doitDonner("dans les tâches de développement ajoute un chantier à traiter en priorité", {
  action: "add_dev_item",
})
doitDonner("mets le chantier micro en priorité haute", {
  action: "update_dev_item",
  item_id: "c-micro",
})
doitDonner("modifie la priorité du chantier micro en très élevé", {
  action: "update_dev_item",
  item_id: "c-micro",
})
doitDonner("archive le chantier micro", { action: "archive_dev_item", item_id: "c-micro" })

// La note garde tout ce qu'il a dit — c'est ce qui rend acceptable un titre
// tronqué : rien n'est perdu, seul le titre est à retoucher.
{
  const longue =
    "rajoute une tâche comme quoi le micro doit avoir la capacité d'être en écoute constante à chaque fois il se coupe"
  const actions = interpreterLocalement(longue, CTX)
  const a = actions?.[0] as unknown as Record<string, unknown> | undefined
  verifier(
    "une dictée longue garde tout son contenu dans la note",
    typeof a?.notes === "string" && (a.notes as string).includes("ecoute constante"),
    `notes = ${JSON.stringify(a?.notes)}`,
  )
}

console.log("\n— Ce qu'il doit laisser au serveur, plutôt que de deviner —")

doitLaisserPasser("c'est quoi la capitale de l'Australie", "question de culture générale")
doitLaisserPasser(
  "note que Dylan est le client de Melissa et qu'il faut toujours le rappeler avant midi",
  "une information sur quelqu'un, pas une tâche",
)
doitLaisserPasser("marque le truc bidule comme fait", "aucune tâche ne correspond")
doitLaisserPasser("ajoute un rendez-vous avec Yoni", "un rendez-vous sans date n'a pas de sens")
doitLaisserPasser("", "phrase vide")
doitLaisserPasser("euh", "un mot isolé qui ne veut rien dire")

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
