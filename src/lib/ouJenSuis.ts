// Import relatif avec extension : ce module doit rester chargeable par
// `node --experimental-strip-types` pour sa vérification, qui ne connaît pas
// l'alias « @/ » de Vite. Les imports de TYPES sont effacés à la compilation
// et peuvent, eux, garder l'alias.
import { marqueurDe } from "./marqueurChantier.ts"
import { SANS_SECTION, sectionDe } from "./sections.ts"
import { cleTheme } from "./themeChantier.ts"
import type { DevItem, DevLogEntry, DevSection } from "@/types/database"

/**
 * « Où j'en suis ? » — la question que Raphaël se pose en ouvrant le cockpit,
 * et à laquelle le cockpit ne répondait pas.
 *
 * SES MOTS, 5 sept. 2026 : « là vraiment je commence à avoir des chantiers de
 * partout, je ne comprends plus rien, je ne sais plus où mettre le nez. Je
 * travaille de tous les côtés et toi aussi et il y a des chantiers ouverts de
 * partout, mais je ne sais pas ce qui avance, ce qui n'avance pas. »
 *
 * CE N'ÉTAIT PAS UN MANQUE D'INFORMATION. Tout est déjà en base : la
 * réservation dit quelle session travaille sur quoi, `archived_at` dit ce qui
 * a été livré, les marqueurs en tête des notes disent ce qui attend une
 * décision de lui, `dev_log` porte les questions sans réponse. Le cockpit
 * montrait TOUT et ne répondait à RIEN — soixante chantiers, dix sections, un
 * journal, un registre d'erreurs.
 *
 * D'où quatre nombres par section, et rien d'autre :
 *   — ce qui BOUGE : une session est dessus en ce moment ;
 *   — ce qui a été LIVRÉ dans la fenêtre choisie ;
 *   — ce qui l'ATTEND, LUI : marqueur `[À CADRER]` / `[A FAIRE PAR RAPHAEL]`,
 *     ou une question de session restée sans réponse ;
 *   — ce qui DORT : ouvert, personne dessus, rien qui le bloque.
 *
 * Une cinquième colonne rendrait le tableau illisible et on serait revenu au
 * point de départ. Les quatre ne forment donc pas une partition : un chantier
 * `[BLOQUÉ PAR : …]` ou `[REPORTÉ]` n'est ni endormi ni en attente de lui,
 * et n'est compté nulle part. C'est voulu — il n'y a rien à en faire.
 *
 * Tout est pur : aucun réseau, aucun React, aucune date implicite (l'instant
 * se passe en paramètre). Vérifié par `scripts/verifier-ou-jen-suis.ts`.
 */

/** Depuis quand on compte « ce qui a été livré ». */
export type FenetreBilan = "aujourdhui" | "24h" | "7j"

export const FENETRE_PAR_DEFAUT: FenetreBilan = "aujourdhui"

export const FENETRES: { valeur: FenetreBilan; libelle: string; aide: string }[] = [
  {
    valeur: "aujourdhui",
    libelle: "Aujourd'hui",
    aide: "Depuis minuit. Ce qui a été livré cette nuit disparaît du compte au petit matin.",
  },
  {
    valeur: "24h",
    libelle: "24 dernières heures",
    aide: "Glissant : à 1 h du matin, le travail de la soirée compte encore.",
  },
  { valeur: "7j", libelle: "7 derniers jours", aide: "La semaine écoulée, jour par jour glissant." },
]

export function estFenetreBilan(valeur: unknown): valeur is FenetreBilan {
  return FENETRES.some((f) => f.valeur === valeur)
}

/**
 * L'instant à partir duquel un chantier archivé compte comme « livré ».
 *
 * « Aujourd'hui » se calcule sur l'heure LOCALE, pas en UTC : Raphaël est en
 * Israël, et un minuit calculé à Greenwich ferait basculer son compteur à
 * deux ou trois heures du matin, en plein travail.
 */
export function debutFenetre(fenetre: FenetreBilan, maintenant: number): number {
  if (fenetre === "24h") return maintenant - 24 * 3600_000
  if (fenetre === "7j") return maintenant - 7 * 24 * 3600_000
  const minuit = new Date(maintenant)
  minuit.setHours(0, 0, 0, 0)
  return minuit.getTime()
}

/** Pourquoi un chantier l'attend, LUI. */
export type RaisonAttente = "decision" | "question"

export interface ChantierEnAttente {
  item: DevItem
  raison: RaisonAttente
  /** La question restée sans réponse, quand c'est elle qui met en attente. */
  question: DevLogEntry | null
}

export interface ChantierPris {
  item: DevItem
  /** Le nom de la session, tel qu'il s'affiche (sans le « claude/ »). */
  session: string
  /** Fin de la réservation. */
  expireA: string
}

export interface EtatSection {
  nom: string
  section: DevSection | null
  bouge: ChantierPris[]
  livres: DevItem[]
  attend: ChantierEnAttente[]
  dort: DevItem[]
  /**
   * Réservations qu'une session arrêtée n'a jamais libérées : le chantier
   * affiche encore « Prise par… » alors que personne n'est dessus. C'est le
   * piège de tout ce tableau — sans cette distinction, ces chantiers-là
   * seraient comptés comme « ça bouge » et on les croirait pris en charge.
   */
  abandonnees: ChantierPris[]
  /** Vrai dès qu'il s'y passe autre chose que dormir. */
  actif: boolean
}

export interface Bilan {
  /** Ce qui l'attend d'abord, ce qui dort en dernier. */
  sections: EtatSection[]
  /** Les sections où il ne reste que des chantiers endormis. */
  auRepos: EtatSection[]
  /** Questions du journal qui ne portent sur aucun chantier. */
  questionsGenerales: DevLogEntry[]
  totaux: { bouge: number; livres: number; attend: number; dort: number; abandonnees: number }
  /** Vrai quand il n'y a strictement rien à afficher. */
  vide: boolean
}

/** Un marqueur qui dit « ce chantier attend une décision de Raphaël ». */
function attendSaDecision(item: DevItem): boolean {
  const m = marqueurDe(item)
  return m === "a_cadrer" || m === "pour_raphael"
}

/** Un marqueur qui dit « ce chantier n'est pas à prendre » — il ne dort pas
 * pour autant : personne ne l'attend, il est simplement en suspens. */
function enSuspens(item: DevItem): boolean {
  const m = marqueurDe(item)
  return m === "bloque" || m === "reporte" || m === "doublon"
}

const nomCourt = (session: string) => session.replace(/^claude\//, "")

export function ouJenSuis(
  items: DevItem[],
  sections: DevSection[],
  messages: DevLogEntry[],
  fenetre: FenetreBilan = FENETRE_PAR_DEFAUT,
  maintenant: number = Date.now(),
): Bilan {
  const depuis = debutFenetre(fenetre, maintenant)

  // Les questions sans réponse, rangées par chantier une fois pour toutes :
  // les rechercher pour chaque chantier reviendrait à parcourir tout le
  // journal soixante fois.
  const questionsParItem = new Map<string, DevLogEntry>()
  const questionsGenerales: DevLogEntry[] = []
  const connus = new Set(items.map((i) => i.id))
  for (const m of messages) {
    if (m.kind !== "question" || m.answered_at) continue
    if (m.item_id && connus.has(m.item_id)) {
      // La plus ancienne fait foi : c'est celle qui attend depuis le plus
      // longtemps, donc celle qu'on veut voir en premier.
      const dejaLa = questionsParItem.get(m.item_id)
      if (!dejaLa || m.created_at < dejaLa.created_at) questionsParItem.set(m.item_id, m)
    } else {
      questionsGenerales.push(m)
    }
  }

  const parCle = new Map<string, EtatSection>()
  const vide = (nom: string, section: DevSection | null): EtatSection => ({
    nom,
    section,
    bouge: [],
    livres: [],
    attend: [],
    dort: [],
    abandonnees: [],
    actif: false,
  })

  // Les sections déclarées existent même sans un seul chantier : « Où j'en
  // suis » doit dire qu'une section créée d'avance est encore vide, pas la
  // faire disparaître.
  for (const section of sections) parCle.set(cleTheme(section.nom), vide(section.nom, section))

  const etatDe = (item: DevItem): EtatSection => {
    const nom = sectionDe(item)
    const cle = cleTheme(nom)
    let etat = parCle.get(cle)
    if (!etat) {
      etat = vide(nom, null)
      parCle.set(cle, etat)
    }
    return etat
  }

  for (const item of items) {
    const etat = etatDe(item)

    if (item.archived_at) {
      if (new Date(item.archived_at).getTime() >= depuis) etat.livres.push(item)
      continue
    }

    const expire = item.claim_expires_at ? new Date(item.claim_expires_at).getTime() : null
    const pris: ChantierPris | null =
      item.claimed_by && expire !== null && !Number.isNaN(expire)
        ? { item, session: nomCourt(item.claimed_by), expireA: item.claim_expires_at! }
        : null

    if (pris && expire! > maintenant) {
      etat.bouge.push(pris)
      continue
    }
    if (pris) {
      etat.abandonnees.push(pris)
      // Et on s'arrête là : ce chantier n'est PAS « ce qui dort ». Tant que
      // la réservation morte n'est pas libérée, il affiche « Prise par … » et
      // aucune session ne le prendra — le compter comme disponible dirait le
      // contraire de ce qui se passe. Il ressort par `abandonnees`, qui porte
      // le bouton pour le rendre à la file.
      continue
    }

    const question = questionsParItem.get(item.id) ?? null
    if (attendSaDecision(item)) {
      etat.attend.push({ item, raison: "decision", question })
    } else if (question) {
      etat.attend.push({ item, raison: "question", question })
    } else if (item.status !== "done" && !enSuspens(item)) {
      etat.dort.push(item)
    }
  }

  const tous = [...parCle.values()]
  for (const etat of tous) {
    etat.actif =
      etat.bouge.length + etat.livres.length + etat.attend.length + etat.abandonnees.length > 0
  }

  // Ce qui l'attend d'abord, puis ce qu'une session a laissé tomber, puis ce
  // qui bouge, puis ce qui vient d'être livré. C'est l'ordre de la question
  // qu'il pose : « où est-ce que je dois mettre le nez ? »
  const rang = (e: EtatSection) => [
    e.attend.length,
    e.abandonnees.length,
    e.bouge.length,
    e.livres.length,
  ]
  const position = (e: EtatSection) =>
    e.section ? e.section.position : e.nom === SANS_SECTION ? 1e9 : 1e8

  const trier = (a: EtatSection, b: EtatSection) => {
    const ra = rang(a)
    const rb = rang(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i]
    return position(a) - position(b) || a.nom.localeCompare(b.nom, "fr")
  }

  const actives = tous.filter((e) => e.actif).sort(trier)
  const auRepos = tous
    .filter((e) => !e.actif && e.dort.length > 0)
    .sort((a, b) => b.dort.length - a.dort.length || position(a) - position(b))

  const somme = (f: (e: EtatSection) => number) => tous.reduce((n, e) => n + f(e), 0)

  return {
    sections: actives,
    auRepos,
    questionsGenerales,
    totaux: {
      bouge: somme((e) => e.bouge.length),
      livres: somme((e) => e.livres.length),
      attend: somme((e) => e.attend.length) + questionsGenerales.length,
      dort: somme((e) => e.dort.length),
      abandonnees: somme((e) => e.abandonnees.length),
    },
    vide: actives.length === 0 && auRepos.length === 0 && questionsGenerales.length === 0,
  }
}
