/**
 * Jarvis se tait pendant qu'une mise à jour s'installe — et RIEN DE PLUS.
 *
 *   node --experimental-strip-types scripts/verifier-maj-ecoute.ts
 *
 * SA DEMANDE, 6 sept. 2026, capture à l'appui : la fenêtre d'installation
 * d'Android était ouverte PAR-DESSUS un « Conversation en cours — parle,
 * coupe-moi si tu veux ». Ses mots : « il faudrait stopper Jarvis de
 * s'activer directement UNIQUEMENT s'il y a des mises à jour auto qui se
 * lancent dès le lancement de l'app. »
 *
 * LE MOT « UNIQUEMENT » EST LA MOITIÉ QUI COMPTE, et c'est ce que la moitié
 * de ces contrôles vérifie. On suspend la VEILLE — ce que Jarvis déclenche
 * tout seul. On ne touche pas à ce qu'il demande, lui : un appui sur le cœur
 * pendant une mise à jour reste obéi, sinon on aurait remplacé un Jarvis
 * envahissant par un Jarvis sourd.
 *
 * Le second piège gardé ici : un drapeau laissé levé après une mise à jour
 * RATÉE rendrait Jarvis sourd jusqu'au prochain démarrage, sans un mot. C'est
 * la famille de pannes que ce projet traque depuis le début — une panne qui
 * se lit comme une absence.
 */
import { readFileSync } from "node:fs"
import { peutEcouterEnVeille } from "../src/lib/veille.ts"
import { majEnCours, noterMajEnCours, oublierMajEnCours, sAbonnerMaj } from "../src/lib/majEnCours.ts"

let echecs = 0
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) echecs++
  console.log(
    `${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`,
  )
}

// --- 1. La veille se suspend pendant une mise à jour ----------------------
{
  const base = { actif: true, visible: true, statut: "idle" as const }
  verifier("au repos, sans mise à jour : la veille écoute", peutEcouterEnVeille(base), true)
  verifier(
    "mise à jour en cours : la veille se tait",
    peutEcouterEnVeille({ ...base, majEnCours: true }),
    false,
  )
  verifier(
    "après une erreur, mise à jour en cours : toujours silencieux",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "error", majEnCours: true }),
    false,
  )
  verifier(
    "mise à jour finie : la veille reprend d'elle-même",
    peutEcouterEnVeille({ ...base, majEnCours: false }),
    true,
  )
}

// --- 2. Rien d'autre ne change ---------------------------------------------
// L'ancien comportement doit être strictement conservé pour les appelants qui
// ne savent rien des mises à jour (le banc d'essai, la fenêtre de l'appui long).
{
  verifier(
    "sans le champ : comportement d'avant, à l'identique",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "idle" }),
    true,
  )
  verifier(
    "app en arrière-plan : toujours non, mise à jour ou pas",
    peutEcouterEnVeille({ actif: true, visible: false, statut: "idle", majEnCours: false }),
    false,
  )
  verifier(
    "mot-clé désactivé : toujours non",
    peutEcouterEnVeille({ actif: false, visible: true, statut: "idle", majEnCours: false }),
    false,
  )
  verifier(
    "déjà en train d'écouter : la veille n'écrase pas le tour en cours",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "listening", majEnCours: false }),
    false,
  )
}

// --- 3. Le drapeau se lève, se baisse, et prévient -------------------------
{
  oublierMajEnCours()
  verifier("au départ, aucune mise à jour", majEnCours(), false)

  const vus: boolean[] = []
  const desabonner = sAbonnerMaj((v) => vus.push(v))
  noterMajEnCours(true)
  verifier("levé", majEnCours(), true)
  noterMajEnCours(true)
  verifier("levé deux fois : un seul avis, pas de rendu en boucle", vus, [true])
  noterMajEnCours(false)
  verifier("baissé", majEnCours(), false)
  verifier("les deux changements ont été annoncés", vus, [true, false])
  desabonner()
  noterMajEnCours(true)
  verifier("désabonné : plus rien ne remonte", vus, [true, false])

  oublierMajEnCours()
  const survivant: boolean[] = []
  sAbonnerMaj(() => {
    throw new Error("un abonné qui lève")
  })
  sAbonnerMaj((v) => survivant.push(v))
  noterMajEnCours(true)
  verifier(
    "un abonné qui lève n'empêche pas les autres d'être prévenus",
    survivant,
    [true],
  )
  oublierMajEnCours()
}

// --- 4. Une mise à jour RATÉE ne laisse pas Jarvis sourd -------------------
// Le contrôle lit le code : la règle porte sur la forme, et le cas ne se
// rejoue pas sans un vrai téléchargement.
{
  const hook = readFileSync("src/hooks/useMajWeb.ts", "utf8")
  const i = hook.indexOf("const appliquer = useCallback")
  const corps = hook.slice(i, hook.indexOf("useEffect(() => {\n    appliquerRef", i))
  verifier("la mise à jour lève le drapeau", /noterMajEnCours\(true\)/.test(corps), true)
  const apresCatch = corps.slice(corps.indexOf("} catch"))
  verifier(
    "et le baisse dans le catch — sinon Jarvis reste sourd jusqu'au redémarrage",
    /noterMajEnCours\(false\)/.test(apresCatch),
    true,
  )
}

// --- 5. « UNIQUEMENT » : l'appui volontaire reste obéi ---------------------
// Le contrôle qu'une session pressée casserait en « sécurisant » tout le
// composant. handleClick ne doit pas consulter le drapeau.
{
  const mic = readFileSync("src/components/voice/MicButton.tsx", "utf8")
  const i = mic.indexOf("function handleClick")
  verifier("handleClick existe", i >= 0, true)
  const corps = mic.slice(i, mic.indexOf("\n  }", i))
  verifier(
    "un appui sur le cœur n'est jamais refusé à cause d'une mise à jour",
    /majEnCours/.test(corps),
    false,
  )
  verifier(
    "la boucle de veille, elle, consulte le drapeau à chaque tour",
    /majEnCours: majEnCoursRef\.current/.test(mic),
    true,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
