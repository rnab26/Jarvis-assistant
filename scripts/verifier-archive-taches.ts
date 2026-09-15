/**
 * Vérifie le rangement des tâches terminées dans l'archive de leur catégorie.
 *
 *   node --experimental-strip-types scripts/verifier-archive-taches.ts
 *
 * Chantiers 20435f77 / 7c37b6b0, 15 sept. 2026. Ses mots : « plutôt qu'elle
 * reste dans la liste de tâches et que ca pollue visuellement je veux quil
 * y'a une section archives dans les différentes listes de taches ».
 *
 * CE QUI EST EN JEU, et pourquoi la moitié de ces contrôles vérifie ce qu'on
 * ne range PAS : une tâche qui sortirait de la liste sans entrer dans
 * l'archive disparaîtrait pour de bon — il n'y a pas de corbeille pour les
 * tâches. Le premier contrôle est donc un compte : tout ce qui entre ressort
 * d'un côté ou de l'autre, jamais nulle part.
 */
import {
  archivesOuvertes,
  libelleArchive,
  phraseArchivee,
  phraseCategorieSoldee,
  phraseRemiseAFaire,
  repartir,
  type TacheRangeable,
} from "../src/lib/archiveTaches.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

interface T extends TacheRangeable {
  id: string
}
const t = (id: string, status: string, updated_at?: string, enAttente?: boolean): T => ({
  id,
  status,
  updated_at: updated_at ?? null,
  ...(enAttente === undefined ? {} : { enAttente }),
})

// ── RIEN NE SE PERD ───────────────────────────────────────────────────────
{
  const taches = [
    t("a", "todo"), t("b", "done", "2026-09-10T10:00:00Z"), t("c", "todo"),
    t("d", "done", "2026-09-12T10:00:00Z"), t("e", "todo", null ?? undefined, true),
  ]
  const { aFaire, archivees } = repartir(taches)
  verifier(
    "tout ce qui entre ressort d'un côté ou de l'autre",
    aFaire.length + archivees.length === taches.length,
    `${aFaire.length} + ${archivees.length} au lieu de ${taches.length}`,
  )
  verifier(
    "aucune tâche des deux côtés à la fois",
    new Set([...aFaire, ...archivees].map((x) => x.id)).size === taches.length,
  )
}

// ── Ce qui part à l'archive, et ce qui reste ─────────────────────────────
{
  const { aFaire, archivees } = repartir([t("a", "todo"), t("b", "done")])
  verifier("une tâche cochée quitte la liste", aFaire.map((x) => x.id).join() === "a")
  verifier("et se retrouve dans l'archive", archivees.map((x) => x.id).join() === "b")
}

verifier(
  "l'ordre de la liste à faire n'est PAS retouché",
  repartir([t("z", "todo"), t("a", "todo"), t("m", "todo")]).aFaire.map((x) => x.id).join() === "z,a,m",
  "elle arrive déjà triée par échéance (useTasks) : la retrier ici ferait deux ordres différents",
)

verifier(
  "la dernière cochée est en tête de l'archive",
  repartir([
    t("vieille", "done", "2026-09-01T10:00:00Z"),
    t("recente", "done", "2026-09-14T10:00:00Z"),
    t("moyenne", "done", "2026-09-07T10:00:00Z"),
  ]).archivees.map((x) => x.id).join() === "recente,moyenne,vieille",
  "c'est la seule qu'il vient peut-être de cocher par erreur : elle doit être atteignable sans défiler",
)

verifier(
  "une archivée sans date de mise à jour ne fait pas planter le tri",
  repartir([t("sans", "done"), t("avec", "done", "2026-09-14T10:00:00Z")])
    .archivees.map((x) => x.id).join() === "avec,sans",
)

// ── LE SILENCE : ce qu'on ne range PAS ───────────────────────────────────
verifier(
  "une dictée hors ligne n'est JAMAIS archivée, même marquée faite",
  repartir([t("f", "done", "2026-09-14T10:00:00Z", true)]).aFaire.map((x) => x.id).join() === "f",
  "elle n'existe pas en base : la replier dans un dépliant la rendrait invisible",
)

verifier(
  "un statut inconnu reste à faire plutôt que de disparaître",
  repartir([t("x", "en_cours")]).aFaire.length === 1,
)

verifier(
  "aucune terminée : l'archive est vide, pas absente",
  repartir([t("a", "todo")]).archivees.length === 0,
)

// ── Ce qu'on écrit ───────────────────────────────────────────────────────
verifier("une seule terminée : au singulier", libelleArchive(1) === "1 terminée")
verifier("plusieurs : au pluriel", libelleArchive(3) === "3 terminées")

verifier(
  "une catégorie soldée le dit",
  phraseCategorieSoldee(2) === "Tout est fait ici.",
)
verifier(
  "une catégorie sans rien du tout ne dit RIEN",
  phraseCategorieSoldee(0) === null,
  "la carte n'a alors aucune raison d'exister ; écrire « tout est fait » sur du vide serait faux",
)

verifier(
  "le mot qui suit une coche nomme la tâche",
  phraseArchivee("Appeler Amir").includes("Appeler Amir"),
  "sans le nom, il ne peut pas repérer qu'il a coché la mauvaise ligne",
)
verifier(
  "et il ne dit pas « supprimée »",
  !/supprim/i.test(phraseArchivee("Appeler Amir")),
  "rien n'est supprimé : le dire ferait croire à une perte",
)
verifier(
  "décocher le dit aussi, et dans l'autre sens",
  phraseRemiseAFaire("Appeler Amir") === "« Appeler Amir » est de nouveau à faire",
)

// ── Le réglage ───────────────────────────────────────────────────────────
verifier(
  "jamais choisi = replié, ce qu'il a demandé",
  archivesOuvertes(null) === false,
  "« ça pollue visuellement » : le défaut ne peut pas être « tout montrer »",
)
verifier("choisi = déplié", archivesOuvertes("1") === true)
verifier("une valeur héritée ne vaut pas « déplié »", archivesOuvertes("0") === false)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
