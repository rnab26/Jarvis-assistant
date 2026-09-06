/**
 * Les applications d'IA déjà installées sur son téléphone — ses
 * « connecteurs », et la favorite pour les recherches.
 *
 * SA DEMANDE, 5 sept. 2026, mot pour mot : « dans les paramètres on branche
 * toutes nos applications d'IA disponibles sur notre téléphone et on valide
 * une application favorite pour les recherches web. […] toujours à l'oral je
 * demande à Jarvis de faire une recherche et ça prend automatiquement
 * l'application enregistrée en favorite ou bien si je mentionne le nom d'une
 * autre application ça lance via l'application citée. » Et, deux lignes plus
 * loin : « en vrai on peut même le faire pour toutes les applis ».
 *
 * CE QU'IL FAUT COMPRENDRE POUR NE PAS SE TROMPER DE TRAVAIL : il n'y a
 * AUCUNE clé à brancher, et « connecter » ne veut rien dire techniquement.
 * Android n'offre à aucune application le moyen d'interroger le compte d'une
 * autre, et l'abonnement grand public de Perplexity ne donne pas accès à son
 * API (vérifié le 5 sept. : les crédits d'API inclus dans Pro ont été
 * retirés). Ce qui marche, et qui est gratuit, c'est d'ENVOYER la question à
 * l'application par un intent Android — ce que `ask_ai` fait déjà pour
 * n'importe quelle application installée.
 *
 * Ce module ne crée donc AUCUN état inventé. Il fait deux choses : il
 * RECONNAÎT les applications d'IA parmi celles qui sont installées, pour
 * pouvoir les montrer au lieu de laisser Raphaël deviner ce qui marche ; et
 * il dit la phrase à prononcer pour chacune. La seule chose enregistrée est
 * la favorite, dans la clé qui existait déjà (`jarvis_app_ia`) — pas une
 * seconde.
 *
 * Module PUR. Vérifié par scripts/verifier-apps-ia.ts.
 */

export interface AppIAConnue {
  /** Le paquet Android, quand on le connaît. */
  paquet: string
  /** Le nom sous lequel elle se dit. */
  nom: string
}

/**
 * Celles qu'on sait reconnaître. La liste sert à les METTRE EN AVANT, jamais
 * à limiter : n'importe quelle application installée peut être choisie, et
 * c'est explicitement ce qu'il a demandé.
 */
export const APPS_IA_CONNUES: AppIAConnue[] = [
  { paquet: "ai.perplexity.app.android", nom: "Perplexity" },
  { paquet: "com.openai.chatgpt", nom: "ChatGPT" },
  { paquet: "com.anthropic.claude", nom: "Claude" },
  { paquet: "com.google.android.apps.bard", nom: "Gemini" },
  { paquet: "com.microsoft.copilot", nom: "Copilot" },
  { paquet: "ai.mistral.chat", nom: "Le Chat" },
  { paquet: "ai.x.grok", nom: "Grok" },
  { paquet: "com.deepseek.chat", nom: "DeepSeek" },
]

function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export interface ApplicationVue {
  nom: string
  paquet: string
}

/**
 * Le tri : ce qui est une IA connue, et tout le reste.
 *
 * La reconnaissance se fait sur le PAQUET d'abord — c'est lui qui ne ment pas.
 * Le nom affiché sert de second recours : une application peut se nommer
 * autrement selon la langue du téléphone, et un fabricant peut redistribuer
 * la même sous un autre paquet.
 */
export function trierAppsIA(installees: ApplicationVue[]): {
  ia: ApplicationVue[]
  autres: ApplicationVue[]
} {
  const paquets = new Set(APPS_IA_CONNUES.map((a) => a.paquet.toLowerCase()))
  const noms = APPS_IA_CONNUES.map((a) => aplatir(a.nom))

  const ia: ApplicationVue[] = []
  const autres: ApplicationVue[] = []
  for (const app of installees) {
    const p = app.paquet.toLowerCase()
    const n = aplatir(app.nom)
    const connue = paquets.has(p) || noms.some((m) => m.length > 2 && n === m)
    if (connue) ia.push(app)
    else autres.push(app)
  }
  // Dans l'ordre de la liste connue, pour que l'affichage ne change pas d'un
  // téléphone à l'autre ni d'un lancement à l'autre.
  const rang = (a: ApplicationVue) => {
    const i = APPS_IA_CONNUES.findIndex(
      (c) => c.paquet.toLowerCase() === a.paquet.toLowerCase() || aplatir(c.nom) === aplatir(a.nom),
    )
    return i === -1 ? APPS_IA_CONNUES.length : i
  }
  ia.sort((a, b) => rang(a) - rang(b))
  autres.sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
  return { ia, autres }
}

/** La phrase à dire pour viser cette application-là, nommément. */
export function exemplePour(nom: string): string {
  return `« Jarvis, cherche le prix du grès cérame sur ${nom} »`
}

/** Et celle qui part vers la favorite, sans avoir à la nommer. */
export const EXEMPLE_FAVORITE = "« Jarvis, cherche le prix du grès cérame »"

/**
 * Ce que la carte dit, selon ce qu'on a trouvé.
 *
 * Trois situations distinctes, et il faut les trois : on ne peut pas
 * regarder (hors de l'app), on a regardé et il n'y a rien, on a trouvé.
 * Rendre une liste vide dans le premier cas ferait dire « tu n'as aucune
 * application d'IA » alors qu'on n'a pas regardé — c'est exactement l'erreur
 * que `repertoire.ts` évite pour les contacts.
 */
export type EtatConnecteurs =
  | { etat: "hors_app" }
  | { etat: "aucune"; autres: number }
  | { etat: "trouvees"; ia: ApplicationVue[]; autres: ApplicationVue[] }

export function etatConnecteurs(installees: ApplicationVue[] | null): EtatConnecteurs {
  if (installees === null) return { etat: "hors_app" }
  const { ia, autres } = trierAppsIA(installees)
  if (ia.length === 0) return { etat: "aucune", autres: autres.length }
  return { etat: "trouvees", ia, autres }
}

/** Le filtre du choix « une autre application » : accents et casse ne
 * comptent pas, comme partout ailleurs dans l'app. */
export function filtrerApps(apps: ApplicationVue[], recherche: string): ApplicationVue[] {
  const cible = aplatir(recherche)
  if (!cible) return apps
  return apps.filter((a) => aplatir(a.nom).includes(cible))
}
