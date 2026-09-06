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
    "et elle classe la panne en « serveur », source « memoire »",
    code.includes('p_categorie: "serveur"') && code.includes('p_source: "memoire"'),
    "sante_memoire() lit la source « memoire » : une autre valeur rendrait le témoin aveugle",
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
  // actions doit tracer. Il y en a deux aujourd'hui (le micro classique et
  // l'outil du mode Live) ; un troisième ajouté sans trace reperdrait des
  // phrases sans que rien ne le signale.
  const appels = [...mic.matchAll(/(?<!function )executerActions\(/g)].length
  const traces = [...mic.matchAll(/(?<!function )tracerSiLocale\(/g)].length
  verifier(
    "tout chemin qui exécute une commande garde sa trace",
    appels > 0 && appels === traces,
    `${appels} exécution(s) de commande pour ${traces} trace(s) — un chemin oublié perd des phrases`,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
