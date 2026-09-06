/**
 * La musique baisse pendant qu'il parle — et elle remonte, à tous les coups.
 *
 *   node --experimental-strip-types scripts/verifier-baisser-son.ts
 *
 * Aucun réseau, aucun téléphone : ce contrôle LIT LE CODE, comme
 * `verifier-pannes-silencieuses.ts`. C'est le seul moyen de tenir une règle
 * qui porte sur la FORME du code — et ici c'est le seul moyen tout court,
 * puisque cet environnement n'a pas de SDK Android et que le comportement
 * réel ne s'observe que sur son téléphone.
 *
 * TROIS RÈGLES, ET IL FAUT LES TROIS.
 *
 * 1. ON BAISSE, ON NE COUPE PLUS. Le 5 sept., le plugin coupait STREAM_MUSIC
 *    à la main pendant l'écoute. Deux défauts : ça coupe au lieu de baisser,
 *    et si notre processus meurt en cours d'écoute la musique reste muette
 *    jusqu'au redémarrage — personne ne remonte le son à notre place.
 *    AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK est l'API prévue pour ça : Android
 *    baisse les autres applications, et les remonte tout seul si on disparaît.
 *
 * 2. ON REND LE FOCUS SUR TOUTES LES SORTIES. C'est la leçon du 5 sept., et
 *    elle a coûté 363 rafales : le son n'était rétabli que dans
 *    onBeginningOfSpeech, donc seulement quand quelqu'un avait parlé. Les
 *    quatre sorties — parole détectée, fin d'écoute, erreur, arrêt — doivent
 *    toutes appeler retablirSon().
 *
 * 3. PAS PENDANT LA VEILLE. La boucle du mot-clé relance une rafale toutes
 *    les 1 à 8 secondes. Baisser puis remonter la musique à ce rythme la
 *    ferait « pomper » en permanence — pire que le défaut qu'on corrige.
 *    Seule la vraie prise de parole (mode commande) demande à baisser.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const patch = readFileSync("patches/@capacitor-community+speech-recognition+7.0.1.patch", "utf8")
const hook = readFileSync("src/hooks/useSpeechRecognition.ts", "utf8")

/** Les lignes AJOUTÉES par le patch — les seules qui décrivent notre code. */
const ajoutees = patch
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .join("\n")

// --- 1. On baisse, on ne coupe plus ---------------------------------------
{
  verifier(
    "le patch demande le focus audio en mode « baisse » (DUCK)",
    ajoutees.includes("AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK"),
    "sans ce mode, on coupe la musique au lieu de la baisser",
  )
  verifier(
    "le patch ne coupe plus STREAM_MUSIC à la main",
    !ajoutees.includes("ADJUST_MUTE"),
    "ADJUST_MUTE laisse la musique muette si le processus meurt en cours d'écoute",
  )
  verifier(
    "le focus est rendu par abandonAudioFocus (les deux versions d'Android)",
    ajoutees.includes("abandonAudioFocusRequest") && ajoutees.includes("abandonAudioFocus("),
    "minSdk 24 : AudioFocusRequest n'existe qu'à partir d'Android 8, il faut les deux chemins",
  )
}

// --- 2. Le son remonte sur TOUTES les sorties ------------------------------
// La règle qui a coûté 363 rafales de musique muette le 5 sept.
{
  const appels = (ajoutees.match(/retablirSon\(\)/g) ?? []).length
  verifier(
    "retablirSon() est appelé depuis les quatre sorties (parole, fin, erreur, arrêt)",
    appels >= 4,
    `trouvé ${appels} appel(s) — il en faut un par sortie, sinon le son reste baissé`,
  )
  verifier(
    "retablirSon() est défini une seule fois",
    (ajoutees.match(/private void retablirSon\(\)/g) ?? []).length === 1,
    "deux définitions finiraient par diverger",
  )
}

// --- 3. La veille ne fait PAS pomper la musique ----------------------------
// Le contrôle qui compte le plus : c'est celui qu'une session pressée
// casserait en « uniformisant » les deux appels à start().
{
  const iWake = hook.indexOf("ecouterWakeNatif")
  const iCommande = hook.indexOf("ecouterCommandeNative")
  verifier("les deux modes d'écoute sont bien identifiés", iWake >= 0 && iCommande > iWake)

  const partieWake = hook.slice(iWake, iCommande)
  const partieCommande = hook.slice(iCommande)

  verifier(
    "le mode COMMANDE demande de baisser le son",
    /baisserLeSon:\s*true/.test(partieCommande),
    "c'est le cas d'usage de Raphaël : parler à Jarvis avec la musique lancée",
  )
  verifier(
    "le mode VEILLE ne le demande PAS",
    !/baisserLeSon/.test(partieWake),
    "une rafale toutes les 1 à 8 s ferait pomper la musique en permanence",
  )
  verifier(
    "le plugin ne baisse que si on le lui demande",
    ajoutees.includes('getBoolean("baisserLeSon"'),
    "sinon la veille baisserait le son malgré le réglage côté app",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
