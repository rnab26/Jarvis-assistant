/**
 * Jarvis constate ses propres échecs — et surtout, il se tait le reste du temps.
 *
 *   node --experimental-strip-types scripts/verifier-retours.ts
 *
 * Aucun réseau. Ce contrôle porte sur la DÉCISION (src/lib/retours.ts), la
 * seule partie qui peut être fausse en silence : un détecteur trop large
 * remplit le registre des erreurs avec le fonctionnement normal du dialogue —
 * et un registre bruyant n'est plus lu du tout, ce qui est exactement pire que
 * pas de détecteur. La moitié des contrôles ci-dessous vérifie donc le
 * SILENCE, pas la détection.
 */
import {
  cibleDeLAction,
  echecDeLAction,
  echecSignalePar,
  estUnePlainte,
  estUneRedite,
  themeDeLAction,
  type TourJarvis,
} from "../src/lib/retours.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const T0 = 1_757_000_000_000
const tour = (p: Partial<TourJarvis> = {}): TourJarvis => ({
  transcript: "Mets-moi la musique de Booba, Dolce Camara.",
  actions: ["open_app"],
  cible: "Apple Music",
  reponse: "J'ouvre Apple Music.",
  at: T0,
  ...p,
})

// --- Ce qu'il doit ENTENDRE ------------------------------------------------
// La phrase de l'exemple vécu de Raphaël, mot pour mot.
verifier(
  "« tu n'as pas lancé la musique que je t'ai demandée » est une plainte",
  estUnePlainte("Tu n'as pas lancé la musique que je t'ai demandée"),
)
verifier("« ça n'a pas marché » aussi", estUnePlainte("Ça n'a pas marché"))
verifier("« ça ne fonctionne pas » aussi", estUnePlainte("Ça ne fonctionne pas"))
verifier("« ce n'est pas ce que je t'ai demandé » aussi", estUnePlainte("Ce n'est pas ce que je t'ai demandé"))
verifier("« tu t'es trompé » aussi", estUnePlainte("Tu t'es trompé"))
verifier(
  "sans apostrophe ni accent, comme la reconnaissance vocale les rend souvent",
  estUnePlainte("tu nas pas lance la musique") && estUnePlainte("ca marche pas"),
)

// --- Ce sur quoi il doit se TAIRE ------------------------------------------
verifier(
  "« non » tout seul n'est PAS une plainte",
  !estUnePlainte("Non") && !estUnePlainte("non non"),
  "un « non » sec répond presque toujours à une question de précision : le compter remplirait le registre de bruit",
)
verifier(
  "« Non, c'est la villa Dan » non plus",
  !estUnePlainte("Non, c'est la villa Dan"),
  "c'est une réponse à une question de Jarvis, le dialogue normal",
)
verifier(
  "une demande ordinaire non plus",
  !estUnePlainte("Ajoute une tâche : rappeler le plombier") && !estUnePlainte("Quelles sont mes tâches ?"),
)
verifier(
  "et une phrase qui parle d'un échec SANS le reprocher non plus",
  !estUnePlainte("Le chantier de la villa n'avance pas"),
  "« n'avance pas » n'est pas « ça ne marche pas » : c'est un sujet, pas un reproche",
)

// --- La redite -------------------------------------------------------------
verifier(
  "la même demande redite compte comme une redite",
  estUneRedite("Mets-moi la musique de Booba Dolce Camara", "Mets la musique de Booba Dolce Camara"),
)
verifier(
  "deux demandes voisines mais différentes, NON",
  !estUneRedite("Ajoute une tâche : rappeler le plombier", "Ajoute une tâche : rappeler le dentiste"),
  "sinon deux tâches ajoutées d'affilée passeraient pour un échec",
)
verifier(
  "une phrase qui PRÉCISE la précédente n'est pas une redite",
  !estUneRedite("Mets la musique", "Mets la musique de Booba, l'album Dolce Camara, sur Apple Music"),
  "le recouvrement est rapporté au plus LONG des deux : une précision n'est pas une redite",
)
verifier(
  "une phrase trop courte ne peut pas être une redite",
  !estUneRedite("oui", "oui") && !estUneRedite("merci", "merci beaucoup"),
  "moins de trois mots utiles, il n'y a rien à comparer",
)

// --- L'attribution : à quel tour la plainte se rapporte ---------------------
verifier(
  "une plainte sans tour précédent ne signale rien",
  echecSignalePar("Tu n'as pas lancé la musique", null, T0 + 5_000) === null,
)
verifier(
  "une plainte trois minutes trop tard non plus",
  echecSignalePar("Tu n'as pas lancé la musique", tour(), T0 + 4 * 60_000) === null,
  "au-delà, il a pu changer d'écran ou de sujet : on n'accuse pas au hasard",
)
verifier(
  "une phrase ordinaire après un tour réussi ne signale rien",
  echecSignalePar("Quelles sont mes tâches ?", tour(), T0 + 5_000) === null,
  "c'est LE cas courant : le silence est la bonne réponse",
)
verifier(
  "une redite après une QUESTION de Jarvis ne signale rien",
  echecSignalePar("Mets la musique de Booba Dolce Camara", tour({ actions: ["clarify"] }), T0 + 10_000) === null,
  "il vient de demander une précision, on la lui donne : c'est le dialogue normal",
)

// --- L'échec de l'exemple vécu ---------------------------------------------
{
  const e = echecSignalePar("Tu n'as pas lancé la musique que je t'ai demandée", tour(), T0 + 8_000)
  verifier("l'exemple vécu de Raphaël est bien détecté", e !== null)
  verifier("classé en « action » : il avait compris, il a mal fait", e?.categorie === "action", JSON.stringify(e))
  verifier("rangé dans « Le téléphone »", e?.theme === "Le téléphone", e?.theme)
  verifier(
    "la phrase dictée est gardée en preuve",
    !!e?.contexte.includes("Dolce Camara") && !!e?.contexte.includes("Tu n'as pas"),
    e?.contexte,
  )
  verifier(
    "et ce que Jarvis avait répondu aussi",
    !!e?.detail?.includes("J'ouvre Apple Music"),
    e?.detail ?? "(rien)",
  )
}

// --- LE contrôle qui porte la demande de Raphaël : « par contexte, pas par
// phrase ». Deux échecs sur la même famille et la même cible doivent porter le
// MÊME titre — c'est lui qui fait l'empreinte de regroupement côté base, donc
// c'est lui qui décide si dix échecs font une ligne ou dix.
{
  const a = echecSignalePar("Tu n'as pas lancé la musique", tour(), T0 + 5_000)
  const b = echecSignalePar(
    "Ça n'a pas marché",
    tour({ transcript: "Joue-moi du Aya Nakamura", at: T0 + 600_000 }),
    T0 + 605_000,
  )
  verifier(
    "deux échecs différents sur la même famille et la même cible font UNE ligne",
    !!a && !!b && a.titre === b.titre,
    `${a?.titre}\n      ${b?.titre}`,
  )
  const c = echecSignalePar(
    "Tu n'as pas lancé la musique",
    tour({ cible: "Spotify", at: T0 + 600_000 }),
    T0 + 605_000,
  )
  verifier(
    "mais deux applications différentes restent deux lignes",
    !!a && !!c && a.titre !== c.titre,
    `${a?.titre}\n      ${c?.titre}`,
  )
}

// --- Compréhension contre action -------------------------------------------
{
  const e = echecSignalePar(
    "Ce n'est pas ce que je t'ai demandé",
    tour({ actions: ["unknown"], cible: null, reponse: "Je n'ai pas compris." }),
    T0 + 5_000,
  )
  verifier(
    "un tour qui n'a rien exécuté est classé « comprehension »",
    e?.categorie === "comprehension",
    JSON.stringify(e),
  )
  verifier("et rangé dans « Voix et écoute »", e?.theme === "Voix et écoute", e?.theme)
}

// --- L'échec certain : l'action a levé --------------------------------------
{
  const e = echecDeLAction("send_message", "WhatsApp", "Envoie un message à Mel", new Error("Aucune application"))
  verifier("une action qui lève est classée « action »", e.categorie === "action")
  verifier("son message technique est gardé", e.detail === "Aucune application", e.detail ?? "")
  verifier("et elle est rangée dans « Messagerie et agenda »", e.theme === "Messagerie et agenda", e.theme)
}

// --- Les thèmes sont ceux qui EXISTENT déjà dans son cockpit ----------------
{
  const CONNUS = new Set([
    "Le téléphone",
    "Messagerie et agenda",
    "Voix et écoute",
    "L'app elle-même",
  ])
  const familles = [
    "open_app", "media_control", "navigate_to", "set_alarm", "make_call",
    "send_message", "add_calendar_event", "list_calendar_events",
    "chat", "clarify", "unknown", "",
    "add_task", "add_dev_item", "save_document", "add_pronunciation", "n_importe_quoi",
  ]
  verifier(
    "aucune famille d'action n'invente un thème qui n'existe pas",
    familles.every((f) => CONNUS.has(themeDeLAction(f))),
    familles.map((f) => `${f} → ${themeDeLAction(f)}`).join(", "),
    // Un thème « presque » identique éparpille le sujet au lieu de le
    // rassembler : c'est une consigne explicite de Raphaël.
  )
}

// --- La cible : ce qui distingue deux échecs de la même famille ------------
verifier(
  "l'application visée sert de cible",
  cibleDeLAction({ action: "open_app", app_name: "Apple Music" }) === "Apple Music",
)
verifier(
  "le contact aussi",
  cibleDeLAction({ action: "send_message", contact_name: "Mel" }) === "Mel",
)
verifier(
  "mais PAS le titre d'une tâche",
  cibleDeLAction({ action: "add_task", title: "Rappeler le plombier" }) === null,
  "un titre change à chaque phrase : le prendre pour cible ferait une ligne de registre par échec",
)
verifier(
  "ni une action sans cible, ni rien du tout",
  cibleDeLAction({ action: "list_tasks" }) === null && cibleDeLAction(null) === null,
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
