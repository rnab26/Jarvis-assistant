/**
 * Ce que la mémoire longue durée retient d'un échange, essayé contre le VRAI
 * modèle de la mémoire (clé de test), sans base ni déploiement :
 *
 *   scripts/essayer-consigne.sh memoire-extraction
 *
 * Les échanges sont SES vraies phrases, relues dans `echanges`. Chaque cas qui
 * compte est rejoué SANS « ce que tu sais déjà » (le témoin) : c'est ce qui
 * prouve que relire la mémoire avant d'écrire change quelque chose.
 */
import { CONSIGNE_EXTRACTION, OUTIL_EXTRACTION, messageExtraction } from "./voice-command/extraction.ts"
import { appelerModele } from "./_shared/modele.ts"

type Fait = { contenu: string; categorie: string }

async function extraire(transcript: string, reponse: string | null, connus: string[]): Promise<Fait[] | string> {
  const { args, echec } = await appelerModele({
    role: "memoire",
    systeme: CONSIGNE_EXTRACTION,
    texte: messageExtraction(transcript, reponse, connus),
    outil: OUTIL_EXTRACTION,
    maxTokens: 512,
    essai: true,
  })
  if (echec || !args) return `échec ${echec?.statut ?? "sans appel d'outil"}`
  return (args.faits as Fait[] | undefined) ?? []
}

type Cas = { nom: string; transcript: string; reponse?: string; connus: string[]; ok: (f: Fait[]) => boolean; temoin?: boolean }

const CAS: Cas[] = [
  {
    nom: "« salut Yael » dans un message à sa femme ne change pas le prénom de sa femme (7 sept.)",
    transcript:
      "envoyer un message WhatsApp à ma femme. écrit salut Yael, j'espère que tu vas bien. Je pense que tu n'as pas eu le temps de regarder. Est-ce que tu peux regarder ça aujourd'hui en fin de journée ?",
    connus: ["La femme de Raphaël s'appelle Mel.", "Mel fait partie de l'entourage de Raphaël."],
    ok: (f) => !f.some((x) => /yael/i.test(x.contenu) && /(femme|épouse|epouse)/i.test(x.contenu)),
    temoin: true,
  },
  {
    nom: "« Haim Demazgan » dicté : la personne connue garde SON orthographe (22 sept.)",
    transcript:
      "modifie un rappel comme quoi je devais rappeler Haim Demazgan (climatisation) que je dois le rendre fou et le rappeler dès mercredi à partir de 18h",
    connus: ["Haim Mazgan s'occupe de climatisation.", "Haim Mazgan fait partie de l'entourage de Raphaël."],
    ok: (f) => !f.some((x) => /demazgan|desgan/i.test(x.contenu)),
    temoin: true,
  },
  {
    nom: "un fait déjà connu ne se réécrit pas",
    transcript: "utilise Waze pour la navigation",
    connus: ["Raphaël préfère utiliser Waze pour la navigation."],
    ok: (f) => !f.some((x) => /waze/i.test(x.contenu)),
  },
  // ── Ce qu'il ne faut PAS empêcher ──
  {
    nom: "une correction EXPLICITE est retenue, même si elle contredit",
    transcript: "retiens que ma femme s'appelle Mélissa, Mel c'est son surnom",
    connus: ["La femme de Raphaël s'appelle Mel."],
    ok: (f) => f.some((x) => /m[ée]lissa/i.test(x.contenu)),
  },
  {
    nom: "une personne nouvelle est toujours retenue",
    transcript: "Yossi Keramika c'est mon fournisseur de carrelage pour la villa Dan",
    connus: ["La villa Dan nécessite de recommander du grès cérame."],
    ok: (f) => f.some((x) => /yossi/i.test(x.contenu)),
  },
]

const seulement = Deno.args[0]
let echecs = 0
for (const c of CAS) {
  if (seulement && !c.nom.includes(seulement)) continue
  const avec = await extraire(c.transcript, c.reponse ?? null, c.connus)
  const ok = Array.isArray(avec) && c.ok(avec)
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${c.nom}\n      avec ce qu'elle sait : ${JSON.stringify(avec).slice(0, 300)}`)
  await new Promise((r) => setTimeout(r, 4000))
  if (c.temoin) {
    const sans = await extraire(c.transcript, c.reponse ?? null, [])
    console.log(`      témoin SANS : ${JSON.stringify(sans).slice(0, 300)}`)
    await new Promise((r) => setTimeout(r, 4000))
  }
}
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
Deno.exit(echecs === 0 ? 0 : 1)
