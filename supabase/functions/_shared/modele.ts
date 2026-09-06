// L'interface commune au moteur de langue, et le SEUL endroit qui décide quel
// moteur répond.
//
// POURQUOI CE FICHIER (chantier 2c54c62f, demande de Raphaël du 3 sept. 2026 :
// « il va bien falloir qu'on trouve une solution stable ») : Jarvis a changé
// de moteur une fois dans la douleur, et il craint de tout reperdre au
// prochain changement. Le constat mesuré, lui, est rassurant — rien de ce qui
// fait Jarvis ne vit dans le modèle. La consigne, le schéma d'outil, la
// mémoire, ses réglages, ses corrections sont dans notre code et dans la base ;
// rien n'est entraîné ni affiné. Il ne manquait qu'une chose : que le CHOIX du
// moteur soit un réglage et non une réécriture.
//
// C'est ce que ce fichier apporte. Trois secrets suffisent désormais, sans
// jamais toucher au code :
//
//   FOURNISSEUR       « gemini » (défaut) ou « anthropic »
//   <X>_MODELE        le modèle de la commande vocale
//   <X>_SECOURS       ses secours, séparés par des virgules
//
// CE QUI RESTE VRAI, ET QUI EST LE VRAI RISQUE : ce n'est pas le moteur, c'est
// le QUOTA. La réponse à ça existe déjà et marche — `commandeLocale.ts` traite
// les commandes courantes sans aucun modèle. Plus on en traite localement,
// moins le moteur compte.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

/**
 * À quoi sert l'appel. Ce n'est PAS un nom de modèle : chaque fournisseur
 * traduit le rôle vers ce qu'il sait faire.
 *
 * Les deux rôles ont des SEAUX DE QUOTA RÉELLEMENT DISTINCTS, et ça n'est pas
 * un détail de confort : le 3 sept. 2026 la mémoire et la commande partageaient
 * le même modèle, la mémoire a vidé le quota du jour, et Raphaël s'est retrouvé
 * sans Jarvis à 21h28. Ne les fais jamais pointer vers le même modèle.
 */
export type Role = "commande" | "memoire"

/** Un outil au sens d'Anthropic, tel que le code existant le déclare. */
export interface OutilDeclare {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/** Ce qu'un appel demande, sans un mot qui soit propre à un moteur. */
export interface AppelModele {
  role: Role
  /** La consigne, stable d'un appel à l'autre. */
  systeme: string
  /** Ce que l'utilisateur a dit. */
  texte: string
  /** L'outil que le modèle DOIT appeler : sa réponse est le contenu de l'appel. */
  outil: OutilDeclare
  maxTokens: number
  /**
   * Vrai pour nos vérifications : la clé du second projet, pas celle de
   * Raphaël. Le plafond gratuit se compte PAR PROJET — quatre sessions qui
   * lancent leurs contrôles dans la journée vident son quota, et il l'a
   * découvert en pleine conversation.
   */
  essai?: boolean
  /**
   * Où noter ce que l'appel a coûté (chantier 5ac4d12c, sa demande du 5 sept. :
   * « savoir combien il me reste de crédit […] et le noter constamment »).
   *
   * Facultatif : le banc d'essai de `scripts/verifier-moteur.ts` appelle sans,
   * et une Edge Function qui ne le passe pas marche exactement pareil. Ce qui
   * est noté ne doit JAMAIS faire échouer ce qu'il observe — même règle que
   * `signalerErreur`.
   */
  journal?: { supabase: SupabaseClient; userId: string }
}

export interface Consommation {
  entree?: number
  cache_lu?: number
  sortie?: number
  /** Jetons de réflexion : certains modèles pensent avant de répondre. */
  reflexion?: number
}

/**
 * Ce que le fournisseur a dit d'un refus, avant qu'on le classe.
 *
 * Le fournisseur ne décide pas s'il faut réessayer — cette règle est commune
 * et vit plus bas. Il rapporte seulement ce qu'il a reçu.
 */
export interface EchecBrut {
  statut: number
  texte: string
  /** Ce que le 429 disait : quel seau est vide, et de quelle taille. */
  quota?: { id?: string; limite?: string }
  /** L'en-tête `retry-after`, en millisecondes, quand le serveur en donne un. */
  attendreMs?: number
}

export interface Echec extends EchecBrut {
  /** Vrai si un nouvel essai a une chance d'aboutir (surcharge, quota par minute). */
  passager: boolean
}

/** Ce qu'un fournisseur rend d'un essai : des arguments, ou un refus. */
export interface ReponseFournisseur {
  args?: Record<string, unknown>
  consommation?: Consommation
  echec?: EchecBrut
}

export interface ResultatModele {
  /** Les arguments de l'appel d'outil, tels que le modèle les a renvoyés. */
  args?: Record<string, unknown>
  consommation?: Consommation
  echec?: Echec
  /**
   * Le modèle qui a effectivement répondu — pas celui qu'on a demandé.
   *
   * Sans ça, un basculement sur un secours est invisible : Jarvis répond, tout
   * va bien en apparence, et on ne découvre que le seau principal est vide
   * qu'au moment où le dernier secours lâche à son tour.
   */
  modele?: string
  /** Le fournisseur qui a répondu, pour la même raison. */
  fournisseur?: string
}

/** Un appel une fois le fournisseur, le modèle et la clé résolus. */
export interface AppelResolu extends AppelModele {
  modele: string
  cle: string
}

/** Ce qu'un moteur doit savoir faire pour entrer ici. */
export interface Fournisseur {
  nom: string
  /**
   * Faux = l'appeler coûte de l'argent à Raphaël.
   *
   * Ce drapeau n'est pas décoratif : il a découvert l'API Anthropic en voyant
   * sa clé à sec, sans avoir jamais choisi de payer ça. Rien ne doit pouvoir
   * basculer TOUT SEUL vers un moteur payant — ni un secours, ni la promotion
   * automatique du chantier 66a7a233. Il faut sa main sur le secret.
   */
  gratuit: boolean
  /** Le secret qui porte sa clé, et celui de nos vérifications. */
  secretCle: string
  secretCleEssai: string
  /**
   * Le modèle et ses secours pour ce rôle.
   *
   * `impose` vaut vrai quand la valeur vient d'un SECRET, c'est-à-dire d'une
   * main humaine. Elle l'emporte alors sur le choix automatique de la veille :
   * prendre le contre-pied d'une décision posée exprès est la faute que ce
   * projet évite partout ailleurs.
   */
  modeles(role: Role): { modele: string; secours: string[]; impose: boolean }
  /** UN appel HTTP, sans nouvel essai ni bascule : c'est le travail d'ici. */
  unEssai(appel: AppelResolu): Promise<ReponseFournisseur>
}

/**
 * Statuts pour lesquels un nouvel essai a du sens. 429 est le plus fréquent
 * sur l'offre gratuite : limite par minute atteinte, elle se lève seule. 529
 * est le « overloaded » d'Anthropic. Tout le reste (400, 403…) vient de la
 * requête ou de la clé et se reproduirait à l'identique.
 *
 * Le 0 n'est pas un statut HTTP : c'est notre code pour une coupure réseau,
 * passagère par nature. Il était rejoué avant ce refactor, il doit continuer
 * de l'être — l'oublier ici ferait abandonner Jarvis au premier hoquet de
 * connexion, sans que rien ne dise pourquoi.
 */
const STATUTS_A_REESSAYER = new Set([0, 408, 409, 429, 500, 502, 503, 504, 529])

/**
 * Statuts qui visent CE modèle-là, et pour lesquels changer de modèle rend la
 * main tout de suite là où insister ne donne rien.
 *
 * - 429 : le plafond gratuit est compté par modèle, le suivant a le sien.
 * - 503 « This model is currently experiencing high demand » : c'est la
 *   capacité de ce modèle chez le fournisseur qui manque, pas la nôtre.
 *   Constaté le 4 sept. 2026 : les DIX contrôles de
 *   scripts/verifier-commande-vocale.mjs sont tombés d'affilée là-dessus, sur
 *   une clé au quota intact — et Jarvis répondait « Le modèle est débordé » à
 *   Raphaël au même moment. On rejouait trois fois le modèle saturé, puis on
 *   abandonnait sans jamais essayer les secours, qui eux répondaient.
 * - 404 « no longer available to new users » : Google retire ses modèles sans
 *   prévenir, et sans les retirer de ListModels — gemini-2.5-flash et
 *   gemini-2.5-flash-lite sont tombés le même jour, alors qu'ils figuraient
 *   encore dans la liste. Un modèle disparu doit être SAUTÉ, pas faire
 *   abandonner toute la chaîne.
 */
const STATUTS_CHANGER_DE_MODELE = new Set([404, 429, 503, 529])

/** Trois essais au plus, ~15 s dans le pire des cas : l'app abandonne à 25 s. */
const ESSAIS_MAX = 3

/** Le fournisseur par défaut, et le seul qui soit gratuit aujourd'hui. */
export const FOURNISSEUR_PAR_DEFAUT = "gemini"

/** Les moteurs qu'on sait faire parler. Sert à le DIRE quand le secret se trompe. */
export const FOURNISSEURS_CONNUS = ["gemini", "anthropic"] as const

/**
 * Charge le moteur demandé, et LUI SEUL.
 *
 * Deux raisons, et la seconde est la vraie. La première : les fournisseurs
 * importent ce fichier pour ses types, donc un registre construit ici au
 * chargement ferait un cycle. La seconde : charger les deux à chaque appel
 * ferait dépendre Jarvis d'un moteur que Raphaël n'utilise pas — un fichier
 * mal déployé, un import cassé côté Anthropic, et la commande vocale meurt
 * alors que Gemini répondait très bien. Ce qui ne sert pas ne doit pas
 * pouvoir casser ce qui sert.
 */
async function chargerFournisseur(nom: string): Promise<Fournisseur | undefined> {
  if (nom === "gemini") return (await import("./gemini.ts")).gemini
  if (nom === "anthropic") return (await import("./anthropic.ts")).anthropic
  return undefined
}

/** Le nom demandé par le secret, tel quel — on ne le corrige pas en silence. */
export function nomFournisseurChoisi(): string {
  return (Deno.env.get("FOURNISSEUR") || FOURNISSEUR_PAR_DEFAUT).trim().toLowerCase()
}

/**
 * Ce qui manque pour que le moteur réponde, en une phrase — ou `null`.
 *
 * Appelée AVANT tout le reste par les fonctions, pour échouer tout de suite et
 * en nommant le secret exact plutôt qu'au bout d'un appel HTTP inutile.
 */
export async function moteurNonConfigure(essai = false): Promise<string | null> {
  const nom = nomFournisseurChoisi()
  const f = await chargerFournisseur(nom)
  if (!f) {
    return `Le secret FOURNISSEUR vaut « ${nom} », qui n'existe pas. Valeurs possibles : ${FOURNISSEURS_CONNUS.join(", ")}.`
  }
  if (!cleDe(f, essai)) {
    return `Clé du moteur non configurée côté serveur : le fournisseur « ${f.nom} » attend le secret ${f.secretCle}.`
  }
  return null
}

/**
 * La clé du fournisseur, celle de test d'abord quand on nous la demande.
 *
 * Si le secret de test manque, on retombe sur la clé normale : mieux vaut un
 * contrôle qui puise dans le quota de Raphaël qu'un contrôle qui ne tourne pas.
 * Mais ça ne doit pas être silencieux — d'où la trace, plus bas.
 */
function cleDe(f: Fournisseur, essai: boolean): string | undefined {
  const cleEssai = Deno.env.get(f.secretCleEssai)
  return (essai && cleEssai) || Deno.env.get(f.secretCle)
}

/**
 * Appelle le moteur en lui imposant l'outil, et renvoie ses arguments.
 *
 * Essaie le modèle principal du rôle, puis ses secours ; réessaie sur les
 * pannes passagères avec une attente croissante ; ne réessaie jamais une
 * requête refusée pour de bon.
 */
export async function appelerModele(appel: AppelModele): Promise<ResultatModele> {
  const nom = nomFournisseurChoisi()
  const f = await chargerFournisseur(nom)
  if (!f) {
    return {
      echec: {
        statut: 500,
        texte: `FOURNISSEUR inconnu : « ${nom} ».`,
        passager: false,
      },
    }
  }

  const cle = cleDe(f, appel.essai === true)
  if (!cle) {
    return {
      echec: {
        statut: 500,
        texte: `Clé du moteur non configurée côté serveur (${f.secretCle}).`,
        passager: false,
      },
    }
  }
  // Sans cette trace, une clé de test absente est invisible : les contrôles
  // passent au vert en vidant quand même le quota de Raphaël.
  if (appel.essai) {
    console.log(
      "clé",
      Deno.env.get(f.secretCleEssai) ? "test" : `normale (${f.secretCleEssai} absente)`,
    )
  }
  // Un moteur payant ne s'utilise jamais par accident : on l'écrit à chaque
  // appel, pour que ça se voie dans les journaux dès la première phrase.
  if (!f.gratuit) console.log("moteur payant", f.nom)

  const { modele, secours, impose } = f.modeles(appel.role)
  const choisi = impose ? null : await choixEnBase(appel, f)
  const candidats = choisi
    ? [choisi.modele, ...choisi.secours]
    : [modele, ...secours]
  let dernier: ResultatModele = {}

  for (const [rang, candidat] of candidats.entries()) {
    const debut = Date.now()
    dernier = await tenterUnModele(f, { ...appel, modele: candidat, cle })
    // Chaque candidat essayé laisse sa ligne, pas seulement celui qui répond :
    // sinon un secours sollicité tous les jours reste invisible, et on ne
    // découvre que le principal est mort qu'au moment où tout se tait.
    noter(appel, f.nom, candidat, dernier, Date.now() - debut, rang)
    if (!dernier.echec) return { ...dernier, modele: candidat, fournisseur: f.nom }
    // Quota atteint ou modèle saturé : le suivant a son propre seau et sa
    // propre capacité. Toute autre erreur (400, 403…) vient de la requête ou
    // de la clé et se reproduirait à l'identique, on s'arrête là.
    if (!STATUTS_CHANGER_DE_MODELE.has(dernier.echec.statut)) break
  }

  return { ...dernier, fournisseur: f.nom }
}

/** Ce que la veille a promu pour un rôle, quand elle a promu quelque chose. */
interface ChoixEnBase {
  modele: string
  secours: string[]
}

/**
 * Dix minutes de mémoire, et une seconde d'attente au plus.
 *
 * Cette lecture est sur le chemin de CHAQUE phrase de Raphaël. Une base lente
 * ne doit pas pouvoir rendre Jarvis lent, et une base injoignable ne doit
 * surtout pas le rendre muet : dans les deux cas on retombe sur ce que dit le
 * code, qui marche. Le cache fait qu'une instance chaude ne lit qu'une fois
 * par dizaine de minutes.
 */
const MEMOIRE_CHOIX_MS = 10 * 60 * 1000
const ATTENTE_CHOIX_MS = 1000
const choixConnus = new Map<Role, { lu: number; choix: ChoixEnBase | null }>()

/**
 * Vide cette mémoire. Pour les bancs d'essai UNIQUEMENT — en service, dix
 * minutes de cache sont exactement ce qu'on veut, et un appelant qui viderait
 * le cache à chaque phrase remettrait une lecture de base sur le chemin de
 * chacune d'elles.
 */
export function oublierChoixEnBase(): void {
  choixConnus.clear()
}

/**
 * Le modèle promu par la veille (chantier 66a7a233), ou `null`.
 *
 * TROIS PORTES DE SORTIE, et il faut les trois :
 *
 * 1. Pas de client Supabase sous la main (le banc d'essai, une fonction qui ne
 *    passe pas `journal`) → on ne lit rien.
 * 2. La ligne ne concerne pas le fournisseur en cours → on l'ignore. C'est le
 *    garde-fou de l'argent : sans lui, une ligne en base pourrait faire passer
 *    Jarvis sur un moteur PAYANT sans que Raphaël ait rien posé, alors qu'il a
 *    justement quitté l'API Anthropic en découvrant sa clé à sec.
 * 3. Lecture lente, en échec, ou vide → on retombe sur le code. Cette table ne
 *    peut qu'AJOUTER un choix, jamais casser celui qui marche.
 */
async function choixEnBase(appel: AppelModele, f: Fournisseur): Promise<ChoixEnBase | null> {
  if (!appel.journal) return null

  const connu = choixConnus.get(appel.role)
  if (connu && Date.now() - connu.lu < MEMOIRE_CHOIX_MS) return connu.choix

  let choix: ChoixEnBase | null = null
  try {
    const lecture = appel.journal.supabase.rpc("moteur_en_service", { p_role: appel.role })
    const reponse = await Promise.race([
      lecture,
      new Promise<null>((r) => setTimeout(() => r(null), ATTENTE_CHOIX_MS)),
    ])
    const ligne = (reponse as { data?: Array<Record<string, unknown>> } | null)?.data?.[0]
    if (ligne && ligne.fournisseur === f.nom && typeof ligne.modele === "string") {
      choix = {
        modele: ligne.modele,
        secours: Array.isArray(ligne.secours) ? (ligne.secours as string[]) : [],
      }
    }
  } catch {
    // Une panne de lecture ne doit pas se voir autrement que par le retour au
    // modèle du code : c'est le comportement d'avant ce chantier, et il marche.
    choix = null
  }

  choixConnus.set(appel.role, { lu: Date.now(), choix })
  return choix
}

/**
 * Note ce que l'appel a coûté, sans jamais gêner l'appel lui-même.
 *
 * Pas d'`await` chez l'appelant, erreurs avalées : la commande de Raphaël a
 * déjà été exécutée et sa réponse déjà donnée quand on arrive ici. Une
 * comptabilité qui casserait la commande qu'elle compte serait absurde.
 */
function noter(
  appel: AppelModele,
  fournisseur: string,
  modele: string,
  resultat: ResultatModele,
  ms: number,
  rang: number,
): void {
  if (!appel.journal) return
  const e = resultat.echec
  void appel.journal.supabase
    .rpc("noter_appel_modele", {
      p_fournisseur: fournisseur,
      p_role: appel.role,
      p_modele: modele,
      p_statut: e ? e.statut : 200,
      p_seau: e ? seauDuRefus(e) : null,
      p_entree: resultat.consommation?.entree ?? null,
      p_sortie: resultat.consommation?.sortie ?? null,
      p_reflexion: resultat.consommation?.reflexion ?? null,
      p_cache_lu: resultat.consommation?.cache_lu ?? null,
      p_ms: ms,
      p_essai: appel.essai === true,
      // 0 = le principal. C'est le serveur qui le sait : le principal se règle
      // par secret, et l'app ne peut pas lire les secrets.
      p_rang: rang,
    })
    .then(() => {}, () => {})
}

/**
 * Quel plafond a refusé — et c'est la distinction qui compte.
 *
 * Un 429 « par minute » se lève tout seul en soixante secondes ; un 429
 * « par jour » laisse Jarvis muet jusqu'au lendemain. Les deux se ressemblent
 * dans les journaux, et c'est ce qui a fait perdre du temps le 3 sept. : on
 * croyait à une saturation passagère alors que le seau du JOUR était vide.
 */
export function seauDuRefus(echec: Echec): "minute" | "jour" | "autre" {
  const id = echec.quota?.id ?? ""
  if (/PerDay/i.test(id)) return "jour"
  if (/PerMinute/i.test(id)) return "minute"
  return "autre"
}

async function tenterUnModele(f: Fournisseur, appel: AppelResolu): Promise<ResultatModele> {
  let dernier: Echec | undefined

  for (let essai = 1; essai <= ESSAIS_MAX; essai++) {
    const reponse = await f.unEssai(appel)

    if (!reponse.echec) {
      return { args: reponse.args, consommation: reponse.consommation }
    }

    // Inutile d'attendre ici quand l'appelant va changer de modèle : les trois
    // essais seraient dépensés sur celui qui vient de refuser, et le budget de
    // 25 s de l'app serait mangé avant d'avoir essayé les autres. Les autres
    // pannes passagères, elles, valent la peine d'être rejouées.
    const echec = reponse.echec
    const passager =
      !STATUTS_CHANGER_DE_MODELE.has(echec.statut) && STATUTS_A_REESSAYER.has(echec.statut)
    dernier = { ...echec, passager }

    // Un 429 « par jour » et un 429 « par minute » se ressemblent dans les
    // journaux, et n'ont rien à voir : le premier laisse Jarvis muet jusqu'au
    // lendemain. On écrit donc le seau concerné, pas juste l'échec.
    if (echec.statut === 429) {
      console.log(
        "quota",
        JSON.stringify({
          fournisseur: f.nom,
          modele: appel.modele,
          id: echec.quota?.id,
          limite: echec.quota?.limite,
        }),
      )
    }

    if (!passager || essai === ESSAIS_MAX) break

    const parDefaut = 2 ** (essai - 1) * 1000 + Math.random() * 300
    await new Promise((r) => setTimeout(r, Math.min(echec.attendreMs ?? parDefaut, 5000)))
  }

  return { echec: dernier }
}

/**
 * La phrase que Jarvis dit quand le moteur n'a pas répondu — la cause ET la
 * sortie, jamais du JSON brut à l'écran.
 *
 * ELLE NE NOMME AUCUN FOURNISSEUR, et c'est voulu : elle est recopiée mot pour
 * mot dans src/lib/erreurServeurVocal.ts, qui rattrape côté app ce que le
 * serveur ne peut pas habiller (fonction plantée, réseau coupé, session
 * expirée). Une phrase qui dirait « Gemini » obligerait à retoucher l'app à
 * chaque changement de moteur — exactement ce que ce chantier supprime.
 * `scripts/verifier-moteur.ts` refuse que les deux listes divergent.
 */
export function phrasePourEchec(echec: Echec | undefined): string {
  const detail = echec?.texte ?? ""
  if (/RESOURCE_EXHAUSTED|rate_limit|quota/i.test(detail) || echec?.statut === 429) {
    return "J'ai atteint la limite du moteur pour le moment. Redis-moi ça dans une minute ; si ça se répète toute la journée, c'est le quota du jour qui est épuisé."
  }
  if (
    /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|authentication_error/i.test(detail) ||
    echec?.statut === 403 ||
    echec?.statut === 401
  ) {
    return "La clé du moteur est refusée par le serveur : elle a dû être changée, révoquée, ou l'API n'est pas activée pour elle. Regarde les secrets côté Supabase."
  }
  if (/non configurée/i.test(detail)) {
    return "La clé du moteur n'est pas configurée côté serveur : je ne peux pas traiter ta demande."
  }
  if (echec?.passager) {
    return "Le modèle est débordé en ce moment. Redis-moi ça dans quelques secondes."
  }
  return "Je n'arrive pas à joindre le moteur en ce moment. Réessaie, et regarde les journaux de voice-command si ça dure."
}

/**
 * Lit une liste de modèles écrite dans un secret : « a, b , c » → [a, b, c].
 *
 * Partagé par les fournisseurs pour que `<X>_SECOURS` se comporte pareil
 * partout. Une valeur vide rend une liste vide, et non `[""]` — sinon on
 * essaierait un modèle sans nom, qui échoue en 404 après un aller-retour.
 */
export function listeDepuisSecret(nomSecret: string, parDefaut: string[]): string[] {
  const brut = Deno.env.get(nomSecret)
  if (brut === undefined) return parDefaut
  const liste = brut.split(",").map((m) => m.trim()).filter(Boolean)
  return liste
}
