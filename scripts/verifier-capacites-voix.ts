/**
 * Ce que Jarvis disait ne pas savoir faire, alors que l'app le sait.
 *
 *   node --experimental-strip-types scripts/verifier-capacites-voix.ts
 *
 * Aucun réseau. Les phrases « à reconnaître » sont les SIENNES, relues dans
 * `echanges` le 23 sept. 2026 ; la moitié des contrôles vérifie ce qui ne
 * doit PAS être pris (une tâche à mettre à jour, un chantier à créer).
 */
import type { DevItem } from "../src/types/database.ts"
import type { Consommation } from "../src/lib/consommationModele.ts"
import { PREFS_NOTIFS_DEFAUT } from "../src/lib/notifications/prefs.ts"
import {
  commandeNotif,
  decisionMaj,
  demandeConsommation,
  demandeMiseAJour,
  demandeNouveautes,
  phraseAEssayer,
  phraseConsommation,
  phraseNotif,
  phraseNouveautes,
  type EtatMaj,
} from "../src/lib/capacitesVoix.ts"
import { interpreterLocalement } from "../src/lib/commandeLocale.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}
const local = (phrase: string) => interpreterLocalement(phrase, {})?.[0] as Record<string, unknown> | undefined

// ── La mise à jour ──
for (const p of ["mets à jour la version d'application", "Installe la dernière version disponible", "mets-toi à jour avec la dernière mise à jour"]) {
  const a = local(p)
  verifier(`« ${p} » → mise à jour (sa vraie phrase)`, a?.action === "update_app" && a.mode === "faire", JSON.stringify(a))
}
verifier("« est-ce qu'il y a une mise à jour ? » → une question, pas un geste", local("est-ce qu'il y a une mise à jour ?")?.mode === "question")
verifier("« mets à jour la tâche Easy » n'est PAS la mise à jour de l'app", demandeMiseAJour("mets a jour la tache easy") === null)
verifier("« mets à jour le chantier micro » non plus", local("mets à jour le chantier micro")?.action !== "update_app")
{
  const e: EtatMaj = { natif: true, status: "update-available", buildPublie: 412, rapidePossible: true, raison: null }
  const d = decisionMaj("faire", e)
  verifier("une version rapide attend : il l'installe, APRÈS l'avoir dit", d.geste === "appliquer" && d.phrase.includes("412"), JSON.stringify(d))
  const q = decisionMaj("question", e)
  verifier("à une QUESTION il répond, il n'installe rien", q.geste === null && q.phrase.startsWith("Oui"), JSON.stringify(q))
  const apk = decisionMaj("faire", { ...e, rapidePossible: false, raison: "natif changé" })
  verifier("le natif a changé : il ouvre l'écran, il ne prétend pas installer", apk.geste === "ouvrir_parametres" && /application/.test(apk.phrase), JSON.stringify(apk))
  const ajour = decisionMaj("faire", { ...e, status: "up-to-date" })
  verifier("déjà à jour : il le dit, aucun geste", ajour.geste === null && /déjà la dernière/.test(ajour.phrase), JSON.stringify(ajour))
  const inconnu = decisionMaj("faire", { ...e, status: "unknown" })
  verifier("GitHub muet : il ne dit ni « à jour » ni « rien à faire »", !/déjà la dernière/.test(inconnu.phrase) && inconnu.geste === "ouvrir_parametres", JSON.stringify(inconnu))
}

// ── Quoi de neuf / à essayer ──
verifier("« Montre-moi les nouvelles fonctionnalités » (17 sept.)", local("Montre-moi les nouvelles fonctionnalités")?.action === "whats_new")
verifier("« qu'est-ce que je dois essayer ? »", local("qu'est-ce que je dois essayer ?")?.quoi === "a_essayer")
verifier("« qu'est-ce qu'il me reste à constater »", demandeNouveautes("qu'est-ce qu'il me reste a constater") === "a_essayer")
verifier(
  "« créer un chantier pour annoncer les nouvelles fonctionnalités » reste un chantier",
  local("créer un chantier pour annoncer les nouvelles fonctionnalités")?.action !== "whats_new",
)
{
  const MAINTENANT = Date.parse("2026-09-23T12:00:00Z")
  const item = (id: string, title: string, notes: string | null, archived_at: string | null, status = "todo", priority = "normal") =>
    ({ id, title, notes, archived_at, status, priority, theme: null }) as unknown as DevItem
  const items = [
    item("a", "La bulle se range en la glissant", "Fait.", "2026-09-23T10:00:00Z", "done"),
    item("b", "Ouvrir le cockpit à la voix", "Fait.", "2026-09-22T10:00:00Z", "done"),
    item("c", "Vieux chantier", "Fait.", "2026-09-01T10:00:00Z", "done"),
    item("d", "Notes à la voix", "[LIVRÉ — RESTE À CONSTATER SUR SON TÉLÉPHONE] fait", null, "todo", "high"),
    item("e", "Réparer le micro", "[LIBRE] à faire", null),
  ]
  const n = phraseNouveautes(items, MAINTENANT)
  verifier("les livrés des 7 jours, le plus récent d'abord", n.indexOf("La bulle") < n.indexOf("Ouvrir le cockpit") && n.includes("2 chantiers"), n)
  verifier("…jamais un livré d'il y a trois semaines", !n.includes("Vieux chantier"), n)
  const e = phraseAEssayer(items)
  verifier("« à essayer » = le marqueur « à constater », pas un [LIBRE]", e.includes("Notes à la voix") && !e.includes("Réparer le micro"), e)
  verifier("rien de livré : il le dit, il n'invente rien", phraseNouveautes([item("e", "x", "[LIBRE]", null)], MAINTENANT).startsWith("Rien de nouveau"))
}

// ── Le quota ──
verifier("« est-ce qu'il me reste assez de crédit pour parler avec toi normalement ? » (5 sept.)", local("est-ce qu'il me reste assez de crédit pour parler avec toi normalement ?")?.action === "usage_report")
verifier("« ajouter un chantier pour afficher le quota à côté du cœur » reste un chantier", !demandeConsommation("ajouter un chantier pour afficher le quota d'utilisation de jarvis a cote du coeur"))
{
  const base = { modele: "gemini-3.1-flash-lite", phrases: 42, refusJour: 0, surSecours: false, msMedian: 1200, quotaFrais: null } as unknown as Consommation
  const p = phraseConsommation(base)
  verifier("aucun plafond mesuré : un compte, JAMAIS un pourcentage ni un solde", p.includes("42 phrases") && !/%|solde restant/.test(p), p)
  verifier("quota du jour vide : dit tel quel", phraseConsommation({ ...base, refusJour: 3 }).includes("épuisé"))
  verifier("lecture impossible : il le dit, il ne dit pas « tout va bien »", phraseConsommation(null).includes("n'arrive pas à lire"))
}

// ── Les notifications ──
{
  const a = local("désactive le point du matin jusqu'à nouvel ordre")
  verifier("« désactive le point du matin jusqu'à nouvel ordre » (15 sept.)", a?.action === "set_notif_pref" && a.cle === "matin" && a.valeur === false, JSON.stringify(a))
  const h = commandeNotif("mets le point du matin a 8h30")
  verifier("« mets le point du matin à 8h30 »", h?.cle === "heureMatin" && h.valeur === "08:30", JSON.stringify(h))
  verifier("« réactive le point du matin »", commandeNotif("reactive le point du matin")?.valeur === true)
  verifier("« coupe le point du matin et appelle Yoni » : deux demandes, rendue au serveur", commandeNotif("coupe le point du matin et appelle yoni") === null)
  verifier("« active le mot-clé de réveil » n'est pas une notification", commandeNotif("active le mot-cle de reveil") === null)
  verifier("déjà coupé : il le dit", phraseNotif({ cle: "matin", valeur: false, dit: "le point du matin" }, { ...PREFS_NOTIFS_DEFAUT, matin: false }).startsWith("C'était déjà"))
  verifier("une heure réglée alors qu'il est coupé : il le signale", phraseNotif({ cle: "heureMatin", valeur: "08:00", dit: "à 8 h" }, { ...PREFS_NOTIFS_DEFAUT, matin: false }).includes("coupé"))
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
