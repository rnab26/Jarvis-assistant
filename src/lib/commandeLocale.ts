// Import relatif avec extension : ce module doit rester chargeable par
// `node --experimental-strip-types` pour sa vérification, qui ne connaît
// pas l'alias « @/ » de Vite.
import { lireHeure, lireQuand, retirerMots, sansAccents } from "./dateOrale.ts"
import { cibleTropCourante } from "./chercherContact.ts"
import { correctionDeDestination } from "./ouVaCetteDictee.ts"
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
 * Est-ce que ce qui suit « ouvre » / « lance » ressemble à un nom
 * d'application, ou à une phrase ?
 *
 * La différence n'est pas cosmétique : `executerActionTelephone` rapproche ce
 * texte des applications installées de façon FLOUE, et finit toujours par en
 * trouver une. Une phrase entière lui est donc rendue comme une application,
 * et Jarvis l'ouvre — c'est ce qui s'est passé le 5 sept., deux fois d'affilée.
 * Trois mots au plus, et aucune ponctuation de phrase (« : », « . », « ; »,
 * « , »), qu'aucun nom d'application ne porte.
 */
function estUnNomDApp(cible: string): boolean {
  if (/[:;,.!?]/.test(cible)) return false
  const mots = cible.split(/\s+/).filter(Boolean)
  return mots.length >= 1 && mots.length <= 3
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

  /* ---------- « Non, mets-le en chantier » ----------
     En PREMIER, et localement. C'est une reprise dite dans la foulée d'une
     création : la faire remonter au modèle coûterait un aller-retour, une
     seconde d'attente et une chance de plus de la comprendre comme une
     nouvelle demande — auquel cas la ligne d'origine resterait dans la
     mauvaise liste pendant qu'une jumelle apparaîtrait ailleurs.
     `correctionDeDestination` refuse tout ce qui porte du contenu en plus
     (« ajoute un chantier pour refaire la salle de bain »), et c'est la
     moitié qui compte. */
  const correction = correctionDeDestination(texte)
  if (correction) return [{ action: "move_last_entry", vers: correction }]

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
  // « lance » et les infinitifs (« créer », « ajouter ») : ses tournures du
  // 5 sept., relevées dans `journal_ecoute` après qu'elles ont ouvert une
  // application au lieu de créer le chantier. Le mot « chantier » qui suit
  // lève toute ambiguïté — « lance Spotify » n'est pas concerné.
  const ajoutChantier = texte.match(
    /^(?:(?:dans (?:les|mes) (?:chantiers|taches de developpement)[^,]*,?\s*)?(?:ajouter?|rajouter?|creer?|noter?|nouveau|nouvelle|lance[rz]?|demarrer?|ouvre|ouvrir))\s+(?:un |une |le |la |moi un |moi une )?(?:chantier|tache de developpement)\b\s*(?:a traiter\s*)?(?:et (?:vas-y )?(?:ajoute|rajoute)(?:-le)?\.?\s*)?(?:j'aimerais\s+)?:?\s*(.+)$/,
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

  /* ---------- Une recherche confiée à une IA installée ----------
     AVANT « ouvre / lance une application », et c'est indispensable : sinon
     « lance une recherche via Perplexity… » part en open_app, où le
     rapprochement flou finit par ouvrir n'importe quelle application. */
  // Sa tournure du 5 sept., qui ne passait pas : « lance une recherche via
  // Perplexity pour des restaurants de viande réputés à Netanya ». Le nom de
  // l'app est encadré par « via / sur / avec » d'un côté et « pour / sur / : »
  // de l'autre : rien n'est deviné, ce qui permet de sortir du vocabulaire
  // fermé de « demande à X » sans retomber dans l'approximation.
  const rechercheVia = texte.match(
    /^(?:lance|fais|effectue|demarre|balance)\s+(?:une?\s+)?recherche\s+(?:via|sur|avec|par)\s+([a-z0-9.-]+(?: [a-z0-9.-]+)?)\s*(?::|\s+(?:pour|sur|concernant|a propos de))\s+(.+)$/,
  )
  if (rechercheVia) {
    const question = rechercheVia[2].trim()
    if (!question) return null
    return [{ action: "ask_ai", app_name: majuscule(rechercheVia[1].trim()), question: majuscule(question) }]
  }
  // « cherche des restaurants … sur Perplexity » : l'application est à la fin.
  // Ici la question est libre, donc le nom de l'app doit être connu — sans
  // quoi « cherche un restaurant dans le quartier » deviendrait une app.
  const rechercheApresQuestion = texte.match(
    /^(?:cherche|recherche|trouve)(?:-moi)?\s+(.+?)\s+(?:sur|via|avec|dans)\s+(chatgpt|perplexity|claude|grok|gemini|copilot)$/,
  )
  if (rechercheApresQuestion) {
    const question = rechercheApresQuestion[1].trim()
    if (!question) return null
    return [{
      action: "ask_ai",
      app_name: majuscule(rechercheApresQuestion[2]),
      question: majuscule(question),
    }]
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
  // "mets-moi la musique X" (sans "sur Y") : l'application à viser n'est pas
  // ici — c'est le rôle d'executerActionTelephone/open_app, seule source de
  // vérité pour "quelle app pour la musique" (déjà retenue, ou à demander).
  const musiqueSansApp = texte.match(/^mets?(?:-moi)?\s+(?:la\s+)?musique\s+(.+)$/)
  if (musiqueSansApp) {
    return [{ action: "open_app", music_query: majuscule(musiqueSansApp[1].trim()) }]
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
    // Un nom d'application, c'est un ou deux mots — « Spotify », « Apple
    // Music ». Le 5 sept., « lance un chantier et ajoute-le : savoir combien
    // il me reste de crédit » est parti en open_app, et le rapprochement flou
    // a ouvert מכבי : une phrase de dix mots avait été prise pour un nom
    // d'app. Au-delà de trois mots, ou dès qu'il y a une ponctuation de
    // phrase, on rend la main au serveur plutôt que d'ouvrir n'importe quoi.
    if (!estUnNomDApp(cible)) return null
    return [{ action: "open_app", app_name: majuscule(cible) }]
  }

  /* ---------- Appeler un contact connu ---------- */
  const appelContact = texte.match(/^(?:appelle|telephone a)\s+(.+)$/)
  if (appelContact) {
    // « Jarvis appelle mail » — ce qu'il a réellement dit le 5 sept. 2026 à
    // 21 h 07, c'était « appelle ma femme ». Un seul mot, et c'est un mot
    // d'appareil : ce n'est pas quelqu'un qu'il a nommé, c'est une commande
    // mal entendue. On rend la main au serveur, qui demandera — plutôt que de
    // composer un numéro, ce qui ne se rattrape pas. Cette fois-là, l'appel
    // est parti vers le répondeur.
    if (cibleTropCourante(appelContact[1])) return null
    const contact = meilleurContact(appelContact[1], ctx.contacts ?? [])
    if (contact) return [{ action: "call_contact", contact_id: contact.id }]
    // Aucun contact enregistré ne correspond : on rend quand même l'action,
    // avec le nom tel qu'il l'a dit. C'est le TÉLÉPHONE qui cherchera dans
    // son vrai répertoire (chercherContact), et qui répondra « je ne trouve
    // personne à ce nom » si rien ne colle. Avant le 5 sept. 2026 on rendait
    // null, et la phrase partait au serveur pour finir par lui réclamer un
    // numéro qu'il avait déjà dans son téléphone.
    const nomDit = appelContact[1].trim()
    if (nomDit.length < 2) return null
    return [{ action: "call_contact", contact_name: majuscule(nomDit) }]
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
    // Même garde-fou que pour l'appel : un destinataire qui tient en un mot
    // d'appareil n'est pas un destinataire.
    if (cibleTropCourante(messageContact[2])) return null
    const contact = meilleurContact(messageContact[2], ctx.contacts ?? [])
    if (!contact) return null
    const texteMsg = messageContact[3].trim()
    if (!texteMsg) return null
    // "message" tout court ne dit pas le canal : c'est
    // executerActionTelephone/send_message, seule source de vérité pour
    // "quel canal pour les messages" (déjà retenu, ou à demander), qui
    // tranche. "sms"/"texto" et "whatsapp" restent des choix explicites.
    const canal = /sms|texto/.test(canalMot) ? "sms" : /whatsapp/.test(canalMot) ? "whatsapp" : undefined
    return [
      {
        action: "send_message",
        message_channel: canal,
        message_text: majuscule(texteMsg),
        contact_id: contact.id,
      },
    ]
  }

  // "utilise X pour la musique/la navigation/les messages/l'IA" —
  // apprentissage direct, sans attendre une commande ambiguë qui pose la
  // question.
  const apprends = texte.match(
    /^utilise\s+(.+?)\s+pour\s+(?:la\s+|les\s+|l['’]\s*)?(musique|navigation|itineraires?|messages?|ia|intelligence artificielle)$/,
  )
  if (apprends) {
    const cible = majuscule(apprends[1].trim())
    const mot = apprends[2]
    const category = /musique/.test(mot)
      ? "musique"
      : /navigation|itineraire/.test(mot)
        ? "navigation"
        : /ia|intelligence/.test(mot)
          ? "ia"
          : "messages"
    return [{ action: "set_app_preference", category, app_name: cible }]
  }

  /* ---------- Relayer une question à une IA installée ---------- */
  // Vocabulaire fini plutôt qu'un motif générique : deviner où s'arrête le
  // nom de l'app et où commence la question, sur une phrase libre, serait
  // justement le genre d'approximation que ce module s'interdit. Les noms
  // ci-dessous sont ceux que Raphaël a lui-même cités.
  const iaConnue = texte.match(
    /^demande\s+(?:a|à)\s+(chatgpt|perplexity|claude|grok|gemini|copilot)\s+(.+)$/,
  )
  if (iaConnue) {
    const question = iaConnue[2].trim()
    if (!question) return null
    return [{ action: "ask_ai", app_name: majuscule(iaConnue[1]), question: majuscule(question) }]
  }
  const iaGenerique = texte.match(/^demande\s+(?:a|à)\s+(?:l['’]\s*ia|une ia|l['’]\s*intelligence artificielle)\s+(.+)$/)
  if (iaGenerique) {
    const question = iaGenerique[1].trim()
    if (!question) return null
    return [{ action: "ask_ai", question: majuscule(question) }]
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

  // `\s+` et non `\s*` : avec `\s*`, « créer X » se lisait « cree » + « r X »
  // et la tâche s'appelait « R X ». Vu le 5 sept. sur son téléphone, trois
  // fois de suite. Les infinitifs sont donc dans la liste, explicitement.
  const ajoutTache = texte.match(
    /^(?:ajouter?|rajouter?|creer?|noter?|rappelle-moi|pense a|il faut que je|je dois)\s+(?:une |la |le |de |d')?\s*(?:tache\s*:?\s*)?(.+)$/,
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
