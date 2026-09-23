import type { DevItem } from "@/types/database"
import type { Consommation } from "./consommationModele.ts"
import { pastilleQuota } from "./consommationModele.ts"
import { marqueurDe } from "./marqueurChantier.ts"
import type { PrefsNotifications } from "./notifications/prefs.ts"

/**
 * Ce que Jarvis disait ne pas savoir faire, alors que l'app le sait
 * (23 sept. 2026, relu dans ses 409 vraies dictées) :
 *
 *   « mets-toi à jour », « installe la dernière version » (4 fois : 6, 7 ×2,
 *     19 sept.) → « Je ne peux pas lancer la mise à jour moi-même » — alors
 *     que la mise à jour rapide s'applique d'un appel ;
 *   « montre-moi / dis tes nouvelles fonctionnalités » (3 fois le 17 sept.)
 *     → « va dans Paramètres » — alors que le cockpit sait ce qui a été livré ;
 *   « est-ce qu'il me reste assez de crédit ? » (5 sept.) → « je n'ai pas
 *     accès à ton solde » — alors que la consommation est comptée en base ;
 *   « désactive le point du matin jusqu'à nouvel ordre » (15 sept.)
 *     → « je ne peux pas, va dans Paramètres ».
 *
 * Reconnu SUR L'APPAREIL (commandeLocale.ts) : aucune de ces questions n'a
 * besoin du modèle, et elles marchent donc sans redéployer le serveur. Pur,
 * vérifié par `scripts/verifier-capacites-voix.ts`. Les phrases reçues sont
 * déjà APLATIES (sans accents, en minuscules) par la commande locale.
 */

/** Une phrase qui CRÉE quelque chose (« ouvre un chantier pour les nouvelles
 * fonctionnalités ») n'est pas une question : on ne la détourne jamais. */
function creeQuelqueChose(t: string): boolean {
  return /\b(chantier|tache|note|rappel|message)\b/.test(t) || /^(?:ajoute|rajoute|cree|creer|ouvre un|ouvrir un|note|lance un)/.test(t)
}

/* ────────────────────────── La mise à jour ────────────────────────── */

export type DemandeMaj = "faire" | "question"

export function demandeMiseAJour(t: string): DemandeMaj | null {
  if (creeQuelqueChose(t)) return null
  const objet = "(?:l'?\\s*app(?:lication|li)?(?: jarvis)?|jarvis|la version(?: de l'?\\s*app(?:lication)?| d'?\\s*app(?:lication)?)?|la derniere version|toi)"
  if (
    new RegExp(`^mets?[- ]?(?:toi|te) a jour\\b`).test(t) ||
    new RegExp(`^mets? a jour ${objet}$`).test(t) ||
    /^(?:installe|telecharge|applique)(?:[- ]moi)? (?:la |une )?(?:derniere|nouvelle) (?:version|mise a jour)\b/.test(t) ||
    /^(?:fais|lance|fait) (?:la |une )?mise a jour(?: de l'?\s*app(?:lication)?| de jarvis)?$/.test(t)
  ) {
    return "faire"
  }
  if (
    /^(?:est[- ]ce qu'?\s*)?(?:il y a|y a[- ]t[- ]il|ya) (?:une )?(?:nouvelle version|mise a jour|maj)(?: disponible)?$/.test(t) ||
    /^(?:est[- ]ce que )?(?:tu es|t'?es|l'?\s*app(?:lication)? est) a jour$/.test(t)
  ) {
    return "question"
  }
  return null
}

/** Ce que l'app sait de sa version, au moment de la phrase. */
export interface EtatMaj {
  /** Dans l'app Android (la mise à jour rapide n'existe que là). */
  natif: boolean
  status: "checking" | "up-to-date" | "update-available" | "unknown"
  buildPublie: number | null
  /** La mise à jour rapide suffit (le natif n'a pas changé). */
  rapidePossible: boolean
  /** Pourquoi elle ne suffit pas, quand elle ne suffit pas. */
  raison: string | null
}

export type GesteMaj = "appliquer" | "ouvrir_parametres" | "recharger" | null

/** Quoi dire, et quel geste faire APRÈS l'avoir dit (appliquer redémarre
 * l'app : la phrase doit être dite avant). */
export function decisionMaj(demande: DemandeMaj, e: EtatMaj): { phrase: string; geste: GesteMaj } {
  if (!e.natif) {
    return demande === "faire"
      ? { phrase: "Sur le site, tu as toujours la dernière version. Je recharge la page.", geste: "recharger" }
      : { phrase: "Sur le site, tu as toujours la dernière version : il se met à jour tout seul.", geste: null }
  }
  if (e.status === "checking") {
    return { phrase: "Je suis en train de vérifier s'il y a une nouvelle version. Redemande-moi dans quelques secondes.", geste: null }
  }
  if (e.status === "unknown") {
    return {
      phrase: "Je n'arrive pas à savoir s'il y a une nouvelle version : le serveur des versions ne répond pas. Je t'ouvre l'écran de mise à jour.",
      geste: "ouvrir_parametres",
    }
  }
  if (e.status === "up-to-date") {
    const build = e.buildPublie ? ` (version ${e.buildPublie})` : ""
    return { phrase: `Tu as déjà la dernière version${build}. Rien à installer.`, geste: null }
  }
  // Une version attend.
  const build = e.buildPublie ? ` ${e.buildPublie}` : ""
  if (demande === "question") {
    return e.rapidePossible
      ? { phrase: `Oui, la version${build} est disponible. Dis « mets-toi à jour » et je l'installe tout de suite.`, geste: null }
      : { phrase: `Oui, la version${build} est disponible, mais elle touche la partie Android : il faut installer l'application. Dis « mets-toi à jour » et je t'ouvre l'écran.`, geste: null }
  }
  if (e.rapidePossible) {
    return { phrase: `J'installe la version${build}. Je redémarre dans quelques secondes.`, geste: "appliquer" }
  }
  return {
    phrase: `La version${build} touche la partie Android : elle s'installe en application, pas en mise à jour rapide. Je t'ouvre l'écran, appuie sur « Mettre à jour ».`,
    geste: "ouvrir_parametres",
  }
}

/* ─────────────────────── Quoi de neuf / à essayer ─────────────────────── */

export type DemandeNouveautes = "nouveautes" | "a_essayer"

export function demandeNouveautes(t: string): DemandeNouveautes | null {
  if (t.length > 160) return null
  if (/^(?:ajoute|rajoute|cree|creer|ouvre|ouvrir|note|lance|mets)\b/.test(t)) return null
  if (
    /\b(?:qu'?\s*est[- ]ce que|qu'?\s*est[- ]ce qu'?\s*il|quoi|qu'?\s*ai[- ]je|que dois[- ]je)\b.*\b(?:essayer|tester|constater|verifier)\b/.test(t) ||
    /\b(?:a essayer|a tester|a constater)\b/.test(t) && /\b(?:quoi|qu'?\s*est|reste|dois|liste|dis)\b/.test(t)
  ) {
    return "a_essayer"
  }
  if (
    /^quoi de neuf\b/.test(t) ||
    /\bnouvelles? fonctionnalites?\b/.test(t) ||
    /\bnouveautes?\b/.test(t) ||
    /^qu'?\s*est[- ]ce qui (?:a ete|est) (?:livre|nouveau|ajoute)\b/.test(t) ||
    /^qu'?\s*est[- ]ce que tu (?:as appris|sais faire) de nouveau\b/.test(t)
  ) {
    // « montre-moi les nouvelles fonctionnalités », « dis tes nouvelles
    // fonctionnalités » : ce sont ses mots. Une phrase de création (plus
    // haut) ou qui parle d'un chantier n'en est pas une.
    if (/\bchantier\b/.test(t) && !/\blivre/.test(t)) return null
    return "nouveautes"
  }
  return null
}

const JOURS_NOUVEAUTES = 7
const TITRES_MAX = 5

function listeTitres(titres: string[]): string {
  const vus = titres.slice(0, TITRES_MAX).map((x) => `« ${x.replace(/\s+/g, " ").trim()} »`)
  const reste = titres.length - vus.length
  return vus.join(", ") + (reste > 0 ? `, et ${reste} autre${reste > 1 ? "s" : ""}` : "")
}

/** Les chantiers livrés ces sept derniers jours, le plus récent d'abord. */
export function phraseNouveautes(items: ReadonlyArray<DevItem>, maintenant: number): string {
  const depuis = maintenant - JOURS_NOUVEAUTES * 24 * 3600_000
  const livres = items
    .filter((i) => i.archived_at && i.status === "done" && Date.parse(i.archived_at) >= depuis)
    .sort((a, b) => Date.parse(b.archived_at!) - Date.parse(a.archived_at!))
  const aEssayer = items.filter((i) => !i.archived_at && marqueurDe(i) === "a_constater")
  if (livres.length === 0 && aEssayer.length === 0) {
    return "Rien de nouveau de livré ces sept derniers jours."
  }
  const parties: string[] = []
  if (livres.length) {
    parties.push(`Ces sept derniers jours, ${livres.length} chantier${livres.length > 1 ? "s ont été livrés" : " a été livré"} : ${listeTitres(livres.map((i) => i.title))}.`)
  }
  if (aEssayer.length) {
    parties.push(`Et ${aEssayer.length} attend${aEssayer.length > 1 ? "ent" : ""} que tu l'essaies sur ton téléphone — demande-moi « qu'est-ce que je dois essayer » pour la liste.`)
  }
  return parties.join(" ")
}

/** Les chantiers livrés qui attendent SON essai (marqueur « à constater »). */
export function phraseAEssayer(items: ReadonlyArray<DevItem>): string {
  const aEssayer = items
    .filter((i) => !i.archived_at && marqueurDe(i) === "a_constater")
    .sort((a, b) => (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1))
  if (aEssayer.length === 0) return "Rien n'attend ton essai en ce moment."
  return `${aEssayer.length} chantier${aEssayer.length > 1 ? "s attendent" : " attend"} ton essai : ${listeTitres(aEssayer.map((i) => i.title))}. Dans le cockpit, chacun a « Ça marche » et « Ça ne marche pas ».`
}

/* ───────────────────────────── Le quota ───────────────────────────── */

export function demandeConsommation(t: string): boolean {
  if (creeQuelqueChose(t)) return false
  return (
    /\b(?:credits?|quotas?)\b/.test(t) &&
    /\b(?:reste|restent|combien|ou en est|ou j'?en suis|assez|consomme|consommation|utilise)\b/.test(t)
  ) || /^combien (?:de phrases|de requetes|de questions) (?:il )?me reste/.test(t)
}

/** JAMAIS de pourcentage ni de solde inventé : il n'y en a pas sur l'offre
 * gratuite. On dit ce qui est compté, et un reste SEULEMENT si un plafond a
 * été mesuré — la même règle que la pastille sous le cœur, dont on reprend
 * le verdict pour ne pas dire autre chose qu'elle. */
export function phraseConsommation(resume: Consommation | null): string {
  if (!resume) {
    return "Je n'arrive pas à lire ma consommation en ce moment. Le détail est dans Paramètres, section Le cockpit."
  }
  const phrases = `${resume.phrases} phrase${resume.phrases > 1 ? "s" : ""}`
  if (!resume.modele || resume.phrases === 0) {
    return "Tu ne m'as encore rien demandé aujourd'hui : tout le quota du jour est devant toi."
  }
  const pastille = pastilleQuota(resume)
  if (resume.refusJour > 0) {
    return `Le quota gratuit du jour est épuisé après ${phrases}. Il se recharge demain ; d'ici là je peux refuser de répondre.`
  }
  if (resume.surSecours) {
    return `Tu m'as parlé ${phrases} aujourd'hui, et je tourne sur un moteur de secours : le principal a atteint sa limite. Tu peux continuer à me parler normalement.`
  }
  if (pastille && /avant le plafond/.test(pastille.texte)) {
    return `Tu m'as parlé ${phrases} aujourd'hui. Il t'en reste environ ${pastille.texte.replace(/ avant le plafond du jour$/, "")} avant le plafond du jour — largement de quoi parler normalement.`
  }
  return `Tu m'as parlé ${phrases} aujourd'hui, sans aucun refus. Il n'y a pas de solde sur l'offre gratuite : tant qu'aucun refus n'arrive, tu peux parler normalement.`
}

/* ─────────────────────────── Les notifications ─────────────────────────── */

export type CleNotifVoix = "matin" | "echeance" | "apk" | "livre" | "bloque" | "silenceNuit" | "direAVoixHaute"

/** Ses mots, vers la clé de `PrefsNotifications`. L'ordre compte : le plus
 * précis d'abord. */
const NOTIFS: ReadonlyArray<{ cle: CleNotifVoix; motif: RegExp; dit: string }> = [
  { cle: "matin", motif: /\b(?:point|briefing|resume|recap(?:itulatif)?) du matin\b|\bbriefing\b/, dit: "le point du matin" },
  { cle: "echeance", motif: /\brappels? (?:d'?\s*echeances?|des taches|de taches)\b|\bnotifications? (?:d'?\s*echeances?|des taches)\b/, dit: "les rappels d'échéance des tâches" },
  { cle: "apk", motif: /\bnotifications? (?:de|des) (?:mises? a jour|nouvelles versions?)\b/, dit: "l'annonce des nouvelles versions" },
  { cle: "livre", motif: /\bnotifications? (?:de|des) chantiers livres\b|\bchantiers livres\b/, dit: "l'annonce des chantiers livrés" },
  { cle: "bloque", motif: /\bsessions? bloquees?\b/, dit: "l'annonce des sessions bloquées" },
  { cle: "silenceNuit", motif: /\bheures? de silence\b|\bmode nuit\b/, dit: "les heures de silence" },
  { cle: "direAVoixHaute", motif: /\blecture (?:a voix haute )?des notifications\b|\blire les notifications a voix haute\b/, dit: "la lecture des notifications à voix haute" },
]

export type CommandeNotif =
  | { cle: CleNotifVoix; valeur: boolean; dit: string }
  | { cle: "heureMatin"; valeur: string; dit: string }

export function commandeNotif(t: string): CommandeNotif | null {
  if (t.length > 140) return null
  const heure = t.match(/^(?:mets|passe|decale|programme|regle|avance|recule)(?:[- ]moi)? (?:le )?(?:point|briefing|resume) du matin (?:a|pour) (\d{1,2}) ?h(?:eures?)? ?(\d{2})?$/)
  if (heure) {
    const h = Number(heure[1])
    const m = Number(heure[2] ?? "0")
    if (h > 23 || m > 59) return null
    const hhmm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    return { cle: "heureMatin", valeur: hhmm, dit: `à ${h} h${m ? String(m).padStart(2, "0") : ""}` }
  }
  const verbe = t.match(/^(desactive|coupe|arrete|supprime|enleve|retire|stoppe|active|reactive|remets|rallume|allume|relance)(?:[- ]moi)? (.+)$/)
  if (!verbe) return null
  const reste = verbe[2]
  const trouve = NOTIFS.find((n) => n.motif.test(reste))
  if (!trouve) return null
  // Tout ce qui n'est pas le nom de la notification doit être un article ou
  // une précision de durée : « coupe le point du matin et appelle Yoni » est
  // une autre demande, rendue au serveur.
  const residu = reste
    .replace(trouve.motif, " ")
    .replace(/\b(?:le|la|les|l'|des|de|du|notifications?|jusqu'?\s*a nouvel ordre|pour l'?\s*instant|pour le moment|definitivement|tous les jours|s'?\s*il te plait|stp)\b/g, " ")
    .replace(/['’]/g, " ")
    .trim()
  if (residu) return null
  const allume = /^(?:active|reactive|remets|rallume|allume|relance)$/.test(verbe[1])
  return { cle: trouve.cle, valeur: allume, dit: trouve.dit }
}

export function phraseNotif(c: CommandeNotif, avant: PrefsNotifications): string {
  if (c.cle === "heureMatin") {
    return avant.matin
      ? `C'est noté : le point du matin arrivera désormais ${c.dit}.`
      : `C'est noté pour ${c.dit}, mais le point du matin est coupé : dis « réactive le point du matin » pour le recevoir.`
  }
  if (avant[c.cle] === c.valeur) {
    return `C'était déjà ${c.valeur ? "activé" : "coupé"} : ${c.dit}.`
  }
  return c.valeur ? `C'est réactivé : ${c.dit}.` : `C'est coupé : ${c.dit}. Dis « réactive ${c.dit} » pour le remettre.`
}
