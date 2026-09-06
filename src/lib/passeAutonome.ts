// Relatif avec extension : ce module tourne sous `node --experimental-strip-types`,
// à la fois pour sa vérification et pour le script que lance une session
// autonome. Les imports de TYPES gardent l'alias « @/ », ils sont effacés.
import { marqueurDe } from "./marqueurChantier.ts"
import { normaliserRecherche } from "./sections.ts"
import type { DevItem } from "@/types/database"

/**
 * Une session Claude Code doit-elle se mettre au travail maintenant ?
 *
 * SA DEMANDE (chantier 59d8587f, dictée) : « Tout les chantiers ne nécessitant
 * pas l'action de traiter des chantiers disponibles a travailler doivent etres
 * travailler seul afin de gagner du temps en developpement sur les temps mort
 * de ma présence ».
 *
 * SA RÉPONSE, le 6 sept. 2026 à 00 h 05, quand la question lui a été posée
 * dans l'app : « Oui en continue même la journee. Éviter de lancer une session
 * si une autre en est deja en cours et est disponible pour plusieurs raison :
 * ne pas consommer trop de crédit claude code, ne pas augmenter le nombre de
 * session qui deviendrais sûrement inactive a la fin de la tâche ».
 *
 * Les deux moitiés comptent autant l'une que l'autre : ça tourne en continu,
 * ET ça se retire dès qu'une autre session est là. Ce module ne fait que
 * ça — décider, en clair, sans réseau. Ce qui lit la base est dans
 * `scripts/passe-autonome.ts` ; ce qui exécute le travail est dans
 * `docs/session-autonome.md`, versionné pour être relu avant de prendre effet.
 *
 * POURQUOI LE MARQUEUR SE LIT ICI ET PAS EN SQL : `marqueurDe` est la seule
 * lecture de `[LIBRE]` / `[À CADRER]` du projet, celle que le cockpit affiche.
 * En écrire une seconde en SQL, c'est accepter qu'elles divergent un jour — et
 * le jour où elles divergent, une session autonome code un chantier qu'il
 * voulait d'abord trancher avec nous.
 */

export type Verdict = "travaille" | "eteint" | "occupe" | "rien_a_prendre"

export interface Reservation {
  branche: string
  titre: string
  expire: string
}

export interface PasseOuverte {
  branche: string
  demarre_at: string
}

export interface EtatAutonomie {
  /** Le réglage tel qu'il est en base : `null` = jamais touché. */
  reglage: string | null
  reservations: Reservation[]
  passes_ouvertes: PasseOuverte[]
  chantiers: DevItem[]
}

export interface Decision {
  verdict: Verdict
  /** Écrit pour être lu par Raphaël dans Paramètres, pas par une machine. */
  raison: string
  chantier: DevItem | null
}

/**
 * Le nom sous lequel une passe réserve un chantier — c'est ce que Raphaël lit
 * dans le cockpit, « Prise par … », et c'est aussi la clé que
 * `release_dev_item` exige pour rendre la réservation.
 *
 * MESURÉ le 6 sept. : la première vraie passe a écrit une branche VIDE. Le
 * clone d'une session ouverte par un déclencheur est en HEAD détaché, et
 * `git branch --show-current` ne rend alors rien du tout — pas une erreur, une
 * chaîne vide. Une réservation sans nom s'affiche « Prise par » suivi de rien,
 * et surtout ne se libère plus : personne ne peut deviner l'identifiant à
 * repasser.
 */
export const NOM_PASSE_SANS_BRANCHE = "session-autonome"

export function identiteSession(brancheGit: string | null | undefined): string {
  const propre = (brancheGit ?? "").trim()
  // « HEAD » est ce que rend `rev-parse --abbrev-ref` en détaché : un nom, mais
  // le même pour toutes les sessions. Il ne distingue rien, donc il ne vaut pas
  // mieux que le vide.
  if (!propre || propre === "HEAD") return NOM_PASSE_SANS_BRANCHE
  return propre
}

/**
 * Défaut ACTIF : c'est sa réponse. Une clé absente veut dire « il n'y a jamais
 * touché », pas « il a dit non » — et lui demander une seconde fois de dire
 * oui est exactement ce qu'il reproche.
 */
export const AUTONOMIE_PAR_DEFAUT = true

export function autonomieActive(reglage: string | null | undefined): boolean {
  if (reglage === null || reglage === undefined || reglage === "") return AUTONOMIE_PAR_DEFAUT
  return reglage !== "false" && reglage !== "0"
}

/**
 * Une passe restée ouverte au-delà de ce délai n'est plus une session au
 * travail : c'est une session morte en route (conteneur repris, quota atteint,
 * interruption). Même raison d'être que l'expiration d'une réservation — sans
 * ce délai, une seule passe interrompue arrêterait l'autonomie pour toujours,
 * et personne ne le verrait.
 */
export const PASSE_PERIMEE_MINUTES = 180

/**
 * LES SUJETS QU'UNE SESSION AUTONOME NE PREND JAMAIS, même marqués `[LIBRE]`.
 *
 * Ce sont ceux que Raphaël a mis à part dans le CLAUDE.md du projet : accès
 * aux applications du téléphone, contrôle du téléphone, envoi de messages en
 * son nom, clonage vocal via un service payant, toute dépense — et ses
 * identifiants. Ils se discutent avec lui d'abord — et une session lancée par
 * un déclencheur horaire n'a personne à qui parler.
 *
 * On ratisse volontairement large : un chantier écarté à tort attend la
 * prochaine session ouverte par Raphaël, ce qui ne coûte rien. Un chantier
 * pris à tort part en production pendant qu'il dort.
 *
 * CES MOTIFS SONT ÉCRITS D'APRÈS LES VRAIS TITRES DU COCKPIT, ET C'EST TOUTE
 * LA DIFFÉRENCE. La première version ne l'était pas, et la passe autonome du
 * 6 sept. 2026 à 10 h 15 a proposé « Permettre à Jarvis d'agir directement sur
 * le téléphone comme s'il était l'utilisateur (contrôle des APPLICATIONS et
 * actions sur commande) » : le motif cherchait « controle du telephone », le
 * chantier disait « contrôle des applications », et le service d'accessibilité
 * qui clique à sa place est sorti PREMIER de la file. Deux autres suivaient —
 * « Assistant par défaut du téléphone + actions dans les apps », et « Mode
 * entraînement », dont les notes disent « stocker ses identifiants chiffrés en
 * base pour que Jarvis se connecte à sa place ».
 *
 * Le contrôle qui aurait dû l'attraper ne le pouvait pas : ses cinq cas
 * d'essai étaient des PARAPHRASES des expressions régulières (« Permettre à
 * Jarvis de prendre le contrôle du téléphone » reprend le motif « prendre le
 * controle »). Il vérifiait que la regex se reconnaît elle-même. Les cas de
 * `verifier-sessions-autonomes.ts` sont désormais les titres RÉELS, copiés du
 * cockpit — comme `verifier-cockpit-reel.mjs` l'a déjà établi pour l'écran :
 * les données inventées d'un banc sont trop sages.
 *
 * SI TU AJOUTES UN MOTIF, mesure-le sur ses vrais chantiers avant de le
 * croire :
 *   scripts/sql.sh "select id,title,theme,notes,status,priority,created_at,archived_at,claimed_by,claim_expires_at from dev_items where archived_at is null"
 * puis passe chaque ligne à `sujetReserve`. Un motif jugé à l'œil sur des
 * titres imaginés ne prouve rien.
 */
const SUJETS_RESERVES: { motif: RegExp; sujet: string }[] = [
  { motif: /clonage vocal|elevenlabs|cloner (ma|sa) voix/, sujet: "le clonage vocal" },
  {
    // « agir directement sur le téléphone comme s'il était l'utilisateur »,
    // « contrôle des applications », « actions dans les apps », « activation de
    // clics », « appuyer sur l'écran à sa place » : ce sont ses mots, pas les
    // nôtres. Le service d'accessibilité et l'affichage par-dessus les autres
    // applications sont les deux accès spéciaux qui rendent tout ça possible.
    motif:
      /prendre le controle|controle (du|des) (telephone|application)|controler (le telephone|les application)|agir .{0,40}(sur|dans) (le|son) telephone|comme s.il etait l.utilisateur|actions? (dans|sur) (les |l.)(app|ecran)|activation de clics|appu(yer|ie|is) .{0,20}(sur )?l.ecran|clique[rz]? .{0,20}(a sa place|pour (moi|lui))|faire defiler l.ecran|accessibilite|par-?dessus les autres app|piloter (le|son) telephone/,
    sujet: "le contrôle du téléphone",
  },
  {
    // Catégorie ABSENTE de la première version, et c'était le pire trou :
    // « Mode entraînement » garde ses identifiants pour que Jarvis se connecte
    // à sa place. Rien dans le filtre ne parlait de comptes ni de mots de passe.
    motif:
      /identifiants|mot de passe|mots de passe|se connect(e|er) (a sa place|pour lui)|navigateur pilote|coffre-?fort/,
    sujet: "ses identifiants et ses comptes",
  },
  { motif: /envoi de message|envoyer un (message|mail|e-mail|sms)|whatsapp|sms/, sujet: "l'envoi de messages en son nom" },
  { motif: /acces aux applications|autorisation.{0,20}application|application tierce/, sujet: "l'accès aux applications du téléphone" },
  { motif: /payant|abonnement|facture au jeton|carte bancaire/, sujet: "une dépense" },
]

/** Le sujet réservé que touche ce chantier, ou null. */
/**
 * Combien de notes on lit. MESURÉ, pas choisi : à 400 caractères, « Bulle
 * Jarvis flottante à l'écran » passait au travers — son titre ne dit pas de
 * quel accès spécial il s'agit, et « une vue affichée par-dessus les autres
 * apps » n'arrive qu'au 600e caractère. Une note de chantier s'ouvre presque
 * toujours par le marqueur, la date et l'historique ; le périmètre réel vient
 * après. Trop court, on ne lit que l'en-tête.
 */
export const NOTES_LUES = 1500

export function sujetReserve(item: DevItem): string | null {
  const texte = normaliserRecherche(
    `${item.title} ${item.theme ?? ""} ${(item.notes ?? "").slice(0, NOTES_LUES)}`,
  )
  for (const { motif, sujet } of SUJETS_RESERVES) {
    if (motif.test(texte)) return sujet
  }
  return null
}

/**
 * Les chantiers qu'une session autonome peut prendre, dans l'ordre où elle doit
 * les prendre : priorité haute d'abord, puis le plus ancien — celui qui attend
 * depuis le plus longtemps.
 *
 * L'ordre est POSÉ ICI et pas seulement dans la requête SQL : sinon il ne se
 * vérifie pas hors ligne, et une passe qui recevrait la liste autrement (un
 * appel manuel, un futur écran) prendrait le premier venu.
 */
export function chantiersPrenables(etat: EtatAutonomie, maintenant: Date): DevItem[] {
  const prenables = etat.chantiers.filter((item) => {
    if (item.archived_at) return false
    if (item.status === "done") return false
    if (marqueurDe(item) !== "libre") return false
    if (item.claimed_by && Date.parse(item.claim_expires_at ?? "") > maintenant.getTime()) return false
    if (sujetReserve(item)) return false
    return true
  })

  const urgence = (item: DevItem) => (item.priority === "high" ? 0 : item.priority === "normal" ? 1 : 2)
  return prenables.sort(
    (a, b) => urgence(a) - urgence(b) || Date.parse(a.created_at) - Date.parse(b.created_at),
  )
}

function ageMinutes(depuis: string, maintenant: Date): number {
  const t = Date.parse(depuis)
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return (maintenant.getTime() - t) / 60000
}

/**
 * La décision, dans l'ordre où les raisons de s'arrêter comptent : d'abord sa
 * volonté à lui, ensuite les autres sessions, ensuite seulement le travail.
 */
export function deciderPasse(etat: EtatAutonomie, maintenant: Date): Decision {
  if (!autonomieActive(etat.reglage)) {
    return {
      verdict: "eteint",
      raison: "L'interrupteur « Sessions autonomes » est éteint dans Paramètres › Le cockpit.",
      chantier: null,
    }
  }

  const vivantes = etat.reservations.filter(
    (r) => Date.parse(r.expire) > maintenant.getTime(),
  )
  if (vivantes.length > 0) {
    const noms = vivantes.map((r) => r.branche).join(", ")
    return {
      verdict: "occupe",
      raison: `Une session travaille déjà (${noms}) sur « ${vivantes[0].titre} ». Une seule à la fois, c'est ta consigne du 6 septembre.`,
      chantier: null,
    }
  }

  const encoreLa = etat.passes_ouvertes.filter(
    (p) => ageMinutes(p.demarre_at, maintenant) < PASSE_PERIMEE_MINUTES,
  )
  if (encoreLa.length > 0) {
    return {
      verdict: "occupe",
      raison: `Une passe autonome (${encoreLa[0].branche}) est encore en cours.`,
      chantier: null,
    }
  }

  const prenables = chantiersPrenables(etat, maintenant)
  if (prenables.length === 0) {
    return {
      verdict: "rien_a_prendre",
      raison:
        "Aucun chantier marqué [LIBRE] n'est disponible : tout ce qui reste attend une décision de toi, est déjà pris, ou touche un sujet mis à part.",
      chantier: null,
    }
  }

  const chantier = prenables[0]
  return {
    verdict: "travaille",
    raison: `Chantier pris : « ${chantier.title} ».`,
    chantier,
  }
}

/* ------------------------------------------------------------------ *
 * Ce que Raphaël en voit, dans Paramètres › Le cockpit.
 * ------------------------------------------------------------------ */

/** Une passe telle qu'elle est en base (table `passes_autonomes`). */
export interface PasseAutonome {
  id: string
  branche: string
  verdict: Verdict
  raison: string
  item_id: string | null
  resume: string | null
  commit_hash: string | null
  demarre_at: string
  fini_at: string | null
}

export const LIBELLE_VERDICT: Record<Verdict, string> = {
  travaille: "a travaillé",
  eteint: "s'est retirée : éteint",
  occupe: "s'est retirée : une autre session travaillait",
  rien_a_prendre: "s'est retirée : rien à prendre",
}

/**
 * Au-delà de ce silence, alors que l'interrupteur est allumé, ce n'est plus
 * « il n'y avait rien à faire » : plus rien ne passe. Une passe qui se retire
 * s'enregistre elle aussi, précisément pour que ces deux cas ne se ressemblent
 * pas — la Routine tourne à l'heure, donc trois heures sans la moindre ligne
 * veut dire qu'elle ne tourne plus.
 */
export const SILENCE_SUSPECT_MINUTES = 200

export interface EtatAffiche {
  ton: "jamais" | "eteint" | "ok" | "alerte"
  titre: string
  detail: string
}

export function etatDesPasses(
  passes: PasseAutonome[],
  actif: boolean,
  maintenant: Date,
): EtatAffiche {
  const derniere = passes[0] ?? null

  if (!actif) {
    return {
      ton: "eteint",
      titre: "Éteint",
      detail: derniere
        ? `Aucune session ne démarrera plus. La dernière remonte au ${quand(derniere.demarre_at)}.`
        : "Aucune session ne démarrera d'elle-même.",
    }
  }

  if (!derniere) {
    return {
      ton: "jamais",
      titre: "En attente de la première passe",
      detail: "Rien n'est encore passé. La première ouverture peut prendre jusqu'à une heure.",
    }
  }

  const silence = (maintenant.getTime() - Date.parse(derniere.demarre_at)) / 60000
  if (silence > SILENCE_SUSPECT_MINUTES) {
    return {
      ton: "alerte",
      titre: "Plus rien ne passe",
      detail: `Rien depuis le ${quand(derniere.demarre_at)}, alors que c'est allumé. Le déclencheur ne tourne probablement plus — dis-le à une session.`,
    }
  }

  const travail = passes.find((p) => p.verdict === "travaille")
  return {
    ton: "ok",
    titre: "Actif",
    detail: travail?.resume
      ? `Dernier travail livré : ${travail.resume}`
      : travail
        ? `Une passe travaille depuis le ${quand(travail.demarre_at)}.`
        : `Dernier passage le ${quand(derniere.demarre_at)} — ${LIBELLE_VERDICT[derniere.verdict]}.`,
  }
}

function quand(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "?"
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
