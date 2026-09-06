// Import relatif avec extension, comme veille.ts → motCle.ts : ce module doit
// pouvoir se charger sous Node sans bundler, pour que la table de
// correspondance ci-dessous se vérifie sans réseau
// (scripts/verifier-raison-ecoute.ts). Les imports `@/…` ne s'y résolvent pas ;
// `@/types/database` reste possible parce qu'il est effacé (import type).
import { estUnePanne, titreDeLaPanne, type RaisonEcoute } from "./raisonEcoute.ts"
import type { ErreurCategorie } from "@/types/database"

/**
 * Le seul chemin d'écriture automatique du registre des erreurs.
 *
 * Pourquoi ce fichier existe séparément du hook : ce qui rate ne rate presque
 * jamais dans un composant React. Ça rate dans une couche de données, dans le
 * moteur d'écoute, dans une promesse lancée par un effet. Cette fonction doit
 * donc être appelable de partout, sans contexte, sans attendre — comme
 * `noterEcoute`, dont elle reprend la discipline :
 *
 *   — elle n'attend jamais (aucun `await` chez l'appelant) ;
 *   — elle n'échoue jamais bruyamment : un registre d'erreurs qui fait échouer
 *     l'action qu'il observe serait la pire des ironies ;
 *   — elle charge le client Supabase PARESSEUSEMENT, pour que le banc d'essai
 *     du micro (scripts/harness, monté sans configuration Supabase) puisse
 *     continuer à importer tout ce qui l'appelle.
 *
 * Le regroupement des occurrences est fait par la base (empreinte + compteur,
 * migration 0019). Ici on ne fait que le premier tri : la même erreur qui se
 * répète en boucle pendant une minute — une coupure réseau en produit vingt
 * par seconde — ne part qu'une fois.
 */

export type SourceErreur = "app" | "voix" | "live" | "ecoute" | "manuel"

interface Options {
  detail?: string | null
  /** Ce qui se passait : la phrase dictée, l'écran, l'action tentée. */
  contexte?: string | null
  source?: SourceErreur
}

/** Deux signalements identiques à moins d'une minute : un seul part. */
const FENETRE_REPETITION_MS = 60_000

/** Au-delà, on abandonne ce signalement plutôt que de bloquer les suivants. */
const DELAI_MAX_MS = 10_000

const dernierEnvoi = new Map<string, number>()
let enCours: Promise<void> = Promise.resolve()

/** Coupe le bruit qui fait qu'un titre n'est plus le même d'une fois sur
 * l'autre (identifiants, durées) — la base fait pareil de son côté. */
function empreinteLocale(categorie: string, titre: string): string {
  return `${categorie}:${titre.toLowerCase().replace(/[0-9]+/g, "").replace(/\s+/g, " ").trim()}`
}

export function signalerErreur(
  categorie: ErreurCategorie,
  titre: string,
  { detail = null, contexte = null, source = "app" }: Options = {},
): void {
  const propre = titre.replace(/\s+/g, " ").trim()
  if (!propre) return

  const cle = empreinteLocale(categorie, propre)
  const maintenant = Date.now()
  const vu = dernierEnvoi.get(cle)
  if (vu && maintenant - vu < FENETRE_REPETITION_MS) return
  dernierEnvoi.set(cle, maintenant)

  // Les appels sont mis à la queue leu leu : deux `signaler_erreur` simultanés
  // sur la même empreinte se marcheraient dessus (l'un des deux perdrait son
  // occurrence).
  enCours = enCours
    .then(async () => {
      const { supabase } = await import("@/lib/supabase")
      const { withTimeout } = await import("@/lib/withTimeout")
      const { data } = await supabase.auth.getSession()
      // Pas connecté : rien à enregistrer, et surtout pas d'erreur de plus.
      if (!data.session) return
      // Borné dans le temps, et c'est essentiel ici : ces signalements
      // arrivent surtout quand le réseau va mal — c'est même leur raison
      // d'être. Les appels sont mis à la queue leu leu, donc un seul appel
      // resté en attente bloquerait TOUS les signalements suivants, sans
      // qu'on puisse le voir. supabase-js, lui, réessaie près d'une minute
      // avant d'abandonner.
      await withTimeout(
        supabase.rpc("signaler_erreur", {
          p_categorie: categorie,
          p_titre: propre.slice(0, 200),
          p_detail: detail?.slice(0, 2000) ?? null,
          p_contexte: contexte?.slice(0, 1000) ?? null,
          p_source: source,
        }),
        DELAI_MAX_MS,
      )
    })
    .catch(() => {
      // Un registre qui ne s'écrit pas ne doit jamais se voir.
    })
}

/** Pour les vérifications : vide la mémoire des répétitions. */
export function oublierRepetitions(): void {
  dernierEnvoi.clear()
}

/**
 * Ce qu'on retient d'un événement du journal d'écoute, s'il raconte un échec.
 * Rendu ici plutôt que dans journalEcoute.ts pour être vérifiable sans
 * réseau (`scripts/verifier-raison-ecoute.ts`) : c'est cette table de
 * correspondance qui décide si un échec réel finit dans le registre ou
 * disparaît avec les 7 jours du journal d'écoute.
 */
export function erreurDepuisEcoute(
  evenement: string,
  detail: Record<string, string | number | boolean | null>,
): { categorie: ErreurCategorie; titre: string; detail: string | null; source: SourceErreur } | null {
  const texte = (cle: string) => {
    const v = detail[cle]
    return v === null || v === undefined ? null : String(v)
  }

  if (evenement === "live_echec") {
    const etape = texte("etape") ?? "inconnue"
    return {
      categorie: "serveur",
      titre:
        etape === "jeton"
          ? "Le mode Live n'obtient pas de jeton"
          : "Le mode Live n'arrive pas à se connecter",
      detail: texte("detail"),
      source: "live",
    }
  }

  if (evenement === "reponse" && texte("erreur")) {
    return {
      categorie: "serveur",
      titre: "Le serveur vocal a refusé de répondre",
      detail: texte("erreur"),
      source: "voix",
    }
  }

  // « depuis le début j'essaie de lancer une musique […] ça ne fonctionne
  // pas » (5 sept. 2026). L'échec est SILENCIEUX par nature : l'app s'ouvre,
  // rien ne joue, et journal_ecoute est purgé à sept jours et ne se lit qu'en
  // SQL. Ici, il reste, se regroupe par empreinte, et se voit dans le
  // cockpit — c'est ce qui permettra de savoir quelle application refuse,
  // sans rien avoir à demander à Raphaël.
  if (evenement === "musique_resultat" && texte("resultat") === "ouverture") {
    return {
      categorie: "action",
      titre: "La musique demandée n'a pas été lancée, l'app s'est seulement ouverte",
      detail: `${texte("app_choisie") ?? "application inconnue"} — « ${texte("requete") ?? ""} »`,
      source: "app",
    }
  }

  // Le contrôle de l'écran rate en silence par nature : Jarvis dit « je n'ai
  // rien touché », et personne d'autre ne le sait. Le titre porte la FAMILLE
  // et l'APPLICATION, jamais la phrase dictée — c'est lui qui fait l'empreinte
  // de regroupement, et dix échecs sur YouTube doivent faire UNE ligne avec un
  // compteur, pas dix lignes que personne ne lira.
  if (evenement === "ecran_action") {
    const resultat = texte("resultat")
    const ratees = new Set(["introuvable", "ambigu", "rang_trop_grand", "refus", "ecran_change"])
    if (!resultat || !ratees.has(resultat)) return null
    const ou = texte("application") ?? texte("paquet") ?? "une application"
    return {
      categorie: resultat === "refus" || resultat === "ecran_change" ? "action" : "comprehension",
      titre: `Jarvis n'a pas pu appuyer sur ce qui était demandé dans ${ou}`,
      detail: `${resultat} — « ${texte("cible") ?? ""} »`,
      source: "app",
    }
  }

  if (evenement === "service_mort") {
    return {
      categorie: "ecoute",
      titre: "Le service de reconnaissance vocale s'est arrêté tout seul",
      detail: texte("detail"),
      source: "ecoute",
    }
  }

  if (evenement === "rafale_fin" || evenement === "commande_fin") {
    // On a entendu quelque chose : le tour a fait son travail, quoi qu'il se
    // soit passé en chemin (le mode commande relance et rattrape tout seul —
    // 16 tours sur 21 le 5 sept.).
    if (texte("entendu")) return null

    const raison = texte("raison") as RaisonEcoute | null
    const silencieuse = detail.mort_silencieuse === true || Number(detail.morts_silencieuses ?? 0) > 0

    // Fin ANORMALE, de l'une des deux façons dont on peut la connaître : on a
    // vu le service mourir sans un mot (le pouls, seul signal des APK d'avant
    // le patch), ou Android nous a dit pourquoi (depuis le patch). Il faut
    // les deux : depuis que l'erreur remonte, elle arrive AVANT le pouls, qui
    // ne se déclenche donc plus — ne regarder que `mort_silencieuse` rendrait
    // le registre aveugle aux vraies pannes sur les APK récentes.
    if (!silencieuse && raison === null) return null

    // LA VEILLE QUI N'ENTEND RIEN N'EST PAS UNE PANNE. C'est la pièce qui est
    // calme : le téléphone posé sur la table, la boucle qui relance une
    // rafale toutes les 1 à 8 s, et Android qui répond « personne n'a parlé ».
    // Mesuré le 5 sept. sur le journal réel : 363 rafales de veille sur 387
    // finissent ainsi, et AUCUNE d'elles n'avait entendu quoi que ce soit.
    // On les signalait toutes — d'où « Le micro s'est arrêté sans rien
    // entendre », vue 10 fois, seule ligne ouverte du registre, qui masquait
    // les vraies. Une rafale de veille ne se signale donc que si Android a
    // donné une VRAIE raison (service occupé, micro refusé, réseau).
    if (texte("mode") === "veille" && !estUnePanne(raison)) return null

    // Ici, soit c'est le mode commande — Raphaël a appuyé, il a parlé, et
    // rien n'est arrivé : c'est une perte, même sans raison connue — soit
    // Android a nommé une panne. Le titre dit la cause quand on la connaît,
    // pour que le registre soit actionnable au lieu d'être descriptif.
    return {
      categorie: "ecoute",
      titre: raison && estUnePanne(raison) ? titreDeLaPanne(raison) : "Le micro s'est arrêté sans rien entendre",
      detail: `${evenement} — ${JSON.stringify(detail).slice(0, 300)}`,
      source: "ecoute",
    }
  }

  return null
}
