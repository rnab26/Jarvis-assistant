/**
 * Vérifie que Jarvis ne peut pas annoncer au passé ce qu'il n'a pas fait.
 *
 *   node --experimental-strip-types scripts/verifier-honnetete.ts
 *
 * SES MOTS, 6 sept. 2026 : « il me dit qu'il a envoyé un message alors que ce
 * n'est pas vrai. […] sur WhatsApp, ça prépare le message mais il n'y a rien
 * qui est envoyé. »
 *
 * CE QUE LE JOURNAL A MONTRÉ, et qui déplace le diagnostic : à 05:53:04
 * l'outil a rendu « Message prêt pour Mel Ma Femme ❤ sur WhatsApp, tu n'as
 * plus qu'à envoyer. » — NOTRE PHRASE ÉTAIT HONNÊTE. C'est le modèle qui l'a
 * remise au passé en la disant. Corriger le texte de l'application n'aurait
 * rien changé ; la règle doit vivre dans la CONSIGNE.
 *
 * Et elle doit y vivre POUR LES DEUX CHEMINS. Il était en mode Live ce
 * matin-là ; une règle écrite seulement dans voice-command serait vraie au
 * micro et fausse en Live — c'est exactement le genre d'écart qui a déjà
 * coûté cher sur les souvenirs et sur les corrections.
 */
import { readFileSync } from "node:fs"
import { CONSIGNE_HONNETETE } from "../supabase/functions/_shared/honnetete.ts"
import { consigneBranchements } from "../supabase/functions/_shared/branchements.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── La règle dit bien les quatre choses qui comptent ──
verifier(
  "elle interdit le passé sur ce qui n'a pas été constaté",
  /pass[ée]/i.test(CONSIGNE_HONNETETE) && /constat/i.test(CONSIGNE_HONNETETE),
)
verifier(
  "elle dit que préparer n'est pas envoyer",
  /PRÉPARER N'EST PAS ENVOYER/.test(CONSIGNE_HONNETETE),
  "c'est le cas exact qu'il a vécu : le message était prêt, rien n'était parti",
)
verifier(
  "elle dit de reprendre le retour de l'outil sans le reformuler",
  /REPRENDS-LA telle quelle/.test(CONSIGNE_HONNETETE),
  "notre phrase était juste ; c'est la reformulation qui a menti",
)
verifier(
  "elle dit quoi faire quand l'outil ne rend RIEN",
  /ne rend RIEN/.test(CONSIGNE_HONNETETE) && /invente jamais/i.test(CONSIGNE_HONNETETE),
  "à 05:50:56 et 05:53:14 l'outil a rendu une chaîne vide, et le modèle a comblé",
)
verifier(
  "elle nomme les trois issues, et interdit de les confondre",
  /PRÉPARÉ/.test(CONSIGNE_HONNETETE) &&
    /FAIT/.test(CONSIGNE_HONNETETE) &&
    /ÉCHOUÉ/.test(CONSIGNE_HONNETETE),
)
verifier(
  "elle reste courte : chaque phrase envoie déjà ~45 000 caractères",
  CONSIGNE_HONNETETE.length < 1200,
  `${CONSIGNE_HONNETETE.length} caractères`,
)

// ── Et elle arrive VRAIMENT dans les deux consignes ──
for (const fonction of ["voice-command", "live-jeton"]) {
  const code = readFileSync(`supabase/functions/${fonction}/index.ts`, "utf8")
  verifier(
    `${fonction} importe la règle depuis la source partagée`,
    code.includes('from "../_shared/honnetete.ts"'),
    "une copie divergerait au premier ajustement",
  )
  verifier(
    `${fonction} l'insère dans sa consigne`,
    code.includes("${CONSIGNE_HONNETETE}"),
    "importée sans être interpolée, elle ne dit rien au modèle",
  )
}

// ── Les phrases de l'application, elles, ne mentent pas non plus ──
//
// Elles étaient déjà honnêtes le 6 sept. — ce contrôle est là pour qu'elles
// le restent : c'est la moitié de la chaîne que nous maîtrisons vraiment.
const vocales = readFileSync("src/lib/actionsTelephoneVocales.ts", "utf8")
for (const menteur of [
  "message envoyé",
  "j'ai envoyé",
  "message parti",
  "c'est envoyé",
  "j'ai appelé",
]) {
  verifier(
    `l'application ne dit jamais « ${menteur} »`,
    !new RegExp(menteur, "i").test(vocales),
    "préparer n'est pas envoyer, composer n'est pas appeler",
  )
}
verifier(
  "elle dit « prêt » et « tu n'as plus qu'à envoyer »",
  /tu n'as plus qu'à envoyer/.test(vocales),
  "c'est cette phrase-là que le modèle doit reprendre telle quelle",
)

// ── WhatsApp Business : on ne devine plus quelle application ────────────
//
// Ses mots du 6 sept. : « le message part vers WhatsApp Business au lieu de
// WhatsApp ». La cause n'était PAS l'absence de setPackage — il était bien là,
// mais sur l'AUTRE branche. Le chemin utilisé quand on connaît le numéro ouvre
// un lien wa.me, une adresse https ordinaire que les deux WhatsApp déclarent :
// Android choisissait. C'est ce qui rendait le symptôme incompréhensible.
const plugin = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/ActionsTelephonePlugin.java",
  "utf8",
)
const whatsapp = plugin.slice(
  plugin.indexOf("public void preparerWhatsApp"),
  plugin.indexOf("private static final String WHATSAPP ="),
)
verifier(
  "le lien wa.me vise une application précise",
  /conversation\.setPackage\(paquet\)/.test(whatsapp),
  "sans ça, Android choisit — et il a choisi Business",
)
verifier(
  "le partage aussi",
  /partage\.setPackage\(paquet\)/.test(whatsapp),
)
verifier(
  "les deux branches visent le MÊME paquet",
  (whatsapp.match(/setPackage\(paquet\)/g) ?? []).length === 2,
  "une branche qui vise et l'autre qui devine, c'est le bug d'origine",
)
verifier(
  "WhatsApp Business est visible du manifeste",
  readFileSync("android/app/src/main/AndroidManifest.xml", "utf8").includes("com.whatsapp.w4b"),
  "sans cette déclaration on ne peut pas savoir qu'elle est installée, donc pas la proposer",
)
verifier(
  "quand les deux sont là et que rien n'est choisi, on DEMANDE",
  /a_choisir/.test(vocales) && /je ne sais pas lequel tu utilises/.test(vocales),
  "prendre la première, c'est un message écrit dans une application qu'il n'ouvre jamais",
)

// ── « À quoi tu es branché ? » ───────────────────────────────────────────
//
// Sa remarque du 6 sept. : « Jarvis ne connaît toujours pas son propre
// environnement sur certains points. Par exemple quand je lui demande à quoi
// il est branché. » environnement.ts décrit l'APPLICATION, figée ; il fallait
// l'ÉTAT de son installation, lu en base.
const branche = consigneBranchements({
  googleEmail: "r.nabet26@gmail.com",
  googleScopes: "gmail.modify calendar.events",
  reglages: { jarvis_app_musique: "Apple Music", jarvis_canal_messages: "whatsapp" },
})
const rien = consigneBranchements({ googleEmail: null, googleScopes: "", reglages: {} })

verifier(
  "il sait dire à quel compte Google il est branché",
  branche.includes("r.nabet26@gmail.com") && /agenda et ses mails/.test(branche),
)
verifier(
  "et quand il n'y en a pas, il le dit au lieu de laisser croire",
  /Aucun compte Google branché/.test(rien) && /NI à son agenda NI à ses mails/.test(rien),
)
verifier(
  "il sait dire quelles applications sont choisies",
  /Apple Music/.test(branche) && /WhatsApp/.test(branche),
)
verifier(
  "CE QU'IL NE SAIT PAS, il le dit — dans les deux cas",
  [branche, rien].every(
    (b) => /autorisations Android/.test(b) && /accessibilité/.test(b) && /pas les voir/.test(b),
  ),
  "inventer une réponse ici serait exactement le défaut qu'on vient de corriger",
)
verifier(
  "le bloc reste court : ~45 000 caractères partent déjà à chaque phrase",
  branche.length < 1400,
  `${branche.length} caractères`,
)
for (const fonction of ["voice-command", "live-jeton"]) {
  verifier(
    `${fonction} joint l'état réel au contexte`,
    readFileSync(`supabase/functions/${fonction}/index.ts`, "utf8").includes(
      "rappelerBranchements(supabase)",
    ),
    "en Live le contexte est scellé à l'ouverture : ce qui n'y est pas ne se rattrape plus",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
