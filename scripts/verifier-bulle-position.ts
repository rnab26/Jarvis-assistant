/**
 * La bulle flottante ne peut pas sortir de l'écran, et si elle en est déjà
 * sortie, on sait la rappeler.
 *
 *   node --experimental-strip-types scripts/verifier-bulle-position.ts
 *
 * SON SIGNALEMENT, 7 sept. 2026 : « ma bulle jarvis est bloqué complètement en
 * haut a droite j'arrive plus a la récupérer ».
 *
 * LES TROIS CAUSES, et il fallait les trois — corriger une seule laissait le
 * défaut entier :
 *   1. FLAG_LAYOUT_NO_LIMITS autorise la vue à déborder de l'écran ;
 *   2. le glissement ajoutait le déplacement du doigt SANS AUCUNE BORNE ;
 *   3. la position est ENREGISTRÉE — donc une fois dehors, elle y restait,
 *      après l'arrêt du service, après un redémarrage, pour toujours.
 *
 * CE CONTRÔLE LIT LE CODE JAVA, et c'est assumé : il n'y a pas de SDK Android
 * ici, la CI prouve que ça compile et pas que ça borne. Même famille que
 * `verifier-telechargement-apk.ts`. Il vise donc les APPELS, pas la simple
 * présence des mots — le piège déjà payé deux fois sur ce dépôt.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const service = readFileSync("android/app/src/main/java/com/raphael/jarvis/BulleService.java", "utf8")
const plugin = readFileSync("android/app/src/main/java/com/raphael/jarvis/BullePlugin.java", "utf8")
const pont = readFileSync("src/lib/bulleFlottante.ts", "utf8")
const carte = readFileSync("src/components/settings/BulleFlottante.tsx", "utf8")

/** Le corps d'une méthode Java, pour viser un APPEL et pas une définition. */
function corps(source: string, signature: string): string {
  const debut = source.indexOf(signature)
  if (debut === -1) return ""
  let profondeur = 0
  let i = source.indexOf("{", debut)
  const depart = i
  for (; i < source.length; i++) {
    if (source[i] === "{") profondeur++
    else if (source[i] === "}") {
      profondeur--
      if (profondeur === 0) return source.slice(depart, i + 1)
    }
  }
  return ""
}

console.log("— La bulle reste attrapable —")

verifier(
  "une méthode borne la position dans l'écran",
  /private void bornerDansEcran\(/.test(service),
)

{
  const glissement = corps(service, "public boolean onTouch(")
  verifier(
    "elle est appelée PENDANT le glissement",
    glissement.includes("bornerDansEcran("),
    "sans ça on voit la bulle partir hors de l'écran pendant le geste — c'est ce départ qui donne l'impression de l'avoir perdue",
  )
}

{
  // Le cas de Raphaël : sa bulle était DÉJÀ hors écran, position enregistrée.
  // Borner le glissement ne l'aurait jamais ramenée.
  const pose = corps(service, "private void afficher(") || service
  verifier(
    "et à la POSE, pour réparer une position déjà enregistrée hors écran",
    /params\.y = prefs\.getInt\(POS_Y[\s\S]{0,600}?bornerDansEcran\(/.test(service),
    "c'est LE cas signalé : sa bulle était déjà dehors, et la position survivait au redémarrage",
  )
  void pose
}

verifier(
  "la position réparée est réenregistrée",
  /bornerDansEcran\([\s\S]{0,300}?putInt\(POS_X/.test(service),
  "sinon elle repartirait dehors au prochain démarrage du service",
)

verifier(
  "une marge garantit qu'il reste de la bulle à attraper",
  /margeVisible/.test(service),
  "« entièrement dans l'écran » interdirait de la coller au bord, ce qu'on fait naturellement pour la ranger",
)

console.log("\n— Le filet : la rappeler quand elle est perdue —")

verifier("le service sait oublier la position", /static void oublierPosition\(/.test(service))
{
  const replacer = corps(plugin, "public void replacer(")
  verifier("le plugin expose « replacer »", replacer.length > 0)
  verifier(
    "   et il oublie la position AVANT de relancer",
    replacer.indexOf("oublierPosition") !== -1 &&
      replacer.indexOf("oublierPosition") < replacer.indexOf("startService"),
    "le service relit la position à son démarrage : dans l'autre ordre, il reposerait la bulle au même endroit",
  )
}
verifier("le pont TypeScript la déclare", /replacer\(\): Promise<void>/.test(pont))
verifier(
  "et un bouton l'appelle depuis Paramètres",
  /onClick=\{\(\) => void replacer\(\)\}/.test(carte),
  "sans bouton, une bulle perdue n'a AUCUN recours dans l'app — il faudrait désinstaller",
)
verifier(
  "le bouton dit ce qu'il fait",
  /Replacement…/.test(carte) && /Remise à gauche de l'écran/.test(carte),
  "même règle que « Revérifier » de la mémoire : une action qui ne montre rien passe pour cassée",
)

console.log("\n— La ranger sans passer par Paramètres (chantier 9c22a183) —")

{
  // L'appui long ne pouvait JAMAIS se déclencher : l'OnTouchListener renvoie
  // true dès ACTION_DOWN, donc Android n'appelle pas onTouchEvent, qui est
  // l'endroit où il détecte l'appui long. Un setOnLongClickListener sur cette
  // vue est donc du code mort — ce contrôle refuse qu'on le remette.
  verifier(
    "pas d'OnLongClickListener mort sur la bulle",
    !/\.setOnLongClickListener\(/.test(service),
    "avec un OnTouchListener qui consomme ACTION_DOWN, il ne se déclenche jamais",
  )
  const toucher = corps(service, "public boolean onTouch(")
  const bas = toucher.slice(toucher.indexOf("ACTION_DOWN"), toucher.indexOf("ACTION_MOVE"))
  verifier(
    "l'appui long est programmé à l'appui (postDelayed + délai système)",
    /postDelayed\(appuiLong,\s*ViewConfiguration\.getLongPressTimeout\(\)\)/.test(bas),
  )
  const mouvement = toucher.slice(toucher.indexOf("ACTION_MOVE"), toucher.indexOf("ACTION_UP"))
  verifier("   et annulé dès qu'elle glisse", /removeCallbacks\(appuiLong\)/.test(mouvement))
  const relache = toucher.slice(toucher.indexOf("ACTION_UP"), toucher.indexOf("ACTION_CANCEL"))
  verifier("   et au relâcher", /removeCallbacks\(appuiLong\)/.test(relache))
  verifier(
    "le glissement montre la croix du bas",
    /montrerCible\(\)/.test(mouvement),
  )
  verifier(
    "lâchée sur la croix, elle est rangée AVANT que la position soit enregistrée",
    relache.indexOf("ranger()") !== -1 && relache.indexOf("ranger()") < relache.indexOf("putInt(POS_X"),
    "enregistrer d'abord la ferait réapparaître sur la croix, en bas de l'écran, la prochaine fois",
  )
}
{
  const cible = corps(service, "private void montrerCible(")
  verifier(
    "la croix ne prend AUCUN toucher (elle volerait les appuis de l'app en dessous)",
    /FLAG_NOT_TOUCHABLE/.test(cible) && /FLAG_NOT_FOCUSABLE/.test(cible),
  )
  const ranger = corps(service, "private void ranger(")
  verifier(
    "ranger la bulle arrête aussi son écoute — sa teinte était le seul signe que le micro était ouvert",
    ranger.indexOf("arreterSiActive()") !== -1 && ranger.indexOf("arreterSiActive()") < ranger.indexOf("stopSelf()"),
  )
  verifier(
    "la croix disparaît avec le service",
    /cacherCible\(\)/.test(corps(service, "public void onDestroy(")),
  )
  verifier(
    "Paramètres dit comment la ranger sans y revenir",
    /croix en bas/.test(pont),
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
