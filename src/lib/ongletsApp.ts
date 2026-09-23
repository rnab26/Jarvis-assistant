import { sansAccents } from "./dateOrale.ts"

/**
 * Aller d'un onglet à l'autre de l'app, à la voix (chantier a9c75d52 :
 * « il doit tout maîtriser […] dans ce qu'il possède déjà »).
 *
 * MESURÉ le 23 sept. 2026 sur la commande locale, avant ce module :
 *   « ouvre le cockpit »   → open_app « Le cockpit » — une APPLICATION DU
 *                            TÉLÉPHONE qui porterait ce nom ;
 *   « ouvre la mémoire »   → open_app « La memoire » ;
 *   « ouvre les paramètres » → open_app « Les parametres » ;
 *   « va dans le cockpit » → la section « Le cockpit » de PARAMÈTRES, pas le
 *                            cockpit ;
 *   « emmène-moi dans mes notes », « va dans mes tâches » → rien compris.
 *
 * Pur, sans réseau (`scripts/verifier-onglets-app.ts`). La prudence est la
 * même que pour les sections de Paramètres : ce qui suit le verbe doit être
 * EN ENTIER un nom d'onglet (article compris). « ouvre WhatsApp », « ouvre
 * les notes de Mélissa », « va dans les réglages du cockpit » ne sont pas des
 * onglets et retombent sur les règles suivantes.
 */

export interface Onglet {
  chemin: "/" | "/cockpit" | "/documents" | "/notes" | "/programme" | "/memoire" | "/settings"
  /** Ce que Jarvis dit : « Je t'ouvre le cockpit. » */
  dit: string
}

/** Les noms tels qu'il les dit, APLATIS (sans accents, en minuscules). Les
 * libellés de la barre d'onglets (DashboardLayout.tsx) y sont tous. */
const NOMS: Record<string, Onglet> = {}
function declarer(onglet: Onglet, noms: string[]) {
  for (const n of noms) NOMS[n] = onglet
}
declarer({ chemin: "/", dit: "tes tâches" }, ["taches", "liste de taches", "listes de taches", "accueil"])
declarer({ chemin: "/cockpit", dit: "le cockpit" }, ["cockpit", "cockpit dev", "chantiers", "cockpit de dev"])
declarer({ chemin: "/documents", dit: "tes documents" }, ["documents", "docs", "doc"])
declarer({ chemin: "/notes", dit: "tes notes" }, ["notes", "notes personnelles"])
declarer({ chemin: "/programme", dit: "ce qui est programmé" }, [
  "programme",
  "programmes",
  "messages programmes",
  "envois programmes",
  "programmation",
])
declarer({ chemin: "/memoire", dit: "ta mémoire" }, ["memoire", "memoire de jarvis", "souvenirs", "conversations"])
declarer({ chemin: "/settings", dit: "les paramètres" }, ["parametres", "reglages"])

const VERBE =
  /^(?:ouvre(?:[- ]moi)?|affiche(?:[- ]moi)?|montre(?:[- ]moi)?|va(?:s)?\s+(?:dans|sur|voir|a)|emmene[- ]?moi\s+(?:dans|sur|a)|amene[- ]?moi\s+(?:dans|sur|a)|retourne\s+(?:dans|sur|a)|reviens\s+(?:dans|sur|a)|passe\s+(?:dans|sur|a))\s+(.+)$/

/** L'enveloppe autour du nom : « l'onglet », « la page », « l'écran », un
 * article ou un possessif. */
const ENVELOPPE =
  /^(?:(?:l['’]\s*|le\s+|la\s+)?(?:onglet|page|ecran)\s+(?:des\s+|du\s+|de\s+la\s+|de\s+l['’]\s*|de\s+)?)?(?:les\s+|le\s+|la\s+|l['’]\s*|mes\s+|mon\s+|ma\s+|ton\s+|ta\s+|tes\s+)?(.+)$/

/** L'onglet désigné par la phrase (déjà APLATIE par la commande locale), ou
 * `null` : on ne devine jamais. */
export function ongletDemande(texteAplati: string): Onglet | null {
  const t = sansAccents(texteAplati).replace(/[?!.]+$/g, "").trim()
  const verbe = VERBE.exec(t)
  if (!verbe) return null
  const enveloppe = ENVELOPPE.exec(verbe[1].trim())
  const nom = (enveloppe?.[1] ?? verbe[1]).trim()
  return NOMS[nom] ?? null
}
