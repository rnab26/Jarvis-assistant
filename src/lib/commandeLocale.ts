// Import relatif avec extension : ce module doit rester chargeable par
// `node --experimental-strip-types` pour sa vérification, qui ne connaît
// pas l'alias « @/ » de Vite.
import { lireQuand, retirerMots, sansAccents } from "./dateOrale.ts"
import type { VoiceAction } from "@/lib/voiceActions"

/**
 * Comprendre une commande sans appeler de modèle de langage.
 *
 * Raphaël, le 3 sept. 2026 : « ce n'est pas vraiment de l'IA, c'est plus un
 * assistant qui va faire des commandes. Pour l'IA, je me connecte directement
 * sur une application IA. » Il a raison, et ça change l'architecture :
 * « ajoute une tâche pour le plombier » n'a besoin d'aucun modèle. Ces
 * formulations sont en nombre fini.
 *
 * Ce module les reconnaît sur l'appareil : gratuit, instantané, et il marche
 * même sans réseau et sans crédit chez qui que ce soit. Ce qu'il ne reconnaît
 * pas retombe sur la Edge Function, quand elle est disponible.
 *
 * RÈGLE DE CONCEPTION, à tenir : ce module ne devine JAMAIS. Une phrase qu'il
 * comprend à moitié, il la rend à l'appelant (null) plutôt que d'exécuter une
 * approximation. Une tâche créée sous un mauvais titre coûte plus cher à
 * réparer qu'une commande non comprise, qu'il suffit de redire.
 */

export interface TacheConnue {
  id: string
  title: string
  notes?: string | null
  status?: string
}

export interface ChantierConnu {
  id: string
  title: string
  notes?: string | null
}

export interface ContexteLocal {
  taches: TacheConnue[]
  chantiers: ChantierConnu[]
  /** Injecté pour que les tests ne dépendent pas du jour où ils tournent. */
  maintenant?: Date
}

/** Les mots de politesse et d'adresse, qui n'apportent rien à la commande. */
const AMORCES = [
  "jarvis",
  "s'il te plait",
  "s'il te plait",
  "steuplait",
  "dis",
  "eh",
  "hey",
  "alors",
  "bon",
  "est-ce que tu peux",
  "tu peux",
  "peux-tu",
  "il faut que tu",
  "il faudrait",
  "je voudrais que tu",
  "je veux que tu",
]

function nettoyer(phrase: string): string {
  let texte = sansAccents(phrase).replace(/[?!.]+$/g, "").trim()
  let change = true
  while (change) {
    change = false
    for (const amorce of AMORCES) {
      const motif = new RegExp(`^${amorce}\\b[\\s,]*`)
      if (motif.test(texte)) {
        texte = texte.replace(motif, "").trim()
        change = true
      }
    }
  }
  return texte
}

/** Score de ressemblance entre ce qui est dit et un titre existant. */
function correspond(cible: string, titre: string, notes?: string | null): number {
  const t = sansAccents(titre)
  const c = sansAccents(cible)
  if (!c) return 0
  if (t === c) return 100
  if (t.includes(c)) return 80
  if (c.includes(t)) return 70

  const motsCible = c.split(" ").filter((m) => m.length > 3)
  if (motsCible.length === 0) return 0
  const dansTitre = motsCible.filter((m) => t.includes(m)).length
  const dansNotes = notes
    ? motsCible.filter((m) => sansAccents(notes).includes(m)).length
    : 0
  // Les notes comptent moins que le titre : elles sont plus longues, donc
  // plus faciles à toucher par hasard.
  return (dansTitre / motsCible.length) * 60 + (dansNotes / motsCible.length) * 20
}

function meilleur<T extends { title: string; notes?: string | null }>(
  cible: string,
  candidats: T[],
): T | null {
  let gagnant: T | null = null
  let score = 0
  for (const c of candidats) {
    const s = correspond(cible, c.title, c.notes)
    if (s > score) {
      score = s
      gagnant = c
    }
  }
  // En dessous, la correspondance relève de la coïncidence : on préfère
  // rendre la main plutôt que de modifier la mauvaise ligne.
  return score >= 50 ? gagnant : null
}

/**
 * Un titre de tâche ne garde ni l'amorce de commande qui le précède, ni la
 * ponctuation laissée par le retrait de la date. « une tâche pour demain :
 * sortir les poubelles » donne « Sortir les poubelles », pas
 * « : sortir les poubelles » — on nettoie donc en boucle, chaque retrait
 * pouvant en exposer un autre.
 */
function titreDepuis(reste: string): string {
  let titre = reste.trim()
  let change = true
  while (change) {
    change = false
    for (const motif of [
      /^(?:de |d'|a |au |aux |pour |que |qu')/i,
      /^(?:je dois|il faut|il faudrait)\s+/i,
      /^[\s:;,.–—-]+/,
    ]) {
      const apres = titre.replace(motif, "").trim()
      if (apres !== titre) {
        titre = apres
        change = true
      }
    }
  }
  return titre
}

/**
 * Traduit une phrase en actions, ou renvoie null si elle sort de ce que les
 * règles savent lire.
 */
export function interpreterLocalement(
  phrase: string,
  ctx: ContexteLocal,
): VoiceAction[] | null {
  const texte = nettoyer(phrase)
  if (!texte) return null
  const maintenant = ctx.maintenant ?? new Date()

  /* ---------- La voix ---------- */
  if (/^(coupe|arrete|stoppe)( ta| la)? voix\b/.test(texte) ||
      /^(tais-toi pour de bon|ne parle plus|arrete de parler)\b/.test(texte) ||
      /^reponds?(-moi)? (juste )?(a l'ecrit|par ecrit)\b/.test(texte)) {
    return [{ action: "set_voice", voice_enabled: false }]
  }
  if (/^(remets|rallume|reactive)( ta| la)? voix\b/.test(texte) ||
      /^(tu peux )?reparle[rz]?\b/.test(texte)) {
    return [{ action: "set_voice", voice_enabled: true }]
  }

  /* ---------- L'agenda ---------- */
  const parleAgenda = /\b(agenda|planning|rendez-vous|rdv|programme)\b/.test(texte)
  if (parleAgenda && /^(qu'est-ce que|quoi|c'est quoi|montre|liste|donne|j'ai quoi|qu'ai-je)/.test(texte)) {
    const { date } = lireQuand(texte, maintenant)
    if (date) {
      return [
        {
          action: "list_calendar_events",
          event_depuis: `${date}T00:00:00`,
          event_jusqu_a: `${date}T23:59:59`,
        },
      ]
    }
    return [{ action: "list_calendar_events" }]
  }
  if (/^(qu'est-ce que|qu'ai-je|j'ai quoi)\b.*\b(demain|aujourd'?hui|ce soir)\b/.test(texte) && !/\btache/.test(texte)) {
    const { date } = lireQuand(texte, maintenant)
    if (date) {
      return [
        {
          action: "list_calendar_events",
          event_depuis: `${date}T00:00:00`,
          event_jusqu_a: `${date}T23:59:59`,
        },
      ]
    }
  }

  const ajoutRdv = texte.match(
    /^(?:ajoute|cree|mets|note|prends?|programme|planifie)\s+(?:un |une |le |la |mon |ma )?(?:rendez-vous|rdv|reunion|evenement)\s*(.*)$/,
  )
  if (ajoutRdv) {
    const { date, heure, motsRetires } = lireQuand(ajoutRdv[1], maintenant)
    if (!date) return null // un rendez-vous sans date n'a pas de sens
    const titre = titreDepuis(retirerMots(ajoutRdv[1], motsRetires)) || "Rendez-vous"
    return [
      {
        action: "add_calendar_event",
        event_titre: titre.charAt(0).toUpperCase() + titre.slice(1),
        event_debut: heure ? `${date}T${heure}:00` : `${date}T09:00:00`,
        event_journee_entiere: false,
      },
    ]
  }

  /* ---------- Les chantiers du cockpit ---------- */
  if (/^(liste|montre|donne|quels sont|c'est quoi)\b.*\bchantiers?\b/.test(texte)) {
    return [{ action: "list_dev_items" }]
  }
  const ajoutChantier = texte.match(
    /^(?:ajoute|cree|note|nouveau|nouvelle)\s+(?:un |une |le |la )?chantier\s*:?\s*(.+)$/,
  )
  if (ajoutChantier) {
    const titre = titreDepuis(ajoutChantier[1])
    if (!titre) return null
    return [{ action: "add_dev_item", title: titre.charAt(0).toUpperCase() + titre.slice(1) }]
  }

  /* ---------- Les tâches ---------- */
  if (/^(liste|montre|donne|c'est quoi|quelles sont)\b.*\b(taches?|a faire)\b/.test(texte) ||
      /^(qu'est-ce que j'ai a faire|j'ai quoi a faire)\b/.test(texte)) {
    return [{ action: "list_tasks", filter_status: "todo" }]
  }

  const fait = texte.match(
    /^(?:marque|passe|mets|coche)\s+(?:la tache\s+)?(.+?)\s+(?:comme\s+)?(?:faite?|terminee?|finie?|ok)\b/,
  )
  if (fait) {
    const tache = meilleur(fait[1], ctx.taches)
    if (!tache) return null
    return [{ action: "update_task", task_id: tache.id, changes: { status: "done" } }]
  }

  const suppr = texte.match(/^(?:supprime|efface|enleve|annule)\s+(?:la\s+)?tache\s+(.+)$/)
  if (suppr) {
    const tache = meilleur(suppr[1], ctx.taches)
    if (!tache) return null
    return [{ action: "delete_task", task_id: tache.id }]
  }

  const ajoutTache = texte.match(
    /^(?:ajoute|cree|note|rappelle-moi|pense a|il faut que je|je dois)\s*(?:une |la |le |de |d')?\s*(?:tache\s*:?\s*)?(.+)$/,
  )
  if (ajoutTache) {
    // « note que Dylan est le client de Melissa » est une information sur
    // quelqu'un, pas une tâche : le module ne s'en occupe pas.
    if (/^que\b/.test(ajoutTache[1])) return null

    const { date, heure, motsRetires } = lireQuand(ajoutTache[1], maintenant)
    const titre = titreDepuis(retirerMots(ajoutTache[1], motsRetires))
    if (!titre || titre.length < 2) return null
    // Une phrase longue mérite le découpage titre/notes que fait le modèle :
    // on ne bricole pas un résumé ici.
    if (titre.split(" ").length > 12) return null

    return [
      {
        action: "add_task",
        title: titre.charAt(0).toUpperCase() + titre.slice(1),
        due_date: date,
        due_time: heure,
      },
    ]
  }

  return null
}
