/**
 * La mémoire de travail de Jarvis : ce qu'on vient de se dire, envoyé avec
 * chaque phrase (chantier e006d555 — « réfléchir comme l'utilisateur », et
 * a67ac63d — « on a un contexte, faut qu'il comprenne tout seul comme un
 * humain »).
 *
 * MESURÉ sur ses 409 vraies dictées avant d'écrire une ligne : `voice-command`
 * ne recevait QUE la phrase courante. Chaque phrase qui renvoyait à la
 * précédente tombait donc dans le vide :
 *
 *   17/09 14:53  « lance un épisode de la série H sur YouTube »
 *                « Lance le premier épisode disponible sur YouTube »
 *                → recherche YouTube « Le premier episode disponible »
 *   18/09 10:20  « Classer et ordonner les deux chantiers créés à l'instant »
 *   22/09 10:45  « mettre à jour le message programmé pour Harry avec le
 *                  contact trouvé »
 *   23/09 10:09  « pourquoi tu n'as pas ouvert le chantier ? »
 *                → « Je ne suis pas sûr de quel chantier tu parles. »
 *
 * Et une dizaine de correctifs du projet compensaient chacun UN cas de ce même
 * trou (la tâche en attente de catégorie, la confirmation d'un envoi, la
 * reprise d'une dictée coupée…). Ils restent — ils décident sur l'appareil,
 * sans aller-retour —, mais le modèle n'est plus aveugle pour tout le reste.
 *
 * Pur, sans réseau (`scripts/verifier-memoire-de-travail.ts`). Rien n'est
 * écrit nulle part : c'est de la mémoire VIVE, perdue en fermant l'app, et
 * c'est voulu — la mémoire longue durée (`souvenirs`, `echanges`) existe déjà
 * pour le reste. Ici on ne garde que ce qu'une personne qui suit la
 * conversation aurait encore en tête.
 */

export interface TourMemorise {
  /** Ce qu'il a dit (ou la phrase reconstruite par l'app après une question). */
  dit: string
  /** Ce qui a été fait, en clair : « add_task « Rappeler Easy » ». */
  fait: string[]
  /** Ce que Jarvis a répondu ou dit en retour. */
  repondu: string | null
  at: number
}

/** Ce qui part au serveur, allégé et daté relativement. */
export interface TourEnvoye {
  il_y_a_s: number
  dit: string
  fait: string[]
  repondu: string | null
}

/** Au-delà, ce n'est plus « ce qu'on vient de se dire ». Dix minutes couvrent
 * ses rafales mesurées (sept « modifie la tâche » en deux minutes le 22 sept.,
 * douze chantiers dictés en vingt minutes le 17) sans faire resurgir un sujet
 * de la matinée dans une phrase de l'après-midi. */
export const FENETRE_MS = 10 * 60_000
/** Six tours : assez pour « les deux chantiers créés à l'instant », peu assez
 * pour ne pas alourdir une phrase qui pèse déjà ~45 000 caractères. */
export const TOURS_MAX = 6
/** Une phrase dictée tient presque toujours en dessous ; au-delà on coupe au
 * mot, sans perdre le début qui dit de quoi il s'agit. */
const LONGUEUR_MAX = 280

function extrait(texte: string, max = LONGUEUR_MAX): string {
  const plat = texte.replace(/\s+/g, " ").trim()
  if (plat.length <= max) return plat
  const coupe = plat.slice(0, max)
  const espace = coupe.lastIndexOf(" ")
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`
}

/** Les champs qui disent SUR QUOI une action a porté, dans l'ordre où on les
 * lit. Un identifiant seul ne dit rien à personne : le titre, le nom, l'app. */
const CHAMPS_PARLANTS = [
  "title",
  "contact_name",
  "app_name",
  "music_query",
  "destination",
  "question",
  "screen_target",
  "section_nom",
  "setting_cle",
  "setting_valeur",
  "event_titre",
  "event_cible",
  "mail_cible",
  "filename",
  "due_date",
  "due_time",
] as const

/** Ce qui a été fait, en une ligne par action, sans les identifiants ni les
 * messages (ceux-là sont dans `repondu`). */
export function decrireActions(actions: ReadonlyArray<Record<string, unknown>>): string[] {
  return actions.slice(0, 5).map((a) => {
    const nom = typeof a.action === "string" ? a.action : "?"
    const details: string[] = []
    for (const champ of CHAMPS_PARLANTS) {
      const v = a[champ]
      if (typeof v === "string" && v.trim()) details.push(`${champ}=« ${extrait(v, 80)} »`)
    }
    if (typeof a.message_text === "string" && a.message_text.trim()) {
      details.push(`message_text=« ${extrait(a.message_text, 120)} »`)
    }
    // Une modification dit CE QUI a changé : « mets-la plutôt dans Perso »
    // juste après doit pouvoir reprendre la même tâche.
    if (a.changes && typeof a.changes === "object") {
      details.push(`changes=${extrait(JSON.stringify(a.changes), 160)}`)
    }
    // Les identifiants ne se lisent pas, mais c'est eux qui désignent SANS
    // AMBIGUÏTÉ la ligne touchée — ils restent, en dernier.
    for (const id of ["task_id", "item_id", "note_id", "decision_id"]) {
      const v = a[id]
      if (typeof v === "string" && v) details.push(`${id}=${v}`)
    }
    return details.length ? `${nom} (${details.join(", ")})` : nom
  })
}

/** Ajoute un tour, oublie ce qui est trop ancien, garde les plus récents. */
export function ajouterTour(
  tours: ReadonlyArray<TourMemorise>,
  tour: TourMemorise,
  maintenant: number,
): TourMemorise[] {
  const dit = tour.dit.replace(/\s+/g, " ").trim()
  if (!dit) return toursRecents(tours, maintenant)
  return [...toursRecents(tours, maintenant), { ...tour, dit }].slice(-TOURS_MAX)
}

function toursRecents(tours: ReadonlyArray<TourMemorise>, maintenant: number): TourMemorise[] {
  return tours.filter((t) => maintenant - t.at <= FENETRE_MS && t.at <= maintenant)
}

/** Ce qui part avec la phrase : vide quand rien de récent — et alors le
 * serveur n'ajoute rien à sa consigne, pas même un titre. */
export function toursPourLeServeur(tours: ReadonlyArray<TourMemorise>, maintenant: number): TourEnvoye[] {
  return toursRecents(tours, maintenant)
    .slice(-TOURS_MAX)
    .map((t) => ({
      il_y_a_s: Math.max(0, Math.round((maintenant - t.at) / 1000)),
      dit: extrait(t.dit),
      fait: t.fait.slice(0, 5),
      repondu: t.repondu ? extrait(t.repondu) : null,
    }))
}
