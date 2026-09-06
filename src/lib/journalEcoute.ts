import { erreurDepuisEcoute, signalerErreur } from "@/lib/erreurs"
import { BUILD_VERSION } from "@/lib/version"

/**
 * Journal d'écoute : ce que fait réellement le micro, écrit en base.
 *
 * Le réveil au mot « Jarvis » ne marchait pas chez Raphaël, et rien ne
 * permettait de savoir pourquoi depuis un poste de développement : le
 * moteur de reconnaissance de son téléphone (Samsung) ne se reproduit pas
 * ici. Chaque rafale d'écoute laisse donc une trace — démarrage, nombre de
 * partiels reçus, mort silencieuse du service, durée, issue — qu'une session
 * Claude Code relit avec `scripts/sql.sh "select ... from journal_ecoute"`.
 *
 * Silencieux et sans attente : rien de ce qui est écrit ici ne doit ralentir
 * ni faire échouer une écoute. Les lignes partent par paquets, et une panne
 * réseau les perd sans bruit — c'est un journal, pas une donnée.
 *
 * Le client Supabase est chargé PARESSEUSEMENT : ce module est importé par
 * le moteur d'écoute, que le banc d'essai (scripts/harness) monte sans
 * aucune configuration Supabase. Un journal qui empêche le moteur de se
 * charger serait pire que pas de journal.
 */

type Detail = Record<string, string | number | boolean | null>

const TAMPON: Array<{ evenement: string; detail: Detail; at: string; version: string }> = []
let minuteur: ReturnType<typeof setTimeout> | null = null
let purgeFaite = false

/** Version de l'app qui tourne, pour lire le journal en sachant quoi. */
const versionApp = BUILD_VERSION ?? "web"

/** Ce qu'on garde d'un texte entendu : de quoi comprendre, pas de quoi relire. */
export function extraitEntendu(texte: string | null | undefined): string | null {
  if (!texte) return null
  const propre = texte.replace(/\s+/g, " ").trim()
  return propre.length > 80 ? `${propre.slice(0, 80)}…` : propre
}

/**
 * Quand Raphaël a parlé à Jarvis pour la dernière fois — en mémoire, pas en
 * base.
 *
 * Sert à UNE décision : pendant ses heures de silence, un rappel qu'il vient
 * de demander doit se dire à voix haute, alors que ce que Jarvis initie tout
 * seul reste muet (sa demande du 6 sept. 2026, chantier 4dec6918). C'est ici
 * plutôt que dans le moteur d'écoute parce que TOUT ce qui l'entend passe déjà
 * par `noterEcoute` : le micro classique, le mode Live, le widget. Un seul
 * point à brancher, aucun chemin oublié.
 *
 * En mémoire seulement, et c'est voulu : la question posée est « est-ce qu'il
 * s'en sert EN CE MOMENT ». Une valeur relue d'un stockage après un
 * redémarrage de l'app répondrait « oui » à propos d'hier soir.
 */
let derniereParoleMs = 0

/** Les événements qui prouvent qu'il a parlé, pas seulement que le micro a
 * tourné : une rafale qui finit sans rien entendre n'est pas une parole. */
const EVENEMENTS_PAROLE = new Set(["reponse", "live_commande"])

/** La dernière fois qu'il a parlé à Jarvis, ou null si jamais depuis
 * l'ouverture de l'app. */
export function derniereParole(): Date | null {
  return derniereParoleMs === 0 ? null : new Date(derniereParoleMs)
}

export function noterEcoute(evenement: string, detail: Detail = {}) {
  if (
    EVENEMENTS_PAROLE.has(evenement) ||
    (typeof detail.entendu === "string" && detail.entendu.trim() !== "")
  ) {
    derniereParoleMs = Date.now()
  }
  TAMPON.push({ evenement, detail, at: new Date().toISOString(), version: versionApp })
  if (!minuteur) minuteur = setTimeout(vider, 1500)

  // Ce journal est purgé à 7 jours et ne se lit qu'en SQL : un échec réel
  // (Live qui ne se connecte pas, serveur vocal qui refuse, micro qui
  // s'arrête sans rien entendre) y disparaissait sans que Raphaël puisse le
  // retrouver. Ceux-là passent aussi dans le registre des erreurs, qui, lui,
  // ne perd rien et se lit depuis le cockpit.
  const erreur = erreurDepuisEcoute(evenement, detail)
  if (erreur) {
    signalerErreur(erreur.categorie, erreur.titre, {
      detail: erreur.detail,
      source: erreur.source,
    })
  }
}

async function vider() {
  minuteur = null
  const lignes = TAMPON.splice(0, TAMPON.length)
  if (!lignes.length) return
  try {
    const { supabase } = await import("@/lib/supabase")
    await supabase.from("journal_ecoute").insert(lignes)
    if (!purgeFaite) {
      purgeFaite = true
      await supabase.rpc("purger_journal_ecoute")
    }
  } catch {
    // Un journal qui ne part pas ne doit jamais se voir — et un client
    // Supabase absent (banc d'essai) non plus.
  }
}
