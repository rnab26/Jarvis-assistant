/**
 * Vérifie le widget de tâches DÉFILANT, sans téléphone (chantier 562f1475).
 *
 *   node --experimental-strip-types scripts/verifier-widget-taches.ts
 *
 * Deux moitiés, et il faut les deux.
 *
 * LA DÉCISION (`src/lib/widgetTaches.ts`), qui peut être fausse en silence :
 * une tâche faite qui reste sur le widget, un plafond qui coupe les urgentes,
 * un « aujourd'hui » calculé en UTC qui cesse de compter ses urgentes entre
 * minuit et 3 h du matin (il vit en Israël).
 *
 * LE CÂBLAGE ANDROID, dont chaque oubli est MUET — et c'est pour ça qu'on le
 * lit ici plutôt que de faire confiance : il n'y a ni SDK Android ni appareil
 * dans cet environnement, la CI prouve que ça compile, pas que ça défile.
 *   - pas de ListView : rien ne peut défiler, par construction ;
 *   - pas de setRemoteAdapter : la liste reste vide ;
 *   - pas de notifyAppWidgetViewDataChanged : elle se figera sur son premier
 *     dessin, une tâche cochée y restera affichée ;
 *   - pas de setData unique : deux widgets posés côte à côte partagent une
 *     fabrique, et le second se fige sur le contenu du premier ;
 *   - pas de BIND_REMOTEVIEWS au manifeste : Android refuse de se lier au
 *     service, et ne le dit nulle part ;
 *   - pas de setEmptyView : une liste vide est un rectangle vide, qui se lit
 *     exactement comme un widget en panne.
 *
 * Chaque contrôle structurel vise l'APPEL ou la CONDITION, jamais la présence
 * du mot — le piège déjà payé cinq fois dans ce dépôt (sélecteur Playwright,
 * `Filesystem.mkdir`, `com.google.android.as`, le drapeau Live, `STATUS_PAUSED`).
 */
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

/**
 * LE CONTRÔLE DU JOUR LOCAL N'A DE SENS QUE HORS D'UTC, et le conteneur de la
 * CI est en UTC : « local » et « UTC » y désignent le même jour, donc le
 * contrôle restait VERT quand on remettait `toISOString()` — essayé à l'envers
 * le 27 sept. 2026, c'est comme ça qu'on l'a su. Poser `process.env.TZ` en
 * cours de route ne suffit pas (Node garde le fuseau de son démarrage, mesuré
 * le même jour) : on se relance donc une fois, dans SON fuseau à lui.
 */
if (process.env.TZ !== "Asia/Jerusalem") {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, TZ: "Asia/Jerusalem" },
  })
  process.exit(r.status ?? 1)
}
import {
  PLAFOND_WIDGET,
  TOUTES,
  estUrgente,
  isoLocal,
  lignesDuWidget,
  nombrePorte,
  tachesDuWidget,
  type ConfigWidget,
} from "../src/lib/widgetTaches.ts"
import type { Task } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const sansCommentaires = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
const sansCommentairesXml = (x: string) => x.replace(/<!--[\s\S]*?-->/g, " ")

// Le 28 sept. 2026 à 0 h 30, heure d'Israël : il est 21 h 30 la VEILLE en UTC.
// C'est l'instant exact où l'ancien calcul lui cachait ses urgentes du jour.
const MAINTENANT = new Date(2026, 8, 28, 0, 30, 0)
const AUJOURDHUI = "2026-09-28"
const HIER = "2026-09-27"

let n = 0
function tache(champs: Partial<Task>): Task {
  n++
  return {
    id: `t${n}`,
    user_id: "u",
    title: `Tâche ${n}`,
    status: "todo",
    category_id: null,
    due_date: null,
    due_time: null,
    notes: null,
    position: n,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...champs,
  } as Task
}

const config = (c: Partial<ConfigWidget> = {}): ConfigWidget => ({
  maxTasks: TOUTES,
  urgentOnly: false,
  categoryId: null,
  ...c,
})

// --- 1. Le jour est LOCAL, pas celui d'UTC ---------------------------------

verifier(
  "le jour se lit dans le fuseau de l'appareil, pas en UTC",
  isoLocal(MAINTENANT) === AUJOURDHUI,
  `isoLocal a rendu ${isoLocal(MAINTENANT)} ; toISOString aurait dit ${MAINTENANT.toISOString().slice(0, 10)}`,
)
verifier(
  "une tâche due AUJOURD'HUI est urgente même à 21 h (UTC dirait la veille)",
  estUrgente(tache({ due_date: AUJOURDHUI }), isoLocal(MAINTENANT)),
  "c'est le défaut trouvé dans l'ancien widgetSnapshot : ses urgentes disparaissaient le soir",
)
verifier(
  "en retard = urgente",
  estUrgente(tache({ due_date: "2026-09-20" }), AUJOURDHUI),
)
verifier(
  "sans date, jamais urgente",
  !estUrgente(tache({ due_date: null }), AUJOURDHUI),
)
verifier(
  "demain n'est pas urgent",
  !estUrgente(tache({ due_date: "2026-09-29" }), AUJOURDHUI),
)

// --- 2. Ce que le widget prend en compte -----------------------------------

const faite = tache({ status: "done", title: "Déjà faite" })
const perso = tache({ category_id: "c-perso", title: "Perso" })
const admin = tache({ category_id: "c-admin", title: "Admin" })
const jeu = [faite, perso, admin]

verifier(
  "une tâche FAITE ne part jamais au widget",
  !tachesDuWidget(jeu, config()).some((t) => t.id === faite.id),
  "sinon elle y reste affichée après avoir été cochée, et rien ne le dit",
)
verifier(
  "le filtre catégorie ne garde que la sienne",
  tachesDuWidget(jeu, config({ categoryId: "c-perso" })).map((t) => t.title).join() === "Perso",
)
verifier(
  "sans catégorie choisie, tout passe",
  tachesDuWidget(jeu, config()).length === 2,
)

// --- 3. Le plafond ---------------------------------------------------------

verifier(
  "« Toutes » veut dire le plafond technique, pas zéro tâche",
  nombrePorte(TOUTES) === PLAFOND_WIDGET,
  "à zéro, le widget serait vide en permanence pour tout le monde",
)
verifier(
  "un plafond au-delà du technique y est ramené",
  nombrePorte(500) === PLAFOND_WIDGET,
  "la charge utile d'une mise à jour de widget est plafonnée : au-delà, elle échoue ENTIÈREMENT",
)
verifier(
  "un plafond raisonnable est respecté tel quel",
  nombrePorte(10) === 10,
)
verifier(
  "une valeur absurde n'affame pas la liste",
  nombrePorte(Number.NaN) === PLAFOND_WIDGET && nombrePorte(-3) === PLAFOND_WIDGET,
  "un réglage corrompu doit montrer les tâches, pas rien",
)

// --- 4. Les lignes --------------------------------------------------------

const enRetard = tache({ title: "Rappeler la banque", due_date: "2026-09-20" })
const aujourdhui = tache({ title: "Relancer Moli", due_date: AUJOURDHUI, due_time: "12:00" })
const plusTard = tache({ title: "Acheter coque airpods", due_date: "2026-10-14" })
const sansDate = tache({ title: "Racheter un spot pour l'entrée" })
const ordonnees = [enRetard, aujourdhui, plusTard, sansDate]

const lignes = lignesDuWidget(ordonnees, config(), MAINTENANT)
verifier(
  "chaque ligne porte le titre tel qu'il l'a écrit",
  lignes.map((l) => l.titre).join(" | ") === ordonnees.map((t) => t.title).join(" | "),
  lignes.map((l) => l.titre).join(" | "),
)
verifier(
  "l'échéance est écrite en clair, pas en ISO",
  lignes[0].echeance === "20 sept." && lignes[1].echeance === "aujourd'hui 12:00",
  `[${lignes[0].echeance}] [${lignes[1].echeance}]`,
)
verifier(
  "une tâche d'hier se lit « hier », pas un quantième",
  lignesDuWidget([tache({ due_date: HIER })], config(), MAINTENANT)[0].echeance === "hier",
  "c'est `lireEcheance` qui décide, et le widget doit dire comme l'onglet Tâches",
)
verifier(
  "une tâche sans date n'affiche pas d'échéance — ni « Invalid Date »",
  lignes[3].echeance === "",
  `[${lignes[3].echeance}]`,
)
verifier(
  "ce qui se colore : en retard ET aujourd'hui, jamais plus tard",
  lignes.map((l) => l.urgent).join() === "true,true,false,false",
  lignes.map((l) => `${l.titre}=${l.urgent}`).join(" | "),
)
verifier(
  "« urgentes uniquement » ne garde que celles-là",
  lignesDuWidget(ordonnees, config({ urgentOnly: true }), MAINTENANT).map((l) => l.titre).join() ===
    "Rappeler la banque,Relancer Moli",
)
verifier(
  "aucune tâche : une liste vide, pas une ligne fantôme",
  lignesDuWidget([], config(), MAINTENANT).length === 0,
  "c'est setEmptyView qui dit « Aucune tâche », pas une fausse ligne",
)

// L'ORDRE REÇU EST CONSERVÉ. Ce contrôle vérifie ce que la fonction FAIT — elle
// ne trie pas — et non une paraphrase de ce qu'on voudrait qu'elle fasse : une
// entrée délibérément à l'envers doit sortir à l'envers. Le jour où quelqu'un
// ajoute un tri ici, il tombe, et c'est le but : l'ordre vient du SQL de
// `useTasks`, partagé avec l'onglet Tâches.
const inverse = [...ordonnees].reverse()
verifier(
  "l'ordre reçu est conservé, aucun second tri n'est inventé ici",
  lignesDuWidget(inverse, config(), MAINTENANT).map((l) => l.titre).join() ===
    inverse.map((t) => t.title).join(),
  "un tri écrit ici finirait par contredire l'ordre de l'onglet Tâches",
)
verifier(
  "le plafond coupe la FIN, donc garde les urgentes que le SQL met en tête",
  lignesDuWidget(ordonnees, config({ maxTasks: 2 }), MAINTENANT).map((l) => l.titre).join() ===
    "Rappeler la banque,Relancer Moli",
)

// --- 5. Ce que le JS écrit est ce que le Java relit -------------------------

const snapshot = readFileSync("src/lib/widgetSnapshot.ts", "utf8")
const service = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/JarvisWidgetTachesService.java",
  "utf8",
)
const provider = readFileSync(
  "android/app/src/main/java/com/raphael/jarvis/JarvisWidgetProvider.java",
  "utf8",
)
const layout = readFileSync("android/app/src/main/res/layout/jarvis_widget.xml", "utf8")
const ligneXml = readFileSync("android/app/src/main/res/layout/jarvis_widget_ligne.xml", "utf8")
const manifeste = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")

const cleJs = /key:\s*CLE_LIGNES|CLE_LIGNES\s*=\s*"([^"]+)"/.exec(snapshot)
const cleJava = /KEY_LIGNES\s*=\s*"([^"]+)"/.exec(service)
const nomCleJs = /CLE_LIGNES\s*=\s*"([^"]+)"/.exec(snapshot)?.[1]
verifier(
  "les deux côtés nomment la MÊME clé de stockage natif",
  !!cleJs && !!cleJava && nomCleJs === cleJava[1],
  `JS: ${nomCleJs} — Java: ${cleJava?.[1]} ; une clé disparue = un widget vide et muet`,
)

// Les champs de chaque ligne : le JSON est le contrat entre les deux moitiés.
const champs = Object.keys(lignes[0])
for (const champ of champs) {
  verifier(
    `le Java relit le champ « ${champ} » que le JS écrit`,
    new RegExp(`"${champ}"`).test(service),
    `LigneWidget porte « ${champ} » et JarvisWidgetTachesService ne le lit pas`,
  )
}

// --- 6. Le câblage de la liste défilante -----------------------------------

const layoutPropre = sansCommentairesXml(layout)
verifier(
  "la liste est une ListView, la seule chose qu'un widget Android sache faire défiler",
  /<ListView[\s\S]*?android:id="@\+id\/widget_task_list"/.test(layoutPropre),
  "un TextView ne défile pas, quel que soit son maxLines — c'était le défaut d'origine",
)
// UNE BALISE, PAS LE FICHIER. Ces deux contrôles cherchaient leurs attributs
// avec des `[\s\S]*?` non bornés : ils traversaient la fin de la balise visée et
// trouvaient le « 0dp » du TextView vide plus bas, ou le « match_parent » de la
// racine. Tous deux restaient VERTS quand on remettait wrap_content — essayé à
// l'envers le 27 sept. 2026. On isole donc la balise avant de la lire.
const balise = (xml: string, ouverture: RegExp): string => {
  const i = xml.search(ouverture)
  if (i < 0) return ""
  const fin = xml.indexOf(">", i)
  return fin < 0 ? "" : xml.slice(i, fin + 1)
}
const baliseListe = balise(layoutPropre, /<ListView\b/)
verifier(
  "la liste est bien la ListView de la mise en page",
  /android:id="@\+id\/widget_task_list"/.test(baliseListe),
  baliseListe.slice(0, 120),
)
verifier(
  "la ListView reçoit toute la hauteur restante (0dp + weight)",
  /android:layout_height="0dp"/.test(baliseListe) &&
    /android:layout_weight="1"/.test(baliseListe),
  `en wrap_content, une ListView se replie sur une ligne : ${baliseListe.slice(0, 200)}`,
)
// La colonne : le LinearLayout vertical qui porte la liste. Le seul du fichier
// à la fois vertical et pondéré — la racine est horizontale, la ligne d'en-tête
// n'a pas de poids.
const baliseColonne = balise(layoutPropre, /<LinearLayout(?=[^>]*android:orientation="vertical")/)
verifier(
  "la colonne qui porte la liste est en match_parent",
  /android:layout_height="match_parent"/.test(baliseColonne) &&
    /android:orientation="vertical"/.test(baliseColonne),
  `sinon la ListView n'a aucune hauteur à se partager : ${baliseColonne.slice(0, 200)}`,
)
verifier(
  "la racine n'est plus centrée verticalement",
  !/android:id="@\+id\/widget_root"[\s\S]{0,400}?android:gravity="center_vertical"/.test(layoutPropre),
  "dans un widget étiré, le cœur flotterait au milieu à côté d'une liste qui commence en haut",
)
verifier(
  "la vue « aucune tâche » existe et reste visible dans le XML",
  /android:id="@\+id\/widget_task_empty"/.test(layoutPropre) &&
    !/widget_task_empty"[\s\S]{0,300}?android:visibility="gone"/.test(layoutPropre),
  "setEmptyView la montre ou la cache ; à gone ici, l'aperçu du sélecteur de widgets serait vide",
)
verifier(
  "la ligne n'utilise que des vues acceptées par RemoteViews",
  /android:id="@\+id\/widget_row_title"/.test(ligneXml) &&
    /android:id="@\+id\/widget_row_due"/.test(ligneXml) &&
    !/<(?!\/|LinearLayout|TextView|\?xml)[A-Z]/.test(sansCommentairesXml(ligneXml)),
  "une vue non supportée fait échouer la ligne entière, sans message",
)

const providerPropre = sansCommentaires(provider)
verifier(
  "le provider branche l'adaptateur sur la ListView",
  /setRemoteAdapter\(\s*R\.id\.widget_task_list\s*,/.test(providerPropre),
  "sans lui, la ListView reste vide pour toujours",
)
verifier(
  "l'intent de l'adaptateur est rendu UNIQUE par widget",
  /setData\(\s*Uri\.parse\([\s\S]{0,80}toUri\(/.test(providerPropre),
  "Android distingue deux adaptateurs par les données de l'intent, extras EXCLUS : sans setData, deux widgets partagent une fabrique",
)
verifier(
  "l'id du widget voyage dans l'intent",
  /EXTRA_APPWIDGET_ID/.test(providerPropre),
)
verifier(
  "la fabrique est prévenue à chaque mise à jour",
  /notifyAppWidgetViewDataChanged\(\s*appWidgetId\s*,\s*R\.id\.widget_task_list\s*\)/.test(
    providerPropre,
  ),
  "sans ce signal, la liste se fige sur son premier dessin : une tâche cochée y reste",
)
verifier(
  "le signal part APRÈS updateAppWidget",
  providerPropre.indexOf("notifyAppWidgetViewDataChanged") >
    providerPropre.indexOf("updateAppWidget(appWidgetId, views)"),
  "posé avant, il porterait sur une vue qui n'a pas encore d'adaptateur",
)
verifier(
  "la vue vide est branchée",
  /setEmptyView\(\s*R\.id\.widget_task_list\s*,\s*R\.id\.widget_task_empty\s*\)/.test(
    providerPropre,
  ),
  "sans elle, « aucune tâche » se lit comme un widget en panne",
)
verifier(
  "le provider ne remplit plus la liste comme un texte",
  !/setTextViewText\(\s*R\.id\.widget_task_list/.test(providerPropre),
  "un setTextViewText sur une ListView ne fait rien, en silence",
)

// --- 7. Les appuis, et celui qui n'existerait plus -------------------------

verifier(
  "le cœur ET l'en-tête ouvrent l'app en écoutant",
  /setOnClickPendingIntent\(\s*R\.id\.widget_core\s*,/.test(providerPropre) &&
    /setOnClickPendingIntent\(\s*R\.id\.widget_header\s*,/.test(providerPropre),
  "une ListView consomme les appuis : un clic posé sur la racine ne serait jamais reçu au-dessus de la liste",
)
verifier(
  "le clic « écouter » reste celui du widget cœur, pas une seconde copie",
  /JarvisCoreWidgetProvider\.ouvrirEtEcouter\(/.test(providerPropre),
  "deux constructions du même intent finiraient par dériver",
)
verifier(
  "une ligne s'appuie par un MODÈLE, pas par un PendingIntent à elle",
  /setPendingIntentTemplate\(\s*R\.id\.widget_task_list\s*,/.test(providerPropre) &&
    /setOnClickFillInIntent\(\s*R\.id\.widget_row_root\s*,/.test(sansCommentaires(service)),
  "RemoteViews refuse un PendingIntent dans une vue de collection : l'appui ne ferait rien",
)
verifier(
  "le modèle est MUTABLE, sinon Android ne peut pas le compléter",
  /FLAG_MUTABLE/.test(providerPropre),
  "depuis Android 12, un PendingIntent immuable ne peut pas recevoir ce que la ligne y ajoute",
)
verifier(
  "un appui sur une tâche n'ouvre PAS le micro",
  !/ouvrirLesTaches[\s\S]{0,400}?demarrer_ecoute/.test(providerPropre),
  "il veut voir sa liste, pas dicter ; le cœur est juste à côté pour l'autre",
)

// --- 8. Le service au manifeste -------------------------------------------

const manifestePropre = sansCommentairesXml(manifeste)
verifier(
  "le service de la liste est déclaré",
  /<service[^>]*android:name="\.JarvisWidgetTachesService"/.test(manifestePropre),
)
verifier(
  "il exige BIND_REMOTEVIEWS",
  /JarvisWidgetTachesService"[\s\S]{0,200}?android:permission="android\.permission\.BIND_REMOTEVIEWS"/.test(
    manifestePropre,
  ),
  "sans cette permission Android refuse de s'y lier, la liste reste vide, et rien ne le dit",
)

// --- 9. La fabrique ne décide rien, et ne plante pas ----------------------

const servicePropre = sansCommentaires(service)
verifier(
  "la fabrique relit à onDataSetChanged",
  /onDataSetChanged\(\)\s*\{\s*relire\(\);/.test(servicePropre),
  "sans relecture, elle sert indéfiniment les tâches de la première fois",
)
verifier(
  "un JSON illisible donne une liste vide, jamais une exception",
  /catch\s*\(\s*Throwable[\s\S]{0,200}?new ArrayList<>\(\)/.test(servicePropre),
  "une exception ici fait afficher au widget l'erreur d'Android à la place de la liste",
)
verifier(
  "getViewAt borne sa position",
  /position\s*<\s*0\s*\|\|\s*position\s*>=\s*lignes\.size\(\)/.test(servicePropre),
  "la liste peut changer entre deux dessins, et une IndexOutOfBounds vide le widget entier",
)
verifier(
  "la fabrique n'invente ni tri ni plafond",
  !/sort\(|Collections\.sort|subList\(|\.size\(\)\s*>\s*\d+/.test(servicePropre),
  "l'ordre et le plafond vivent dans widgetTaches.ts : une seconde règle ici contredirait l'onglet Tâches",
)

// --- 10. Le réglage est réglable, et le widget peut s'étirer ---------------

const reglage = readFileSync("src/hooks/useWidgetSetting.ts", "utf8")
const ecran = readFileSync("src/pages/SettingsPage.tsx", "utf8")
const infoXml = readFileSync("android/app/src/main/res/xml/jarvis_widget_info.xml", "utf8")

verifier(
  "le défaut porte toutes ses tâches",
  /DEFAULT_CONFIG[^=]*=\s*\{\s*maxTasks:\s*TOUTES/.test(sansCommentaires(reglage)),
  "un plafond par défaut cacherait des tâches sans que rien ne le dise",
)
verifier(
  "Paramètres propose « Toutes » et le plafond technique",
  /value=\{String\(TOUTES\)\}/.test(ecran) && /PLAFOND_WIDGET\]/.test(ecran),
  "l'ancien sélecteur s'arrêtait à 5, et c'est précisément là que son réglage était coincé",
)
verifier(
  "Paramètres dit que la liste défile",
  /défile/.test(ecran.slice(ecran.indexOf("Widget d'écran d'accueil"), ecran.indexOf("Widget d'écran d'accueil") + 900)),
  "sinon il cherchera un réglage « combien de tâches tiennent à l'écran » qui n'existe plus",
)
const maxH = /android:maxResizeHeight="(\d+)dp"/.exec(infoXml)
verifier(
  "le widget peut s'étirer assez haut pour qu'un défilement serve",
  !!maxH && Number(maxH[1]) >= 400,
  `maxResizeHeight = ${maxH?.[1]}dp : à 220 il pouvait défiler sans jamais pouvoir s'agrandir`,
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
