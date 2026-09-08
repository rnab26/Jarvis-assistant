/**
 * La veille d'une fenêtre se tait pendant qu'une conversation Live tourne
 * dans L'AUTRE (chantier 2a5b7802, 7 sept. 2026).
 *
 *   node --experimental-strip-types scripts/verifier-live-croise.ts
 *
 * SA DEMANDE, verbatim : « Lorsque le mode conversation live est activé, il
 * y a des activations et désactivation de micro intempestive ca doit etre
 * régler car ces bruits sont tres dérangeant ».
 *
 * MESURÉ, PAS SUPPOSÉ, dans journal_ecoute avant ce correctif : sur une
 * conversation Live de 544957 ms, 70 cycles complets de la veille classique
 * (mot-clé « Jarvis », service Android natif) se sont déclenchés PENDANT —
 * un toutes les ~7-8 secondes, du début à la fin de la conversation. La
 * cause : l'app a DEUX points de montage de MicButton (ProtectedShell et
 * AssistantOverlayPage), et la fenêtre d'assistance (l'appui long sur la
 * touche latérale) est une VRAIE seconde BridgeActivity avec son propre
 * WebView — donc son propre tas JS. Le `status` React qui bloque déjà
 * correctement la veille PENDANT sa propre conversation Live n'existe tout
 * simplement pas dans l'autre fenêtre : rien ne lui disait qu'une
 * conversation tournait ailleurs.
 *
 * LA MOITIÉ DE CE CONTRÔLE VÉRIFIE LE SILENCE, PAS LA DÉTECTION : un
 * appui volontaire sur le cœur (handleClick) ne doit JAMAIS consulter ce
 * drapeau — sinon une conversation Live oubliée dans l'AUTRE fenêtre
 * empêcherait Raphaël de se servir de celle-ci à la main, ce qui serait pire
 * que le bruit qu'on corrige.
 */
import { readFileSync } from "node:fs"
import { peutEcouterEnVeille } from "../src/lib/veille.ts"

let echecs = 0
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) echecs++
  console.log(
    `${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`,
  )
}

// --- 1. La veille se tait quand Live tourne dans l'autre fenêtre ----------
{
  const base = { actif: true, visible: true, statut: "idle" as const }
  verifier("au repos, aucune Live ailleurs : la veille écoute", peutEcouterEnVeille(base), true)
  verifier(
    "une Live tourne ailleurs : la veille se tait, même statut idle ici",
    peutEcouterEnVeille({ ...base, liveAilleurs: true }),
    false,
  )
  verifier(
    "après une erreur locale, Live ailleurs : toujours silencieux",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "error", liveAilleurs: true }),
    false,
  )
  verifier(
    "la Live ailleurs se termine : la veille reprend d'elle-même",
    peutEcouterEnVeille({ ...base, liveAilleurs: false }),
    true,
  )
}

// --- 2. Rien d'autre ne change ---------------------------------------------
{
  verifier(
    "sans le champ : comportement d'avant, à l'identique",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "idle" }),
    true,
  )
  verifier(
    "app en arrière-plan : toujours non, Live ailleurs ou pas",
    peutEcouterEnVeille({ actif: true, visible: false, statut: "idle", liveAilleurs: false }),
    false,
  )
  verifier(
    "sa PROPRE Live (statut listening) : déjà couvert avant ce chantier",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "listening", liveAilleurs: false }),
    false,
  )
  verifier(
    "les deux gardes ensemble : mise à jour ET Live ailleurs, toujours non",
    peutEcouterEnVeille({ actif: true, visible: true, statut: "idle", majEnCours: false, liveAilleurs: true }),
    false,
  )
}

// --- 3. La boucle de veille consulte le drapeau natif, PAS handleClick ----
// Même principe que verifier-maj-ecoute.ts pour majEnCours : un appui
// volontaire ne doit jamais être bloqué par ce qui se passe dans l'autre
// fenêtre.
{
  const mic = readFileSync("src/components/voice/MicButton.tsx", "utf8")
  verifier(
    "MicButton importe le pont natif",
    /import\s*\{\s*liveActifQuelquePart\s*\}\s*from\s*"@\/lib\/live\/etatLiveNatif"/.test(mic),
    true,
  )
  const i = mic.indexOf("function handleClick")
  verifier("handleClick existe", i >= 0, true)
  const corpsClick = mic.slice(i, mic.indexOf("\n  }", i))
  verifier(
    "un appui sur le cœur n'est jamais refusé à cause d'une Live dans l'autre fenêtre",
    /liveActifQuelquePart|liveAilleurs/.test(corpsClick),
    false,
  )
  verifier(
    "la boucle de veille, elle, consulte le drapeau natif à chaque tour",
    /liveAilleurs:\s*await liveActifQuelquePart\(\)/.test(mic),
    true,
  )
}

// --- 4. sessionLive.ts pose/lève le drapeau pour TOUTE la conversation ----
// Pas juste une connexion : une reconnexion transparente (Google ferme au
// bout de 15 min) ne doit pas laisser retomber le drapeau entre deux
// connexions, sinon la fenêtre voisine réclamerait le micro pendant le
// battement.
{
  const session = readFileSync("src/lib/live/sessionLive.ts", "utf8")
  verifier(
    "sessionLive importe le pont natif",
    /import\s*\{\s*definirLiveActifNatif\s*\}\s*from\s*"@\/lib\/live\/etatLiveNatif"/.test(session),
    true,
  )
  const iMaintenir = session.indexOf("export async function maintenirSessionLive")
  verifier("maintenirSessionLive existe", iMaintenir >= 0, true)
  const corpsMaintenir = session.slice(iMaintenir)
  const iVrai = corpsMaintenir.indexOf("definirLiveActifNatif(true)")
  const iBoucle = corpsMaintenir.indexOf("const boucle = async ()")
  const iFaux = corpsMaintenir.indexOf("definirLiveActifNatif(false)")
  const iFinally = corpsMaintenir.indexOf("} finally {")
  verifier(
    "le drapeau se lève AVANT que la boucle de reconnexion démarre",
    iVrai >= 0 && iVrai < iBoucle,
    true,
  )
  verifier(
    "le drapeau ne retombe que dans un finally — toute sortie de la boucle le baisse, y compris un arrêt manuel ou une panne",
    iFinally >= 0 && iFinally < iFaux && iFaux < corpsMaintenir.indexOf("void boucle()"),
    true,
  )
  // demarrerSessionLive (une seule connexion, pas la conversation entière)
  // ne doit PAS poser le drapeau lui-même : il serait alors levé puis
  // baissé à chaque reconnexion transparente, exactement le trou qu'on evite.
  const iDemarrer = session.indexOf("export async function demarrerSessionLive")
  const iDemarrerFin = session.indexOf("\nexport async function maintenirSessionLive")
  const corpsDemarrer = session.slice(iDemarrer, iDemarrerFin)
  verifier(
    "demarrerSessionLive (une seule connexion) ne touche pas au drapeau lui-même",
    /definirLiveActifNatif/.test(corpsDemarrer),
    false,
  )
}

// --- 5. Le pont natif échoue en silence hors de l'app -----------------------
{
  const pont = readFileSync("src/lib/live/etatLiveNatif.ts", "utf8")
  verifier(
    "définir avale son échec (web, ou APK antérieure à ce plugin)",
    /definirLiveActifNatif[\s\S]{0,200}\.catch\(/.test(pont),
    true,
  )
  verifier(
    "lire l'état répond faux plutôt que de lever, hors de l'app",
    /liveActifQuelquePart[\s\S]{0,200}catch \{\s*return false/.test(pont),
    true,
  )
}

// --- 6. Le plugin natif est déclaré dans les DEUX fenêtres -----------------
// C'est le point qui aurait tout rendu inutile en silence : un plugin
// enregistré seulement dans MainActivity n'aide en rien la fenêtre
// d'assistance, qui est la seconde BridgeActivity où le bruit se produit.
{
  const plugin = readFileSync(
    "android/app/src/main/java/com/raphael/jarvis/EtatLivePlugin.java",
    "utf8",
  )
  verifier(
    "le drapeau est un champ statique partagé (les deux Activity vivent dans le même processus)",
    /private static volatile boolean actif/.test(plugin),
    true,
  )
  verifier("la méthode definir existe", /public void definir\(PluginCall call\)/.test(plugin), true)
  verifier("la méthode etat existe", /public void etat\(PluginCall call\)/.test(plugin), true)

  const mainActivity = readFileSync(
    "android/app/src/main/java/com/raphael/jarvis/MainActivity.java",
    "utf8",
  )
  verifier(
    "MainActivity (ProtectedShell) enregistre le plugin",
    /registerPlugin\(EtatLivePlugin\.class\)/.test(mainActivity),
    true,
  )

  const overlay = readFileSync(
    "android/app/src/main/java/com/raphael/jarvis/AssistOverlayActivity.java",
    "utf8",
  )
  verifier(
    "AssistOverlayActivity (la fenêtre d'assistance) enregistre AUSSI le plugin",
    /registerPlugin\(EtatLivePlugin\.class\)/.test(overlay),
    true,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
