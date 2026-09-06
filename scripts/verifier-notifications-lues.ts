/**
 * Vérifie la lecture des notifications des autres applications — la partie
 * pure : formuler la phrase, et l'interrupteur maître.
 *
 *   node --experimental-strip-types scripts/verifier-notifications-lues.ts
 *
 * Chantier b1b6172d, 6 sept. 2026. Réponse de Raphaël, 5 sept. : « Oui, mais
 * il ne s'en sert que si je le demande. »
 */
import {
  lectureVoulue,
  phraseAucuneNotificationDe,
  phraseLectureCoupee,
  phraseNotifications,
  phraseServiceInactif,
  type NotificationLue,
} from "../src/lib/notificationsLues.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

function n(app: string, titre: string, texte: string): NotificationLue {
  return { paquet: `paquet.${app}`, application: app, titre, texte, quand: 0 }
}

// ── L'interrupteur maître : par défaut activé, seul "0" le coupe ──
verifier("sans valeur enregistrée, la lecture est activée par défaut", lectureVoulue(null))
verifier("une valeur inconnue ne coupe pas un garde-fou par accident", lectureVoulue("autre chose"))
verifier("« 0 » est la SEULE façon de couper", !lectureVoulue("0"))
verifier("« 1 » reste activé", lectureVoulue("1"))

// ── Silence quand il n'y a rien ──
verifier("aucune notification : la phrase le dit", phraseNotifications([]) === "Tu n'as aucune notification en ce moment.")

// ── Une seule notification : lue en entier ──
verifier(
  "une notification isolée est lue en entier, titre et texte",
  phraseNotifications([n("WhatsApp", "Mel Ma Femme", "On mange à 20h ?")]) ===
    "WhatsApp : Mel Ma Femme — On mange à 20h ?",
)
verifier(
  "sans texte, le titre seul suffit",
  phraseNotifications([n("Gmail", "Nouveau message de Yoni", "")]) === "Gmail : Nouveau message de Yoni",
)

// ── Plusieurs notifications : groupées par application ──
verifier(
  "deux notifications d'apps différentes sont chacune détaillée",
  phraseNotifications([n("WhatsApp", "Yoni", "Tu es dispo ?"), n("Gmail", "Facture", "Votre facture est prête")]) ===
    "Tu as 2 notifications. WhatsApp : Yoni — Tu es dispo ?. Gmail : Facture — Votre facture est prête.",
)
verifier(
  "plusieurs notifications de la MÊME application sont résumées, pas lues une par une",
  phraseNotifications([
    n("WhatsApp", "Yoni", "a"),
    n("WhatsApp", "Dylan", "b"),
    n("WhatsApp", "Sarah", "c"),
  ]) === "Tu as 3 notifications. 3 de WhatsApp.",
)

// ── Les phrases de repli ──
verifier(
  "aucune notification d'une app précise, ciblée",
  phraseAucuneNotificationDe("WhatsApp") === "Tu n'as aucune notification de WhatsApp en ce moment.",
)
verifier(
  "l'accès non activé se dit, avec où le régler",
  phraseServiceInactif().includes("Ce que Jarvis utilise") && phraseServiceInactif().includes("Lire tes notifications"),
)
verifier(
  "l'interrupteur coupé se dit, sans jamais faire semblant de lire",
  phraseLectureCoupee().includes("coupée"),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
