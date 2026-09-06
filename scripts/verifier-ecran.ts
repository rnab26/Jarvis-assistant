/**
 * Vérifie le contrôle de l'écran par la voix, sans téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-ecran.ts
 *
 * CE QUI PEUT ÊTRE FAUX EN SILENCE ICI, et que ce contrôle garde :
 *
 * 1. UN CLIC AU HASARD. C'est la règle de sûreté du chantier, celle qui ne se
 *    négocie pas : quand l'élément désigné n'existe pas, ou que deux éléments
 *    différents se valent, on ne clique sur RIEN. Un clic de travers dans une
 *    application ouverte est une action qu'on ne rattrape pas — et la moitié
 *    des contrôles ci-dessous vérifie ce SILENCE, pas la détection.
 * 2. LA LISTE NOIRE QUI NE MORD PAS. Un motif cherché seulement dans le nom du
 *    paquet raterait « Bank Hapoalim » dicté par Raphaël ; cherché seulement
 *    dans le nom affiché, il raterait com.ideomobile.hapoalim.
 * 3. UNE PHRASE QUI MET AU PASSÉ CE QUI N'A PAS EU LIEU. « J'ai appuyé sur
 *    Envoyer » ne se dit que si le service a confirmé le clic — c'est le
 *    défaut du 6 sept., et il se réintroduit d'une ligne.
 * 4. LE SERVICE ABSENT DU MANIFESTE, ou sans canRetrieveWindowContent : il ne
 *    verrait rien, et « rien à l'écran » se lit exactement comme « je n'ai
 *    pas trouvé ».
 */
import { readFileSync } from "node:fs"
import {
  designer,
  motsIdentite,
  phraseEcran,
  rangDemande,
  resumeEcran,
  type ElementEcran,
  type LectureEcran,
} from "../src/lib/ecranTelephone.ts"
import {
  LISTE_NOIRE_VIDE,
  entreeDepuisLaVoix,
  entreeInterdisant,
  lireReglagesListeNoire,
  listeEffective,
} from "../src/lib/listeNoire.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let i = 0
const estTrouve = (d: ReturnType<typeof designer>, libelle: string) =>
  d.etat === "trouve" && d.element.libelle === libelle

const el = (libelle: string, cliquable = true, dansListe = false): ElementEcran => ({
  index: i++,
  libelle,
  cliquable,
  dansListe,
})
const ecran = (paquet: string, libelles: (string | ElementEcran)[]): LectureEcran => {
  i = 0
  return {
    paquet,
    application: paquet.split(".").pop(),
    elements: libelles.map((l) => (typeof l === "string" ? el(l) : l)),
  }
}

// ---------------------------------------------------------------------------
// Le cas d'usage à garder, celui écrit dans le chantier : YouTube.
// ---------------------------------------------------------------------------

// La barre d'outils est en dehors de la liste qui défile ; les résultats sont
// dedans. C'est exactement ce que rend le service sur un vrai écran.
const youtube = ecran("com.google.android.youtube", [
  el("Rechercher", true, false),
  el("Booba - Dolce Camara (Clip officiel)", true, true),
  el("Booba - Dolce Camara (Clip officiel)", true, true), // la vignette ET le titre
  el("Booba en interview chez Legend", true, true),
  el("Best of Booba 2024", true, true),
  el("Abonnements", true, false),
])

verifier(
  "« lance la deuxième vidéo » prend bien la deuxième, pas la deuxième LIGNE",
  estTrouve(designer("attends vas-y lance la deuxième vidéo", youtube), "Booba en interview chez Legend"),
  "deux nœuds portent le même titre (la vignette et le texte) : ils comptent pour un",
)

verifier(
  "« la première » reste la première",
  estTrouve(designer("lance la première", youtube), "Booba - Dolce Camara (Clip officiel)"),
  "le premier RÉSULTAT, pas la loupe de recherche de la barre d'outils",
)

verifier(
  "« celle avec Legend dans le titre » se désigne par les mots",
  estTrouve(designer("celle avec Legend dans le titre", youtube), "Booba en interview chez Legend"),
)

verifier(
  "mots + rang ensemble : « la deuxième vidéo de Booba » ne compte que les Booba",
  estTrouve(designer("la deuxième vidéo de Booba", youtube), "Booba en interview chez Legend"),
)

verifier(
  "« la dernière » existe",
  estTrouve(designer("lance la dernière", youtube), "Best of Booba 2024"),
  "« Abonnements » est dans la barre du bas, pas dans les résultats",
)

// --- Le silence : ce qui ne doit PAS cliquer -------------------------------

const rate = (ordre: string, lecture: LectureEcran) => designer(ordre, lecture).etat !== "trouve"

verifier(
  "un titre qui n'est pas à l'écran ne fait cliquer sur RIEN",
  rate("lance la vidéo de Jul", youtube),
  "c'est la règle de sûreté : rien trouvé, rien touché",
)
verifier(
  "un rang plus grand que ce qui est affiché ne retombe pas sur le dernier",
  rate("lance la douzième vidéo", youtube) &&
    designer("lance la douzième vidéo", youtube).etat === "aucun",
  "et « douzième » doit VRAIMENT être lu comme un rang, sinon ce contrôle passe pour rien",
)
verifier(
  "un écran sans rien de cliquable ne fait rien",
  rate("appuie sur envoyer", ecran("com.exemple", [el("Chargement…", false)])),
)
verifier(
  "deux libellés DIFFÉRENTS qui se valent : on demande, on ne choisit pas",
  designer("supprimer", ecran("com.exemple", ["Supprimer ici", "Supprimer tout"])).etat ===
    "ambigu",
  "deux suppressions différentes ne se départagent pas par la longueur du libellé",
)

// --- La désignation d'un bouton, le cas WhatsApp ---------------------------

const whatsapp = ecran("com.whatsapp", [
  el("Mel Ma Femme ❤", true),
  el("Message", true),
  el("Joindre", true),
  el("Envoyer", true),
  el("Envoyer un fichier", true),
])

verifier(
  "« appuie sur envoyer » prend « Envoyer », pas « Envoyer un fichier »",
  estTrouve(designer("appuie sur envoyer", whatsapp), "Envoyer"),
  "« Envoyer » ne dit rien de plus que ce qu'il a demandé, « Envoyer un fichier » si",
)
verifier(
  "« le bouton envoyer » : « bouton » dit la nature, pas l'identité",
  estTrouve(designer("le bouton envoyer", whatsapp), "Envoyer"),
)
verifier(
  "« envoie le fichier » vise l'autre",
  estTrouve(designer("appuie sur envoyer un fichier", whatsapp), "Envoyer un fichier"),
)

// --- Les briques de la lecture d'un ordre ----------------------------------

verifier(
  "les rangs se disent de plusieurs façons",
  rangDemande("la 2e") === 2 &&
    rangDemande("le deuxième") === 2 &&
    rangDemande("la seconde") === 2 &&
    rangDemande("la dernière") === -1 &&
    rangDemande("lance la 3") === 3 &&
    rangDemande("la 3ème") === 3 &&
    rangDemande("la douzième") === 12,
)
verifier(
  "un grand nombre n'est pas un rang",
  rangDemande("appuie sur 2024") === null,
  "une année, un prix, un numéro de rue : ce n'est pas « le 2024e élément »",
)
verifier(
  "un ordre sans identité ne garde que le rang",
  motsIdentite("lance la deuxième vidéo").length === 0,
  "« vidéo » dit la nature de l'élément, pas son titre",
)
verifier(
  "les mots d'identité survivent aux mots de commande",
  motsIdentite("vas-y appuie sur Dolce Camara").join(" ") === "dolce camara",
)

// ---------------------------------------------------------------------------
// La liste noire
// ---------------------------------------------------------------------------

verifier(
  "une banque est interdite par son PAQUET",
  entreeInterdisant("com.ideomobile.hapoalim", "Bank Hapoalim", LISTE_NOIRE_VIDE) !== null,
)
verifier(
  "et par son NOM AFFICHÉ, quand le paquet ne dit rien",
  entreeInterdisant("com.xyz.app", "Ma Banque", LISTE_NOIRE_VIDE) !== null,
  "c'est le nom affiché qu'il dicte, jamais le paquet",
)
verifier(
  "un portefeuille et un gestionnaire de mots de passe aussi",
  entreeInterdisant("com.bitwarden.x", undefined, LISTE_NOIRE_VIDE) !== null &&
    entreeInterdisant("com.google.android.apps.walletnfcrel", undefined, LISTE_NOIRE_VIDE) !== null,
)
verifier(
  "YouTube et WhatsApp ne sont PAS interdits",
  entreeInterdisant("com.google.android.youtube", "YouTube", LISTE_NOIRE_VIDE) === null &&
    entreeInterdisant("com.whatsapp", "WhatsApp", LISTE_NOIRE_VIDE) === null,
  "liste noire, pas liste blanche : sa décision du 3 sept.",
)
verifier(
  "ce qu'il dicte s'ajoute",
  (() => {
    const e = entreeDepuisLaVoix("Ma Caisse")
    if (!e) return false
    return entreeInterdisant("com.x.macaisse", "Ma Caisse", { ajouts: [e], retraits: [] }) !== null
  })(),
)
verifier(
  "et une entrée d'origine se retire",
  entreeInterdisant("com.paypal.android", "PayPal", { ajouts: [], retraits: ["paypal"] }) === null,
  "une liste imposée qu'on ne peut pas défaire finit par bloquer sans recours",
)
verifier(
  "un réglage abîmé ne vide pas la liste noire",
  listeEffective(lireReglagesListeNoire("{ pas du json")).length > 0,
  "retomber sur « plus rien d'interdit » serait le pire des échecs silencieux",
)

// ---------------------------------------------------------------------------
// Les phrases : jamais de passé sur ce qui n'a pas eu lieu
// ---------------------------------------------------------------------------

verifier(
  "un clic confirmé se dit au passé, et il NOMME l'élément",
  phraseEcran({ fait: "clic", libelle: "Envoyer" }).includes("appuyé sur « Envoyer »"),
)
const echecTrouve = phraseEcran({
  fait: "echec",
  cause: { etat: "aucun", raison: "introuvable" },
  lecture: youtube,
})
verifier(
  "un échec dit qu'on n'a rien touché, et énumère ce qui est là",
  echecTrouve.includes("rien touché") && echecTrouve.includes("Rechercher"),
  "un « je n'ai pas trouvé » sec le laisse sans savoir quoi redire",
)
verifier(
  "aucune phrase d'échec ne contient « j'ai appuyé »",
  [
    phraseEcran({ fait: "echec", cause: "service_inactif" }),
    phraseEcran({ fait: "echec", cause: "ecran_change" }),
    phraseEcran({ fait: "echec", cause: "refus" }),
    phraseEcran({ fait: "echec", cause: "app_interdite", application: "Bank Leumi" }),
    phraseEcran({ fait: "echec", cause: { etat: "ambigu", candidats: [el("A"), el("B")] } }),
  ].every((p) => !/j'ai appuyé/i.test(p)),
  "c'est le défaut du 6 sept. : le passé sur ce qui n'a pas eu lieu",
)
verifier(
  "l'écran interdit nomme l'application, sinon il ne saura pas laquelle",
  phraseEcran({ fait: "echec", cause: "app_interdite", application: "Bank Leumi" }).includes(
    "Bank Leumi",
  ),
)
verifier(
  "un résumé d'écran ne déborde pas",
  resumeEcran(youtube, 2).includes("de plus"),
)

// ---------------------------------------------------------------------------
// La déclaration Android : sans elle, le service ne voit rien
// ---------------------------------------------------------------------------

const manifeste = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")
const config = readFileSync("android/app/src/main/res/xml/accessibilite.xml", "utf8")
const activite = readFileSync("android/app/src/main/java/com/raphael/jarvis/MainActivity.java", "utf8")

verifier(
  "le service est déclaré, avec la permission que le système exige",
  manifeste.includes(".JarvisAccessibiliteService") &&
    manifeste.includes("android.permission.BIND_ACCESSIBILITY_SERVICE") &&
    manifeste.includes("android.accessibilityservice.AccessibilityService"),
  "sans BIND_ACCESSIBILITY_SERVICE, Android refuse de s'y lier et il n'apparaît nulle part",
)
verifier(
  "il peut LIRE l'écran",
  /canRetrieveWindowContent="true"/.test(config),
  "sans ça, getRootInActiveWindow() rend toujours null — en silence",
)
verifier(
  "il n'est PAS limité à une liste d'applications",
  !/packageNames=/.test(config),
  "filtrer ici ferait une liste blanche, exactement ce que Raphaël a écarté",
)
verifier(
  "le plugin est enregistré : sans ça, rien de tout ça n'est atteignable",
  /registerPlugin\(AccessibilitePlugin\.class\)/.test(activite),
)

verifier(
  "la lecture NOMME l'application, pour qu'il sache si Jarvis regarde le bon écran",
  phraseEcran({ fait: "lu", lecture: youtube }).includes("youtube"),
)

const service = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/JarvisAccessibiliteService.java",
  "utf8",
)
const corpsCliquer = service.slice(service.indexOf("public ResultatClic cliquer"))
verifier(
  "cliquer() relit l'écran et refuse si le libellé a changé",
  corpsCliquer.includes("equalsIgnoreCase(attendu)") &&
    corpsCliquer.includes("ResultatClic.ECRAN_CHANGE"),
  "entre la lecture et le clic, un écran peut avoir changé : là on ne touche à rien",
)

verifier(
  "la lecture écarte NOTRE fenêtre : sinon Jarvis lit sa propre pastille",
  service.includes("racineUtile") &&
    service.includes("getWindows()") &&
    service.includes("nous.contentEquals(p)"),
  "la fenêtre d'assistance est une vraie activité : elle est la fenêtre ACTIVE pendant qu'il parle",
)
verifier(
  "et le drapeau qui donne getWindows() est déclaré",
  /flagRetrieveInteractiveWindows/.test(config),
  "sans lui, getWindows() ne rend que la fenêtre active — la nôtre",
)

const controle = readFileSync("src/lib/controleEcran.ts", "utf8")
const corpsAgir = controle.slice(controle.indexOf("export async function agirSurEcran"))
verifier(
  "la liste noire est consultée AVANT toute action, y compris défiler",
  corpsAgir.indexOf("entreeInterdisant") < corpsAgir.indexOf('commande === "retour"'),
  "sur l'écran d'une banque, Jarvis ne fait rien du tout",
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
