/**
 * La mémoire de travail : ce qu'on vient de se dire part avec chaque phrase.
 *
 *   node --experimental-strip-types scripts/verifier-memoire-de-travail.ts
 *
 * Aucun réseau. Ce qui compte le plus ici est ce qui NE part PAS : un vieux
 * sujet, une ligne vide, un bloc de consigne sans contenu. Le comportement du
 * modèle avec ces échanges se vérifie à part, contre le vrai modèle, par les
 * cas « il se souvient » de verifier-commande-vocale.mjs.
 */
import {
  FENETRE_MS,
  TOURS_MAX,
  ajouterTour,
  decrireActions,
  toursPourLeServeur,
  type TourMemorise,
} from "../src/lib/memoireDeTravail.ts"
import { blocDerniersTours } from "../supabase/functions/_shared/derniersTours.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const T0 = 1_800_000_000_000
const tour = (dit: string, at: number, fait: string[] = [], repondu: string | null = null): TourMemorise => ({
  dit,
  fait,
  repondu,
  at,
})

// ── Ce qui est gardé ──
{
  let tours: TourMemorise[] = []
  tours = ajouterTour(tours, tour("lance un épisode de la série H sur YouTube", T0), T0)
  tours = ajouterTour(tours, tour("lance le premier épisode", T0 + 30_000), T0 + 30_000)
  const envoyes = toursPourLeServeur(tours, T0 + 40_000)
  verifier("deux tours récents partent, dans l'ordre", envoyes.length === 2 && envoyes[0].dit.startsWith("lance un épisode"), JSON.stringify(envoyes))
  verifier("l'âge est relatif, en secondes", envoyes[0].il_y_a_s === 40 && envoyes[1].il_y_a_s === 10, JSON.stringify(envoyes))
}
{
  let tours: TourMemorise[] = []
  tours = ajouterTour(tours, tour("sujet de la matinée", T0), T0)
  const plusTard = T0 + FENETRE_MS + 1000
  verifier("un tour de plus de dix minutes ne part plus", toursPourLeServeur(tours, plusTard).length === 0)
  tours = ajouterTour(tours, tour("nouvelle demande", plusTard), plusTard)
  verifier("…et il est oublié au tour suivant", tours.length === 1 && tours[0].dit === "nouvelle demande", JSON.stringify(tours))
}
{
  let tours: TourMemorise[] = []
  for (let i = 0; i < TOURS_MAX + 4; i++) tours = ajouterTour(tours, tour(`phrase ${i}`, T0 + i * 1000), T0 + i * 1000)
  const envoyes = toursPourLeServeur(tours, T0 + 20_000)
  verifier(`au plus ${TOURS_MAX} tours, les plus récents`, envoyes.length === TOURS_MAX && envoyes.at(-1)?.dit === `phrase ${TOURS_MAX + 3}`, JSON.stringify(envoyes.map((e) => e.dit)))
}
verifier("une phrase vide n'est pas un tour", ajouterTour([], tour("   ", T0), T0).length === 0)
{
  const long = "mot ".repeat(200)
  const e = toursPourLeServeur([tour(long, T0)], T0)
  verifier("une phrase très longue est coupée au mot", e[0].dit.length <= 300 && e[0].dit.endsWith("…"), String(e[0].dit.length))
}

// ── Ce qui a été fait, en clair ──
{
  const d = decrireActions([
    { action: "add_task", title: "Rappeler la société Easy", due_date: "2026-09-17", due_time: "11:00", task_id: null },
    { action: "update_task", task_id: "t-1", changes: { category_id: "cat-perso" } },
    { action: "open_app", app_name: "YouTube", music_query: "série H" },
  ])
  verifier("le titre se lit", d[0].includes("title=« Rappeler la société Easy »"), d[0])
  verifier("une modification dit ce qui change ET quelle ligne", d[1].includes("changes=") && d[1].includes("task_id=t-1"), d[1])
  verifier("une app lancée dit l'app et la recherche", d[2].includes("app_name=« YouTube »") && d[2].includes("music_query=« série H »"), d[2])
  verifier("le message d'un clarify n'y est pas (il est dans la réponse)", !decrireActions([{ action: "clarify", message: "Pour quand ?" }])[0].includes("Pour quand"))
}

// ── Le bloc côté serveur ──
verifier("rien de récent : le serveur n'ajoute RIEN, pas même un titre", blocDerniersTours([]) === "" && blocDerniersTours(undefined) === "")
verifier("un corps mal formé ne casse rien", blocDerniersTours("n'importe quoi") === "" && blocDerniersTours([null, 3, { dit: "" }]) === "")
{
  const tours = [
    tour("lance un épisode de la série H sur YouTube", T0, ["open_app (app_name=« YouTube », music_query=« série H »)"], "Je lance série H sur YouTube."),
  ]
  const bloc = blocDerniersTours(toursPourLeServeur(tours, T0 + 20_000))
  verifier("ce que l'app envoie, le serveur le lit", bloc.includes("« lance un épisode de la série H sur YouTube »") && bloc.includes("open_app") && bloc.includes("Je lance série H"), bloc)
  verifier("le bloc interdit de refaire une action déjà faite", bloc.includes("ne REFAIS JAMAIS"), bloc)
  verifier("…et de rattacher de force une nouvelle demande", bloc.includes("NOUVELLE demande"), bloc)
  verifier("« à l'instant » sous la minute", bloc.includes("à l'instant"), bloc)
}
{
  const trop = Array.from({ length: 20 }, (_, i) => ({ il_y_a_s: 10, dit: `phrase ${i}`, fait: [], repondu: null }))
  const bloc = blocDerniersTours(trop)
  verifier("le serveur borne lui-même à six tours", (bloc.match(/il a dit/g) ?? []).length === 6, bloc)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
