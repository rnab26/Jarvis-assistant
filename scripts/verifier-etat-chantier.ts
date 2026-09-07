/**
 * L'état d'un chantier, tel que Raphaël le lit sur la ligne du cockpit.
 *
 *   node --experimental-strip-types scripts/verifier-etat-chantier.ts
 *
 * SA DEMANDE, 7 sept. 2026 : « je n'ai aucune réelle confirmation que les
 * chantiers [...] sont envoyés à une session afin qu'ils soient traités. »
 *
 * CE QUI COMPTE LE PLUS ICI EST CE QU'ON N'AFFICHE PAS. « Prise par … » et
 * « Archivé le … » existaient déjà ; le trou était la réservation EXPIRÉE, que
 * la ligne taisait — le chantier avait l'air libre alors qu'aucune session ne
 * le prendra tant qu'elle n'est pas rendue. Et on se retient d'afficher ce qui
 * est déjà dit ailleurs : sa plainte du 5 sept. était « je ne sais plus où
 * mettre le nez », on n'y répond pas en répétant la même chose trois fois.
 */
import { etatChantier, pastilleDe } from "../src/lib/etatChantier.ts"
import type { DevItem } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = new Date("2026-09-07T15:00:00Z").getTime()
const dans = (min: number) => new Date(MAINTENANT + min * 60000).toISOString()

let n = 0
function item(p: Partial<DevItem> = {}): DevItem {
  n++
  return {
    id: `i${n}`, user_id: "u", title: `Chantier ${n}`, notes: "[LIBRE] Spécifié.",
    status: "todo", priority: "normal", theme: "Le cockpit",
    archived_at: null, claimed_by: null, claimed_at: null, claim_expires_at: null,
    created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z",
    ...p,
  } as DevItem
}

console.log("— Ce qui bouge, et ce qui est resté en plan —")

verifier(
  "une réservation vivante dit qui est dessus",
  etatChantier(item({ claimed_by: "claude/cockpit-0709", claim_expires_at: dans(60) }), MAINTENANT).etat === "pris",
)
verifier(
  "   et le nom perd le préfixe « claude/ »",
  etatChantier(item({ claimed_by: "claude/cockpit-0709", claim_expires_at: dans(60) }), MAINTENANT).session === "cockpit-0709",
  "c'est ce qu'il lit dans « Prise par … »",
)

{
  // LE CAS QUI A MOTIVÉ CE TRAVAIL : avant le 7 sept., la ligne n'affichait
  // RIEN pour une réservation expirée. Le chantier avait l'air disponible.
  const mort = item({ claimed_by: "claude/session-morte", claim_expires_at: dans(-30) })
  verifier(
    "une réservation EXPIRÉE ne passe pas pour disponible",
    etatChantier(mort, MAINTENANT).etat === "abandonne",
    "c'est le trou d'origine : aucune session ne le prendra, et rien ne le disait",
  )
  verifier(
    "   et elle se voit sur la ligne, en alerte",
    pastilleDe(etatChantier(mort, MAINTENANT))?.ton === "alerte",
  )
}

verifier(
  "un chantier libre dort, sans étiquette",
  etatChantier(item(), MAINTENANT).etat === "dort" && pastilleDe(etatChantier(item(), MAINTENANT)) === null,
  "une pastille « dort » sur chaque ligne libre serait du bruit sur la majorité du tableau",
)

console.log("\n— Ce qu'on n'affiche PAS, et c'est voulu —")

verifier(
  "un chantier qui l'attend n'ajoute pas de pastille",
  pastilleDe(etatChantier(item({ notes: "[À CADRER AVEC RAPHAËL] …" }), MAINTENANT)) === null,
  "« Ce qui attend ta décision » le porte déjà en tête du cockpit, et la colonne « pour toi » le compte",
)
verifier(
  "un chantier bloqué non plus",
  pastilleDe(etatChantier(item({ notes: "[BLOQUÉ PAR : autre chose] …" }), MAINTENANT)) === null,
  "le marqueur est déjà affiché en étiquette sur la ligne",
)
verifier(
  "un archivé est « livré », mais la ligne ne le répète pas",
  etatChantier(item({ archived_at: "2026-09-06T10:00:00Z" }), MAINTENANT).etat === "livre" &&
    pastilleDe(etatChantier(item({ archived_at: "2026-09-06T10:00:00Z" }), MAINTENANT))?.ton === "fini",
  "« Archivé le … » est déjà affiché juste au-dessus",
)

console.log("\n— Les bords —")

verifier(
  "une date de réservation illisible ne fait pas passer le chantier pour pris",
  etatChantier(item({ claimed_by: "claude/x", claim_expires_at: "n'importe quoi" }), MAINTENANT).etat === "dort",
  "« Prise par … » affiché sur une date invalide empêcherait toute session de le prendre",
)
verifier(
  "un claimed_by sans date d'expiration non plus",
  etatChantier(item({ claimed_by: "claude/x", claim_expires_at: null }), MAINTENANT).etat === "dort",
)
verifier(
  "l'archivage passe avant la réservation",
  etatChantier(
    item({ archived_at: "2026-09-06T10:00:00Z", claimed_by: "claude/x", claim_expires_at: dans(60) }),
    MAINTENANT,
  ).etat === "livre",
  "un chantier livré dont la réservation traîne se lirait comme « en cours »",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
