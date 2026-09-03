// Import relatif avec extension : ce module doit rester chargeable par
// `node --experimental-strip-types` pour sa vérification, qui ne connaît
// pas l'alias « @/ » de Vite.
import { lireHeure, lireQuand, retirerMots, sansAccents } from "./dateOrale.ts"
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

export interface ContactConnu {
  id: string
  name: string
  phone?: string | null
}

export interface ContexteLocal {
  taches: TacheConnue[]
  chantiers: ChantierConnu[]
  contacts?: ContactConnu[]
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

/** Même principe que `meilleur`, mais sur un nom de personne plutôt qu'un
 * titre de tâche : pas de notes à consulter, la correspondance se joue sur
 * le nom seul. */
function meilleurContact(cible: string, contacts: ContactConnu[]): ContactConnu | null {
  let gagnant: ContactConnu | null = null
  let score = 0
  for (const c of contacts) {
    const s = correspond(cible, c.name)
    if (s > score) {
      score = s
      gagnant = c
    }
  }
  return score >= 50 ? gagnant : null
}

function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1)
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
 * Découpe une dictée longue en un titre court et une note complète.
 *
 * Ses phrases réelles ressemblent à « rajoute un chantier pour un problème de
 * micro à chaque fois qu'on termine une phrase il faut que je réappuie ».
 * Un modèle en tirerait un titre élégant ; ici on ne prétend pas faire aussi
 * bien. On prend les premiers mots comme titre et on garde TOUT dans la note :
 * rien n'est perdu, rien n'est inventé, et un titre à retoucher coûte moins
 * cher qu'une demande qui n'aboutit pas du tout.
 */
const MOTS_TITRE_COURT = 12
const MOTS_TITRE_TRONQUE = 8

function decouper(phrase: string): { titre: string; notes: string | null } {
  const mots = phrase.split(" ").filter(Boolean)
  const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

  if (mots.length <= MOTS_TITRE_COURT) {
    return { titre: majuscule(phrase), notes: null }
  }
  // Un titre ne se termine pas sur un mot-outil : « Un problème de micro à
  // chaque fois qu'on » se lit mal dans une liste. On recule jusqu'au dernier
  // mot porteur de sens.
  const OUTILS = new Set([
    "a", "au", "aux", "de", "du", "des", "la", "le", "les", "un", "une",
    "et", "ou", "que", "qu'on", "qu'il", "qui", "en", "pour", "dans", "sur",
    "avec", "il", "elle", "je", "ce", "cette", "mon", "ma", "mes", "son",
  ])
  const coupe = mots.slice(0, MOTS_TITRE_TRONQUE)
  while (coupe.length > 3 && OUTILS.has(coupe[coupe.length - 1])) coupe.pop()

  return {
    titre: majuscule(coupe.join(" ")),
    notes: phrase.charAt(0).toUpperCase() + phrase.slice(1),
  }
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
    /^(?:ajoute|rajoute|cree|mets|note|prends?|programme|planifie)\s+(?:un |une |le |la |mon |ma )?(?:rendez-vous|rdv|reunion|evenement)\s*(.*)$/,
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
  // « rajoute » plutôt qu'« ajoute », « dans les chantiers à développer… » :
  // ce sont ses tournures réelles, relevées dans la table `echanges` le
  // 3 sept. plutôt que devinées.
  const ajoutChantier = texte.match(
    /^(?:(?:dans (?:les|mes) (?:chantiers|taches de developpement)[^,]*,?\s*)?(?:ajoute|rajoute|cree|note|nouveau|nouvelle))\s+(?:un |une |le |la )?(?:chantier|tache de developpement)\s*(?:a traiter\s*)?:?\s*(.+)$/,
  )
  if (ajoutChantier) {
    const brut = titreDepuis(ajoutChantier[1])
    if (!brut || brut.length < 3) return null
    const { titre, notes } = decouper(brut)
    return [{ action: "add_dev_item", title: titre, notes }]
  }

  const prioriteChantier = texte.match(
    /^(?:modifie|change|mets|passe|monte|descends)\s+(?:la priorite (?:du|de la|de l')\s*)?(?:chantier\s+)?(.+?)\s+(?:en|a|comme)\s+(?:priorite\s+)?(haute?|elevee?|tres elevee?|urgente?|normale?|basse?|faible)\b/,
  )
  if (prioriteChantier) {
    const cible = prioriteChantier[1].replace(/^(?:la priorite (?:du|de la|de l')\s*)?/, "").trim()
    const chantier = meilleur(cible, ctx.chantiers)
    if (!chantier) return null
    const mot = prioriteChantier[2]
    const priority = /bas|faible/.test(mot) ? "low" : /normal/.test(mot) ? "normal" : "high"
    return [{ action: "update_dev_item", item_id: chantier.id, changes: { priority } }]
  }

  const archiveChantier = texte.match(
    /^(?:archive|termine|clos|ferme)\s+(?:le\s+)?chantier\s+(.+)$/,
  )
  if (archiveChantier) {
    const chantier = meilleur(archiveChantier[1], ctx.chantiers)
    if (!chantier) return null
    return [{ action: "archive_dev_item", item_id: chantier.id }]
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

  /* ---------- La musique en cours : pause/reprise/suivant, pas "ouvre une
     app" — pilotée par les touches multimédia du système, pour ce qui joue
     déjà quelle que soit l'application. ---------- */
  if (/^(?:mets?( ca| la musique)? en pause|pause( la musique)?)\b/.test(texte)) {
    return [{ action: "media_control", media_command: "pause" }]
  }
  if (/^(?:arrete|stoppe|coupe)( la musique| ca)\b/.test(texte)) {
    return [{ action: "media_control", media_command: "stop" }]
  }
  if (/^(?:reprends?|relance)( la musique)?\b/.test(texte) || /^remets( la musique)\b/.test(texte)) {
    return [{ action: "media_control", media_command: "lecture" }]
  }
  if (/^(?:(?:morceau|chanson|piste|titre) suivante?|suivante?|passe (?:a la|au) suivante?)\b/.test(texte)) {
    return [{ action: "media_control", media_command: "suivant" }]
  }
  if (/^(?:(?:morceau|chanson|piste|titre) precedente?|precedente?)\b/.test(texte)) {
    return [{ action: "media_control", media_command: "precedent" }]
  }

  /* ---------- Ouvrir une application, avec ou sans musique précise ---------- */
  const musiqueSur = texte.match(/^(?:mets?|joue|lance)\s+(.+?)\s+sur\s+([a-z0-9 ]+)$/)
  if (musiqueSur) {
    return [
      {
        action: "open_app",
        app_name: majuscule(musiqueSur[2].trim()),
        music_query: majuscule(musiqueSur[1].trim()),
      },
    ]
  }
  const ouvreApp = texte.match(/^(?:ouvre|lance|demarre)\s+(.+)$/)
  if (ouvreApp) {
    const cible = ouvreApp[1].trim()
    // "lance la musique" seule, sans application précisée, relève du
    // contrôle de lecture ci-dessus — pas d'une application qui s'appellerait
    // "la musique".
    if (/^(?:de la |la )?musique$/.test(cible)) {
      return [{ action: "media_control", media_command: "lecture" }]
    }
    return [{ action: "open_app", app_name: majuscule(cible) }]
  }

  /* ---------- Appeler un contact connu ---------- */
  const appelContact = texte.match(/^(?:appelle|telephone a)\s+(.+)$/)
  if (appelContact) {
    const contact = meilleurContact(appelContact[1], ctx.contacts ?? [])
    if (!contact) return null
    return [{ action: "call_contact", contact_id: contact.id }]
  }

  /* ---------- Préparer un message ---------- */
  // Ne reconnaît que ce qui suit un déclencheur net ("pour lui dire",
  // "dis-lui que") : le texte du message est repris TEL QUEL, jamais
  // reformulé — une bonne reformulation demande un jugement que ce module
  // n'a pas, une mauvaise abîmerait un message qui part vraiment.
  const messageContact = texte.match(
    /^(?:envoie|prepare)\s+(?:un\s+)?(sms|texto|message|whatsapp)\s+a\s+(.+?)\s+(?:pour(?: lui)? dire|lui dire)\s+(?:que\s+)?(.+)$/,
  )
  if (messageContact) {
    const canalMot = messageContact[1]
    const contact = meilleurContact(messageContact[2], ctx.contacts ?? [])
    if (!contact) return null
    const texteMsg = messageContact[3].trim()
    if (!texteMsg) return null
    return [
      {
        action: "send_message",
        message_channel: /sms|texto/.test(canalMot) ? "sms" : "whatsapp",
        message_text: majuscule(texteMsg),
        contact_id: contact.id,
      },
    ]
  }

  /* ---------- Alarme et minuteur ---------- */
  const minuteur = texte.match(
    /^(?:mets?(?: un)?|lance(?: un)?)?\s*minuteur\s+de\s+(\d+)\s*(heures?|minutes?|secondes?)\b\s*(.*)$/,
  )
  if (minuteur) {
    const n = Number(minuteur[1])
    const unite = minuteur[2]
    const secondes = /heure/.test(unite) ? n * 3600 : /minute/.test(unite) ? n * 60 : n
    const reste = titreDepuis(minuteur[3] ?? "")
    return [
      {
        action: "set_alarm",
        alarm_duration_seconds: secondes,
        alarm_label: reste ? majuscule(reste) : undefined,
      },
    ]
  }
  const alarme = texte.match(/^(?:reveille-moi|mets?(?: une)? alarme|reveil)\s*(.*)$/)
  if (alarme) {
    const trouve = lireHeure(alarme[1] ?? "")
    if (!trouve) return null
    return [{ action: "set_alarm", alarm_time: trouve.heure }]
  }

  /* ---------- Itinéraire ---------- */
  const itineraire = texte.match(
    /^(?:emmene-moi\s+(?:a|au|aux|vers|jusqu'a)|itineraire\s+(?:vers|jusqu'a)|guide-moi\s+(?:vers|jusqu'a))\s+(.+)$/,
  )
  if (itineraire) {
    return [{ action: "navigate_to", destination: majuscule(itineraire[1].trim()) }]
  }

  const ajoutTache = texte.match(
    /^(?:ajoute|rajoute|cree|note|rappelle-moi|pense a|il faut que je|je dois)\s*(?:une |la |le |de |d')?\s*(?:tache\s*:?\s*)?(.+)$/,
  )
  if (ajoutTache) {
    // « note que Dylan est le client de Melissa » est une information sur
    // quelqu'un, pas une tâche : le module ne s'en occupe pas.
    if (/^que\b/.test(ajoutTache[1])) return null

    const { date, heure, motsRetires } = lireQuand(ajoutTache[1], maintenant)
    const brut = titreDepuis(retirerMots(ajoutTache[1], motsRetires))
    if (!brut || brut.length < 3) return null
    const { titre, notes } = decouper(brut)

    return [
      {
        action: "add_task",
        title: titre,
        notes,
        due_date: date,
        due_time: heure,
      },
    ]
  }

  return null
}
