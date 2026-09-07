/**
 * Vérifie ce que Jarvis apprend de ses propres notifications — la partie
 * pure : les statistiques par canal, ce qui compte comme « peu suivi », et
 * que ça n'ajuste QUE l'annonce vocale d'un sous-ensemble de canaux jamais
 * critiques.
 *
 *   node --experimental-strip-types scripts/verifier-apprentissage-notifications.ts
 *
 * Chantier 05241cc7, 7 sept. 2026. Réponse de Raphaël, 6 sept. : « Oui, qu'il
 * apprenne. »
 */
import {
  CANAUX_AJUSTABLES,
  DELAI_JUGEMENT_MS,
  ECHANTILLON_MIN,
  SEUIL_PEU_SUIVI,
  insistanceReduite,
  peuSuivi,
  statsParCanal,
  type EntreeJournalNotif,
} from "../src/lib/notifications/apprentissage.ts"
import { phraseAnnonce, raisonDuSilence } from "../src/lib/notifications/annonceVocale.ts"
import { PREFS_NOTIFS_DEFAUT } from "../src/lib/notifications/prefs.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = new Date("2026-09-07T12:00:00")
const iso = (heuresAvant: number) => new Date(MAINTENANT.getTime() - heuresAvant * 3_600_000).toISOString()

function entree(canal: string, heuresAvant: number, ouverte: boolean): EntreeJournalNotif {
  return {
    canal,
    envoyee_at: iso(heuresAvant),
    ouverte_at: ouverte ? iso(heuresAvant - 0.1) : null,
  }
}

// ── Les canaux ajustables sont exactement ceux qu'on attend, jamais plus ──
verifier(
  "l'échéance d'une tâche n'est jamais ajustable",
  !CANAUX_AJUSTABLES.includes("taches"),
)
verifier("les rappels de nuit ne sont pas ajustables", !CANAUX_AJUSTABLES.includes("nuit"))
verifier("les mises à jour de l'app ne sont pas ajustables", !CANAUX_AJUSTABLES.includes("app"))
verifier(
  "matin, livraisons et blocages le sont",
  CANAUX_AJUSTABLES.includes("matin") &&
    CANAUX_AJUSTABLES.includes("livraisons") &&
    CANAUX_AJUSTABLES.includes("blocages"),
)

// ── Jugement : une notification trop récente n'est pas encore un verdict ──
{
  const journal = [entree("matin", 1, false)] // envoyée il y a 1 h, pas ouverte
  const stats = statsParCanal(journal, MAINTENANT)
  verifier(
    "une notification récente non ouverte n'est pas encore jugée",
    stats.matin?.jugees === 0 && stats.matin?.taux === null,
  )
}
{
  const heuresPasseeLeDelai = DELAI_JUGEMENT_MS / 3_600_000 + 1
  const journal = [entree("matin", heuresPasseeLeDelai, false)]
  const stats = statsParCanal(journal, MAINTENANT)
  verifier(
    "passé le délai de jugement, une notification non ouverte compte comme ignorée",
    stats.matin?.jugees === 1 && stats.matin?.taux === 0,
  )
}
{
  const journal = [entree("matin", 1, true)] // ouverte tout de suite
  const stats = statsParCanal(journal, MAINTENANT)
  verifier(
    "une notification ouverte est jugée immédiatement, pas besoin d'attendre",
    stats.matin?.jugees === 1 && stats.matin?.taux === 1,
  )
}

// ── peuSuivi : échantillon minimum ET taux bas, les deux à la fois ──
{
  const troisIgnorees = Array.from({ length: 3 }, () => entree("livraisons", 72, false))
  const stats = statsParCanal(troisIgnorees, MAINTENANT).livraisons
  verifier(
    `${ECHANTILLON_MIN - 3} de plus manquent avant d'en tirer une conclusion : échantillon trop petit malgré un taux à 0`,
    stats !== undefined && !peuSuivi(stats),
  )
}
{
  const beaucoupIgnorees = Array.from({ length: ECHANTILLON_MIN + 5 }, () =>
    entree("livraisons", 72, false),
  )
  const stats = statsParCanal(beaucoupIgnorees, MAINTENANT).livraisons
  verifier(
    "assez d'échantillon et un taux sous le seuil : peu suivi",
    stats !== undefined && (stats.taux ?? 1) < SEUIL_PEU_SUIVI && peuSuivi(stats),
  )
}
{
  const beaucoupOuvertes = Array.from({ length: ECHANTILLON_MIN + 5 }, () =>
    entree("livraisons", 72, true),
  )
  const stats = statsParCanal(beaucoupOuvertes, MAINTENANT).livraisons
  verifier(
    "assez d'échantillon mais bien suivi : pas peu suivi",
    stats !== undefined && !peuSuivi(stats),
  )
}

// ── insistanceReduite : la porte qui protège les canaux critiques ──
{
  const journalTachesIgnorees = Array.from({ length: 20 }, () => entree("taches", 72, false))
  const stats = statsParCanal(journalTachesIgnorees, MAINTENANT)
  verifier(
    "même vingt échéances ignorées d'affilée, l'insistance de « taches » n'est JAMAIS réduite",
    !insistanceReduite("taches", stats),
  )
}
{
  const journalNuitIgnorees = Array.from({ length: 20 }, () => entree("nuit", 72, false))
  const stats = statsParCanal(journalNuitIgnorees, MAINTENANT)
  verifier("« nuit » non plus, ce n'est pas un canal ajustable", !insistanceReduite("nuit", stats))
}
{
  const journal = Array.from({ length: ECHANTILLON_MIN + 5 }, () => entree("blocages", 72, false))
  const stats = statsParCanal(journal, MAINTENANT)
  verifier(
    "un canal ajustable et peu suivi voit son insistance réduite",
    insistanceReduite("blocages", stats),
  )
}

// ── L'intégration avec annonceVocale.ts : ça ne coupe QUE l'annonce vocale ──
{
  const ctx = {
    prefs: PREFS_NOTIFS_DEFAUT,
    voixCoupee: false,
    maintenant: MAINTENANT,
    canalPeuSuivi: true,
  }
  const notif = { title: "3 chantiers livrés", body: "A, B et un autre" }
  verifier(
    "canal peu suivi : la raison du silence le dit",
    raisonDuSilence(notif, ctx) === "peu_suivi",
  )
  verifier("canal peu suivi : rien n'est dit à voix haute", phraseAnnonce(notif, ctx) === null)
}
{
  const ctx = {
    prefs: PREFS_NOTIFS_DEFAUT,
    voixCoupee: false,
    maintenant: MAINTENANT,
    canalPeuSuivi: false,
  }
  const notif = { title: "3 chantiers livrés", body: "A, B et un autre" }
  verifier(
    "canal PAS peu suivi : l'annonce reste normale",
    raisonDuSilence(notif, ctx) === null && phraseAnnonce(notif, ctx) !== null,
  )
}
{
  // Même avec canalPeuSuivi à vrai (ce qui ne devrait de toute façon jamais
  // arriver pour ce canal, insistanceReduite() l'en empêchant en amont), les
  // heures de silence et la voix coupée restent prioritaires : la raison la
  // plus grave gagne, pas la dernière testée.
  const ctxVoixCoupee = {
    prefs: PREFS_NOTIFS_DEFAUT,
    voixCoupee: true,
    maintenant: MAINTENANT,
    canalPeuSuivi: true,
  }
  verifier(
    "la voix coupée reste prioritaire sur « peu suivi »",
    raisonDuSilence({ title: "x" }, ctxVoixCoupee) === "voix_coupee",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
