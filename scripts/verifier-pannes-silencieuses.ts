/**
 * Refuse qu'une panne de la mémoire se lise comme une absence.
 *
 *   node --experimental-strip-types scripts/verifier-pannes-silencieuses.ts
 *
 * Aucun réseau : ce contrôle LIT LE CODE, comme `verifier-reglages.ts` lit les
 * clés de stockage local. C'est le seul moyen de tenir une règle qui porte sur
 * la FORME du code plutôt que sur une valeur calculée.
 *
 * LA RÈGLE, et pourquoi elle vaut un contrôle à elle seule. La mémoire est
 * silencieuse par construction (choix de Raphaël) et elle avale ses erreurs.
 * Dans les fonctions de RAPPEL, une recherche en échec rendait exactement le
 * même résultat qu'une recherche qui n'a rien trouvé : la chaîne vide. Jarvis
 * devenait amnésique et tout avait l'air normal — y compris le témoin de santé
 * de l'onglet Mémoire, qui mesure les ÉCRITURES et ne voit pas une lecture
 * cassée. La session cockpit a nommé cette famille le 5 sept. 2026 : « une
 * PANNE qui se lit comme une ABSENCE ».
 *
 * Écrire `catch { return "" }` dans un de ces fichiers est donc une régression,
 * même si le code compile et que tous les autres contrôles passent. Il faut
 * `catch (err) { await signalerPanne(...) ; return "" }`.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/**
 * Les fonctions qui CONSTRUISENT le contexte envoyé au modèle. Ce sont les
 * seules où un échec avalé rend Jarvis amnésique — ailleurs dans ces fichiers,
 * un `catch {}` est légitime et voulu (une empreinte manquante dégrade la
 * recherche sans rien casser, un corps de requête absent est permis, le
 * rattrapage des empreintes est un confort). Interdire `catch {}` partout
 * ferait ajouter des liaisons d'erreur inutiles au lieu de protéger ce qui
 * compte.
 */
const RAPPELS: { fichier: string; fonction: string; fin: string }[] = [
  {
    fichier: "supabase/functions/voice-command/memoire.ts",
    fonction: "export async function rappelerSouvenirs",
    fin: "const OUTIL_EXTRACTION",
  },
  {
    fichier: "supabase/functions/_shared/corrections.ts",
    fonction: "export async function rappelerCorrections",
    fin: "",
  },
  {
    fichier: "supabase/functions/_shared/ceQuiMarche.ts",
    fonction: "export async function rappelerCeQuiMarche",
    fin: "",
  },
  {
    fichier: "supabase/functions/live-jeton/index.ts",
    fonction: "async function souvenirsDeLUtilisateur",
    fin: "Deno.serve",
  },
]

function lire(fichier: string): string {
  return readFileSync(new URL(`../${fichier}`, import.meta.url), "utf8")
}

for (const { fichier, fonction, fin } of RAPPELS) {
  const code = lire(fichier)
  const debut = code.indexOf(fonction)
  const corps = debut < 0 ? "" : code.slice(debut, fin ? code.indexOf(fin, debut) : undefined)

  verifier(
    `${fonction} existe toujours dans ${fichier.split("/").pop()}`,
    corps.length > 200,
    "le contrôle ne lit plus la bonne portion : la fonction a été renommée ou déplacée",
  )
  verifier(
    `${fonction} regarde son erreur au lieu de la jeter`,
    /catch \(/.test(corps),
    '« catch { return "" } » ici rend Jarvis amnésique sans un mot',
  )
  verifier(
    `${fonction} signale sa panne`,
    corps.includes("signalerPanne("),
    "sans signalement, la panne n'apparaît ni dans le registre des erreurs ni dans le témoin de l'onglet Mémoire",
  )
}

// Le rappel lui-même : chaque branche d'erreur doit mener à un signalement.
{
  const code = lire("supabase/functions/voice-command/memoire.ts")
  const rappel = code.slice(
    code.indexOf("export async function rappelerSouvenirs"),
    code.indexOf("const OUTIL_EXTRACTION"),
  )
  verifier(
    "rappelerSouvenirs a bien été trouvé dans le fichier",
    rappel.length > 200,
    "le contrôle ne lit plus la bonne portion : la fonction a été renommée ou déplacée",
  )

  // Autant de branches d'erreur que de signalements : empreinte absente,
  // recherche des souvenirs, recherche des échanges, et le catch final.
  const branches = [...rappel.matchAll(/if \((?:!vecteur|faits\.error|echanges\.error)\)/g)].length
  verifier(
    "les trois façons dont le rappel peut échouer sont toutes traitées",
    branches === 3,
    `${branches} branche(s) sur 3 — empreinte absente, souvenirs en échec, échanges en échec`,
  )
  const signalements = [...rappel.matchAll(/signalerPanne\(/g)].length
  verifier(
    "chacune signale, et le catch final aussi",
    signalements >= 4,
    `${signalements} signalement(s) pour 4 chemins d'échec`,
  )
  verifier(
    "le catch du rappel regarde l'erreur au lieu de la jeter",
    /catch \(err\)/.test(rappel),
    "« catch { return \"\" } » rendrait Jarvis amnésique sans un mot",
  )
}

// Et la règle inverse, celle qu'on ne doit PAS casser en corrigeant la
// première : le signalement ne doit jamais faire échouer ce qu'il observe.
{
  const code = lire("supabase/functions/_shared/pannes.ts")
  verifier(
    "signalerPanne avale sa propre erreur, elle",
    /catch \{/.test(code),
    "un registre d'erreurs qui fait échouer l'action qu'il observe serait la pire des ironies",
  )
  verifier(
    "et elle classe la panne en « serveur », source « memoire » PAR DÉFAUT",
    code.includes('p_categorie: "serveur"') && /source: string = "memoire"/.test(code),
    "sante_memoire() lit la source « memoire » : une autre valeur rendrait le témoin aveugle. La source est devenue un paramètre le 7 sept. 2026 (le push signale « push », sans quoi Raphaël chercherait une panne de mémoire pour une notification) — mais son DÉFAUT doit rester « memoire », sinon les appelants de la mémoire, qui ne le passent pas, disparaîtraient du témoin.",
  )
}

// Une commande traitée SUR L'APPAREIL doit laisser sa trace (chantier 5c3182c5).
//
// Même famille exactement : `interpreterLocalement` répond sans appeler
// voice-command, donc personne n'écrit la ligne dans `echanges` et la phrase
// disparaît de l'historique — deux chantiers dictés le 5 sept. ont été perdus
// comme ça. Le correctif tient à trois fils, et casser n'importe lequel se
// verrait seulement des jours plus tard, en cherchant une phrase absente.
{
  const code = lire("src/lib/echangeLocal.ts")
  verifier(
    "echangeLocal prouve son écriture par un .select()",
    code.includes('.select("id")'),
    "sans lui, une insertion refusée par RLS rend un succès et la phrase est perdue en silence",
  )
  verifier(
    "echangeLocal signale une écriture qui n'a touché aucune ligne",
    /!data\?\.length/.test(code) && code.includes("signalerErreur("),
    "zéro ligne écrite sans erreur, c'est exactement la panne qui se lit comme une absence",
  )
  verifier(
    "echangeLocal avale sa propre erreur, elle",
    /catch \(err\)/.test(code) && code.includes("void (async ()"),
    "une trace qui fait échouer la commande qu'elle observe serait pire que pas de trace",
  )
  verifier(
    "echangeLocal charge le client Supabase paresseusement",
    code.includes('await import("@/lib/supabase")'),
    "le banc d'essai du micro monte MicButton sans configuration Supabase",
  )

  const mic = lire("src/components/voice/MicButton.tsx")
  verifier(
    "la branche locale de resolveTranscript se retient d'être tracée",
    mic.includes("derniereLocaleRef.current = transcript"),
    "sans ce marquage, aucune commande locale n'est jamais écrite",
  )
  verifier(
    "et la branche serveur remet le marqueur à zéro",
    mic.includes("derniereLocaleRef.current = null"),
    "sinon une phrase résolue par le serveur serait écrite deux fois : ici et dans memoire.ts",
  )

  // LE contrôle qui compte pour la suite : chaque chemin qui exécute des
  // actions doit tracer. Il y en avait deux (le micro classique et l'outil du
  // mode Live), plus un troisième depuis le chantier ed32cbcc (7 sept.) : la
  // relecture vocale avant l'envoi WhatsApp, qui prépare puis clique sur
  // Envoyer directement (executerActionTelephone + agirSurEcran) sans passer
  // par executerActions — elle a donc son propre appel à tracerSiLocale, et
  // c'est CE couple-là qu'on compte en plus. Un quatrième chemin ajouté sans
  // trace reperdrait des phrases sans que rien ne le signale.
  const appels =
    [...mic.matchAll(/(?<!function )executerActions\(/g)].length +
    [...mic.matchAll(/agirSurEcran\(/g)].length
  const traces = [...mic.matchAll(/(?<!function )tracerSiLocale\(/g)].length
  verifier(
    "tout chemin qui exécute une commande garde sa trace",
    appels > 0 && appels === traces,
    `${appels} exécution(s) de commande pour ${traces} trace(s) — un chemin oublié perd des phrases`,
  )
}

// UNE MESURE QUI NE DIT PAS QUEL CODE TOURNAIT N'EST PAS UNE MESURE.
// Les 17 et 18 sept. 2026, deux sessions ont compté des milliers de rafales
// de micro pour juger un correctif NATIF sans pouvoir établir si le téléphone
// le portait déjà : rien dans journal_ecoute ne disait quelle coquille
// Android tournait. La mise à jour rapide rend le piège muet — l'interface
// est à jour au-dessus d'une APK qui ne l'est pas, ce qui donne toutes les
// raisons de croire l'inverse. L'identité part donc avec l'ouverture du
// micro, et ces contrôles visent l'APPEL, pas la présence du mot.
{
  const code = lire("src/hooks/useSpeechRecognition.ts")
  const sansCommentaires = code.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
  const appel = sansCommentaires.match(
    /noterEcoute\(\s*"service_reconnaissance"\s*,\s*\{[\s\S]*?\}\s*\)/,
  )?.[0]
  verifier(
    "l'ouverture du micro dit sur quelle APK elle a été mesurée",
    !!appel && appel.includes("apk_build") && appel.includes("apk_empreinte"),
    "sans ça, une session qui mesure le micro ne peut pas dire quel code natif tournait",
  )
  // LA MOITIÉ QUI COMPTE. BUILD_NUMBER et NATIVE_EMPREINTE décrivent le
  // PAQUET WEB dès qu'un paquet est appliqué, plus la coquille installée
  // (majWeb.ts le dit en toutes lettres). Les prendre pour l'identité de
  // l'APK serait plus faux que ne rien relever : on affirmerait une version
  // native qu'on n'a pas lue, et c'est précisément la question qu'on veut
  // pouvoir trancher.
  verifier(
    "et il la lit sur l'APK, jamais sur le paquet web",
    sansCommentaires.includes("lireEtatMajWeb()") &&
      !/apk_build:\s*(BUILD_NUMBER|Number\(BUILD_NUMBER)/.test(sansCommentaires) &&
      !/apk_empreinte:\s*NATIVE_EMPREINTE/.test(sansCommentaires),
    "BUILD_NUMBER décrit le paquet une fois une mise à jour rapide appliquée, pas la coquille",
  )
  // ET ELLE NE RALENTIT PAS CE QU'ELLE OBSERVE. `preparerNatif` est DANS la
  // fenêtre que `ms_ouverture` mesure : `appuiAt` est pris à l'appui sur le
  // cœur, pas après (correctif du 16 sept. 2026). Un `await` de 400 ms ici
  // retarderait la première ouverture du micro de chaque démarrage d'app —
  // la plainte même qu'on cherche à mesurer — et fausserait le nombre au
  // passage. La lecture part donc détachée, comme la trace d'echangeLocal.
  verifier(
    "et elle ne retarde pas l'ouverture du micro qu'elle mesure",
    /void \(async \(\) => \{\s*const apk = \(await borner\(lireEtatMajWeb\(\)/.test(sansCommentaires),
    "attendue, elle ajoute jusqu'à 400 ms à ms_ouverture et fausse la mesure qu'elle sert",
  )

  // ET LE TOUR DE COMMANDE NE LUI ATTRIBUE PLUS NOTRE PANNE. La phrase elle-
  // même est gardée par verifier-raison-ecoute.ts ; ici on garde l'APPEL,
  // parce qu'un module pur peut rester juste pendant que le hook continue de
  // jeter l'ancienne phrase — et ça, personne ne le verrait : à l'écran, « Je
  // n'ai rien entendu » après une vraie panne du service ressemble à un
  // silence ordinaire.
  const commande = sansCommentaires.slice(sansCommentaires.indexOf('mode: "commande"'))
  verifier(
    "le tour de commande dit la vraie cause quand il ne rend rien",
    /if \(!transcript\) throw new Error\(phraseTourSansTexte\(raison\)\)/.test(commande),
    "sans ça, une panne du service se présente comme son silence — 7 de ses 14 tours mesurés",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
