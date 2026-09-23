/**
 * Le destinataire d'un message programmé : vérifié en le dictant, jamais
 * inventé (chantier a122a936).
 *
 *   node --experimental-strip-types scripts/verifier-destinataire-programme.ts
 *
 * Aucun réseau. Le cas réel : le 22 sept. 2026 à 10h44, « Programme un
 * message à envoyer à Harry locataire bureau sur WhatsApp pour 18h… » a été
 * enregistré avec pour destinataire « ce contact », et Jarvis a répondu
 * « C'est noté ».
 */
import type { ContactTelephone } from "../src/lib/actionsTelephone.ts"
import {
  destinataireManquant,
  etatDestinataire,
  estUnNumero,
  nomDit,
  phraseProgrammation,
  verifierDestinataire,
} from "../src/lib/destinataireProgramme.ts"
import { messageManque, phraseAnnonceMessage } from "../src/lib/messageAnnonce.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const c = (nom: string, numero: string): ContactTelephone => ({ nom, numero, etiquette: "Mobile" })
const REPERTOIRE = { etat: "ok" as const, contacts: [c("Harry Locataire Bureau", "0542222222"), c("Harry Cohen", "0521111111")] }
const quand = "mardi 22 septembre à 18:00"

// ── Le nom : ce qu'il a dit, jamais un bouche-trou ──
verifier("rien de dit → aucun nom (plus de « ce contact » inventé)", nomDit({}) === null)
verifier(
  "un contact_id qui n'est pas un identifiant est un NOM mal rangé par le modèle",
  nomDit({ contact_id: "Harry locataire bureau" }) === "Harry locataire bureau",
)
verifier(
  "un vrai identifiant inconnu n'est pas pris pour un nom",
  nomDit({ contact_id: "3f2b1c9e-1111-4222-8333-444455556666" }) === null,
)
verifier("contact_name d'abord", nomDit({ contact_name: "Dylan", phone_number: "0501234567" }) === "Dylan")
verifier("« ce contact » (l'ancien bouche-trou) est un destinataire manquant", destinataireManquant("Ce contact"))
verifier("un vrai nom n'est pas manquant", !destinataireManquant("Harry"))

// ── Le répertoire tranche MAINTENANT ──
{
  const v = verifierDestinataire("Harry locataire bureau", REPERTOIRE)
  verifier(
    "trouvé : nom exact et numéro gardés",
    v.etat === "verifie" && v.contact_nom === "Harry Locataire Bureau" && v.telephone === "0542222222",
    JSON.stringify(v),
  )
  const p = phraseProgrammation("Harry locataire bureau", v, quand)
  verifier("…et Jarvis le NOMME dans sa réponse", p.includes("pour Harry Locataire Bureau mardi 22 septembre"), p)
}
{
  const v = verifierDestinataire("Harry", REPERTOIRE)
  verifier("deux Harry : ambigu, jamais un tirage", v.etat === "ambigu" && v.candidats.length === 2, JSON.stringify(v))
  const p = phraseProgrammation("Harry", v, quand)
  verifier(
    "…et il le DIT, avec les deux noms et où choisir",
    p.includes("Harry Locataire Bureau") && p.includes("Harry Cohen") && p.includes("onglet Programmé"),
    p,
  )
}
{
  const v = verifierDestinataire("Bertrand", REPERTOIRE)
  const p = phraseProgrammation("Bertrand", v, quand)
  verifier(
    "introuvable : dit, avec la conséquence",
    v.etat === "introuvable" && p.includes("je ne trouve pas « Bertrand »") && p.includes("ne pourra pas partir"),
    p,
  )
}
{
  const v = verifierDestinataire("Harry", { etat: "refuse" })
  verifier(
    "contacts refusés : on n'a pas regardé, et on dit où l'autoriser",
    v.etat === "sans_acces" && phraseProgrammation("Harry", v, quand).includes("Autorisations du téléphone"),
  )
}
{
  const v = verifierDestinataire(null, REPERTOIRE)
  const p = phraseProgrammation(null, v, quand)
  verifier(
    "aucun destinataire : jamais « C'est noté » tout court",
    v.etat === "manquant" && p.includes("je n'ai pas compris à qui l'envoyer"),
    p,
  )
}
verifier("un numéro dicté se garde tel quel", verifierDestinataire("054 222 2222", REPERTOIRE).etat === "verifie")
verifier("un numéro trop court n'en est pas un", !estUnNumero("123"))

// ── Ce que l'écran affiche ──
verifier(
  "vérifié : nom exact et numéro",
  JSON.stringify(etatDestinataire({ destinataire: "Harry", contact_nom: "Harry Cohen", telephone: "052" })) ===
    JSON.stringify({ etat: "verifie", libelle: "Harry Cohen", numero: "052" }),
)
verifier("non vérifié : à vérifier", etatDestinataire({ destinataire: "Harry" }).etat === "a_verifier")
verifier("« ce contact » en base : manquant", etatDestinataire({ destinataire: "ce contact" }).etat === "manquant")

// ── À l'heure dite ──
{
  const base = { id: "x", texte: "Salut Harry", envoyer_a: "2026-09-22T15:00:00Z", statut: "prevu" as const }
  const sans = phraseAnnonceMessage({ ...base, destinataire: "ce contact" })
  verifier(
    "à l'heure dite, sans destinataire : il le dit, il ne prépare pas un brouillon « à ce contact »",
    sans.includes("je ne sais pas à qui") && !sans.includes("à ce contact"),
    sans,
  )
  const avec = phraseAnnonceMessage({ ...base, destinataire: "Harry", contact_nom: "Harry Locataire Bureau", telephone: "054" })
  verifier("vérifié : l'annonce nomme le contact EXACT", avec.includes("à Harry Locataire Bureau"), avec)
  verifier(
    "le message de 18 h, relu le lendemain : « pas parti »",
    messageManque(base, new Date("2026-09-23T09:00:00Z")),
  )
  verifier(
    "une heure passée de peu (dans la marge d'annonce) n'est pas encore « manquée »",
    !messageManque(base, new Date("2026-09-22T16:00:00Z")),
  )
  verifier("un message parti n'est jamais « manqué »", !messageManque({ ...base, statut: "envoye" }, new Date("2026-09-30")))
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
