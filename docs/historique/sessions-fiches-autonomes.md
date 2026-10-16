# Historique — Sessions autonomes, questions à Raphaël et anciennes fiches

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

## Les sessions autonomes : ce qui avance pendant ses absences

Livré le 6 sept. 2026 (chantier `59d8587f`). Sa demande dictée : « Tout les
chantiers ne nécessitant pas l'action de traiter des chantiers disponibles a
travailler doivent etres travailler seul afin de gagner du temps en
developpement sur les temps mort de ma présence ». Sa réponse, le 6 sept. à
00 h 05 : « **Oui en continue même la journee. Éviter de lancer une session si
une autre en est deja en cours et est disponible** pour plusieurs raison : ne
pas consommer trop de crédit claude code, ne pas augmenter le nombre de session
qui deviendrais sûrement inactive a la fin de la tâche ».

Un déclencheur horaire (une Routine, visible dans ses Routines sur claude.ai)
ouvre une session fraîche. **Tout le reste existait déjà** — marqueurs,
réservation, hook de démarrage, CI sur toutes les branches, `demander.sh` pour
ne pas bloquer sur un arbitrage. Il ne manquait que quelqu'un pour ouvrir la
session.

- `docs/session-autonome.md` — la consigne que suit cette session. Versionnée
  exprès : une consigne se relit avant de prendre effet, elle ne se lit pas
  depuis une ligne de base que personne n'a revue.
- `src/lib/passeAutonome.ts` — **la décision, pure**. Vérifiée hors ligne par
  `scripts/verifier-sessions-autonomes.ts`.
- `scripts/passe-autonome.ts` — le premier geste d'une session autonome, en UN
  appel à la base : `--demarrer` répond `travaille` (code 0) ou se retire
  (code 3). Un verdict autre que `travaille` veut dire « n'ouvre aucun
  fichier » : chaque tour de plus est du crédit dépensé pour rien.
- Migration `0024_passes_autonomes.sql` — la trace des passes, et
  `etat_pour_passe_autonome()`.
- `src/components/settings/SessionsAutonomes.tsx` — l'interrupteur et ce qui
  s'est passé (Paramètres › Le cockpit).

**Le marqueur `[LIBRE]` se lit en TypeScript, jamais en SQL**, et c'est le
point à ne pas défaire. `marqueurDe` est la seule lecture des marqueurs du
projet, celle que le cockpit affiche. En écrire une seconde en SQL, c'est
accepter qu'elles divergent un jour — et le jour où elles divergent, une
session autonome code un chantier qu'il voulait d'abord trancher avec nous.
D'où une fonction SQL qui rend l'ÉTAT (réglage, réservations, passes ouvertes,
chantiers avec leurs notes) et un module TypeScript qui décide.

**Une passe qui se retire s'enregistre elle aussi**, et c'est voulu : sans ça
« il n'y avait rien à faire cette nuit » et « le déclencheur ne tourne plus
depuis trois jours » se ressemblent parfaitement. La carte le dit
(« Plus rien ne passe » au-delà de 200 minutes de silence alors que c'est
allumé). Ces passes vivent dans leur propre table et **pas dans `dev_log`** :
le hook de démarrage n'injecte que les douze dernières entrées du journal, et
une passe par heure chasserait en une demi-journée ses consignes, les questions
qui attendent sa décision et les messages entre sessions.

**Les sujets qu'une session autonome ne prend jamais**, même marqués `[LIBRE]` :
contrôle du téléphone, accès aux applications, envoi de messages en son nom,
clonage vocal, toute dépense. Ils se discutent avec lui, et une session ouverte
par un déclencheur n'a personne à qui parler. On ratisse volontairement large —
un chantier écarté à tort attend la prochaine session qu'il ouvre, ce qui ne
coûte rien ; un chantier pris à tort part pendant qu'il dort.

**Et ce filtre a déjà laissé passer le pire, le 6 sept. 2026 à 10 h 15**
(chantier `4d0ebdf3`). La passe a rendu « travaille » sur `3f3ad20b` — « agir
directement sur le téléphone comme s'il était l'utilisateur (contrôle des
APPLICATIONS) », c'est-à-dire le service d'accessibilité qui clique à sa place.
Le motif cherchait « controle du telephone » ; le titre disait « contrôle des
applications ». Deux autres suivaient dans la file, dont « Mode entraînement »,
dont les notes disent « stocker ses identifiants chiffrés en base pour que
Jarvis se connecte à sa place » — aucune catégorie ne parlait d'identifiants.

Le contrôle censé garder ça était vert, et il ne pouvait qu'être vert : ses
cinq cas d'essai étaient des **paraphrases des expressions régulières**
(« Permettre à Jarvis de prendre le contrôle du téléphone » reprend le motif
« prendre le controle »). Il vérifiait que la regex se reconnaît elle-même.
C'est le piège déjà payé par le sélecteur Playwright et par `Filesystem.mkdir`
le 4 sept. : **un contrôle doit viser la VRAIE donnée, et être essayé à
l'envers avant d'être cru.** Les cas de `verifier-sessions-autonomes.ts` sont
désormais des titres copiés du cockpit, et remettre l'ancien filtre fait
tomber neuf vérifications.

Deux points à ne pas défaire. `NOTES_LUES` vaut **1500** caractères et pas
400 : une note s'ouvre par le marqueur, la date et l'historique, et le
périmètre réel vient après — à 400, « Bulle Jarvis flottante » passait au
travers, son titre ne disant pas de quel accès spécial il s'agit. Et les faux
positifs ne se « corrigent » pas : le filtre écarte aujourd'hui trois chantiers
à tort, c'est le prix écrit du paragraphe ci-dessus. Si tu ajoutes un motif,
mesure-le sur ses vrais chantiers (la marche à suivre est en tête de
`SUJETS_RESERVES`) plutôt que de le juger à l'œil sur des titres imaginés.

Le déclencheur est la Routine `trig_01AbpcwCgpLeVMTtyCfqRguQ`, une fois par
heure, et elle réveille **une session persistante qui porte le dépôt**
(`session_01HbJWrhPvY3kn3jzuCdyBWH`).

**Une Routine qui ouvre une session FRAÎCHE ne lui donne pas le dépôt**, et
c'est la première version de ce déclencheur : deux tirs pour rien, le 6 sept.
`create_trigger` avec `create_new_session_on_fire` pose un `sources: []` — la
session démarre dans un conteneur vide, sans `scripts/`, sans CLAUDE.md. Le
piège est silencieux trois fois : la Routine se déclare `SUCCEEDED`, la session
n'apparaît pas dans `list_sessions` (identifiant préfixé `cse_`), et la seule
trace est une absence de ligne dans `passes_autonomes` — ce qui, dans l'app,
ressemble exactement à « il n'y avait rien à faire ». Toute Routine qui doit
toucher au dépôt se rattache donc à une session existante
(`persistent_session_id`), comme le font déjà toutes les autres Routines de
Raphaël. Après un tir, la vérification est une ligne de plus dans
`passes_autonomes` ; sinon, `get_session` sur `last_run.session_id` et regarder
si `session_context.sources` est vide.

**Une session autonome n'hérite pas forcément des outils `mcp__github__*`** :
dans ce cas elle ne peut pas lire la CI, et `docs/session-autonome.md` lui dit
de lancer elle-même, en entier, ce que la CI lance — ce sont les mêmes
scripts — puis de l'écrire dans `dev_log`.

### Une réponse de Raphaël réveille le travail (15 sept. 2026)

Sa phrase : « J'ai répondu dans l'application jarvis **faut que tu sois au
courant quand je réponds** ».

**Mesuré ce jour-là** : il a répondu à trois questions entre 17:49 et 17:54. La
dernière passe datait de 12:19 et s'était retirée en `rien_a_prendre`. La
suivante se serait retirée pareil — ses réponses débloquent presque toujours un
chantier `[À CADRER]`, que la passe REFUSE de prendre par construction. Il avait
fait sa part, et rien ne bougeait.

`etat_pour_passe_autonome()` (migration 0046) rend donc aussi **ce qu'il a
répondu depuis la dernière passe TERMINÉE**, et `deciderPasse` a un cinquième
verdict, `il_a_repondu` (code de sortie 0, comme `travaille`). Le script imprime
ses mots en entier.

Quatre choses à ne pas défaire :

1. **Le verdict ne RÉSERVE rien.** Il réveille une session en lui disant d'aller
   lire ; c'est elle qui décide. Le garde-fou du `[LIBRE]` n'est pas levé — il
   est rendu inutile par le fait qu'il a parlé.
2. **Sa volonté passe AVANT** : `eteint` et `occupe` l'emportent sur ses
   réponses. La consigne du 6 sept. (« une seule session à la fois ») ne se
   contourne pas parce qu'il a répondu entre-temps.
3. **Une passe qui part travailler emporte quand même ses réponses.** Coder
   pendant qu'il attend une suite est exactement ce qu'il reproche.
4. **Le repère est `answered_at` comparé à la dernière passe terminée** — ni un
   compteur à tenir, ni une colonne de plus. Une passe qui plante ne perd rien :
   la suivante reverra la même réponse.

**Ce qui N'EST PAS possible, et qu'il ne faut pas retenter** : le réveiller en
TEMPS RÉEL. `watch_url` rend bien une URL de webhook, mais elle n'accepte que
des appels signés par un service précis — essayé le 15 sept., un POST nu rend
**401**, et le secret est scellé pour ce service, illisible depuis la session.
La base ne peut donc pas réveiller une session Claude. Le délai réel est celui
de la Routine (toutes les 6 h au 15 sept., d'après `passes_autonomes` : 00:16,
06:17, 12:19) — c'est sa cadence à lui de la changer dans ses Routines.

**Pour tout arrêter** : Paramètres › Le cockpit › Sessions autonomes. Le
réglage `jarvis_sessions_autonomes` est lu EN BASE à chaque passe — d'où
`ecrireAutonomie()` et pas un `localStorage.setItem`, qui resterait sur son
téléphone et n'éteindrait rien du tout.

## Un artefact est un lieu de passage : ce qu'il répond va EN BASE

Sa demande du 5 sept. 2026 au soir, après avoir répondu aux quatorze points
d'une fiche pour rien : « les artefacts ont trop de durée de vie limitée et je
te colle des réponses détaillées quand c'était nécessaire ». Deux choses
distinctes se sont passées ce soir-là, et il faut retenir les deux.

**Le bug, pour ne pas le refaire.** La fiche n'enregistrait QUE les champs de
texte. `enregistrer()` abandonnait en silence tant que `claude.use("db")`
n'avait pas répondu — ce qui arrive toujours APRÈS le premier rendu, parfois
plusieurs secondes plus tard. Tous ses appuis des premières secondes étaient
donc perdus, puis le chargement tardif écrasait l'état en mémoire et
redessinait la page vide. Le compteur affichait « 0 / 14 » pendant qu'il
cochait : le signe était à l'écran, personne ne l'a lu. Toute page à capacité
`db` doit donc (1) **mettre en file** ce qui arrive avant que la base réponde
et le vider dès qu'elle est là, (2) ne **jamais** laisser un chargement écraser
ce que l'utilisateur a déjà touché — un drapeau posé au premier geste et jamais
remis à faux, pas un drapeau d'écriture en cours, qui retombe.

**La règle, qui vaut au-delà du bug.** Une fiche reste bonne pour POSER les
questions au pouce. Mais ses réponses ne doivent pas y rester : **recopie-les
dans les notes des chantiers concernés dès que tu les lis**, en citant ses mots.
Une note de chantier survit à tout ; un artefact, non — il vit hors du dépôt et
hors de la base, et la session suivante ne sait même pas qu'il existe si
personne n'a collé son URL ici.

Le chantier `85ae62b5` porte la sortie définitive : un écran « Ce qui attend ta
décision » dans l'app elle-même, alimenté par une table, avec les options
cliquables, un commentaire par question et les photos dans le Storage Supabase.
Le jour où il est livré, **on cesse de publier des fiches pour lui poser des
questions**.

## Une question à Raphaël : `scripts/demander.sh`, plus jamais un artefact

**Livré le 5 sept. 2026 (chantier `85ae62b5`). C'est la règle courante ; tout
ce qui suit sur les fiches est de l'histoire, gardé pour ses réponses passées.**

```bash
scripts/demander.sh --question "On garde le mot-à-mot combien de temps ?" \
  --pourquoi "Supprimer est irréversible, garder ne l'est pas." \
  --chantier 5ca5c4a3-19c6-44f4-8846-b53f9e4d7ee1 \
  --option "Sans limite|Rien n'est jamais supprimé.|recommande" \
  --option "30 jours|Un mois glissant, puis on efface."

# Ce qu'il doit FAIRE, lui, et non décider :
scripts/demander.sh --action --question "Dépose GOOGLE_GEOCODING_API_KEY dans les secrets Supabase" \
  --pourquoi "Sans elle, les rappels de lieu ne savent pas géocoder une adresse."
```

La question devient une ligne de `dev_log` (colonnes `pourquoi`, `options`,
`etat`, `photo_chemin`, migration 0022). Elle s'affiche **en tête de son
cockpit** — carte « Ce qui attend ta décision », sous « Où j'en suis » — avec
les options cliquables, un **champ de commentaire par question**, un bouton
photo par question, et pour une action les trois états **Fait / Pas encore /
Ça bloque**. Sa réponse repart dans `dev_log` en `kind = 'reponse'`, et le hook
de démarrage l'injecte dans **chaque** session suivante, dans deux blocs
dédiés : « Ce qui attend une DÉCISION de Raphaël » et « Ce que Raphaël a
répondu ». Une capture jointe se récupère avec `scripts/photo.sh <chemin>`.

**Chaque point arrive REPLIÉ sur sa question**, et c'est mesuré : déplié, un
seul point (question, pourquoi, trois options, champ de commentaire, photo,
bouton) fait 616 points de haut sur un écran de téléphone et repoussait le
tableau des chantiers à 1 382. Replié, la carte entière en fait 200. La
question, elle, reste lisible sans ouvrir — c'est elle qui lui dit lequel
ouvrir — et l'état d'une action se lit sur la ligne repliée.

**Pourquoi on a arrêté les fiches**, ses mots du 5 sept. : « les artefacts ont
trop de durée de vie limitée et je te colle des réponses détaillées quand
c'était nécessaire ». Une fiche vit hors du dépôt ET hors de la base : la
session suivante ne sait même pas qu'elle existe si personne n'a collé son URL
ici. Ce soir-là, deux fiches lui ont posé LA MÊME question et il a répondu deux
choses différentes.

**On n'a PAS ouvert de table `decisions`.** Elle aurait fait ce que `dev_log`
fait déjà — une session demande, il répond, `answered_at` referme — et il y
aurait eu deux endroits où chercher une question, avec la moitié dans chacun.
Ce qui manquait tenait en quatre colonnes. Même raison pour la réponse : elle
s'écrit en toutes lettres (le LIBELLÉ de l'option, pas sa clé), dans une entrée
de journal ordinaire, lisible telle quelle des années après même si le code qui
a posé la question a disparu.

**Une seule règle décide de ce qui l'attend**, `enAttenteDeRaphael` dans
`src/lib/journalDestinataire.ts` : elle sert à la fois à la carte où il répond
et à la colonne « pour toi » de « Où j'en suis ». Deux lectures différentes du
même message, c'est exactement ce qui lui a fait répondre deux fois. Une
question adressée à une AUTRE session (« Pour la session … ») n'en fait pas
partie.

Avant de poser une question : **relis les notes du chantier, le journal et le
bloc de démarrage**. Une question à laquelle il a déjà répondu et qu'on repose
est ce qui l'épuise le plus.

## Historique : les fiches d'avant le 5 sept. (ne plus en publier)

### Plusieurs questions à Raphaël : ce que les fiches faisaient

**Ne publie plus de fiche : passe par `scripts/demander.sh`, ci-dessus.** Cette
section reste parce que ses réponses passées y sont, et parce qu'elle dit ce
qu'une bonne question doit porter — c'est ce que la carte du cockpit reprend.

Ce qu'on faisait avant : dès qu'il y avait **plus de deux ou trois questions**,
ne pas les empiler dans un message mais publier un **artefact** qu'il remplit
au pouce. Il travaille
souvent depuis son téléphone, et répondre point par point dans une
conversation lui fait perdre le fil.

La fiche doit, pour chaque point : poser la question, dire **pourquoi** tu la
poses et ce que tu sais déjà, proposer des **options cliquables** avec
**ta recommandation** marquée, et laisser un **champ libre** — ses réponses
écrites valent souvent mieux que les options qu'on lui propose.

Déclare la capacité `db` : ses réponses sont alors enregistrées côté serveur et
tu les relis avec `read_db` (`action: "read_db"` sur l'URL de l'artefact) sans
qu'il ait à les recopier.

**CHAQUE question porte son champ de commentaire, sans exception.** Il l'a
demandé trois fois avant que ce soit fait (3 et 4 sept. 2026), ses mots :
« je n'ai que des choix de propositions, aucun commentaire ni fichier à
t'envoyer pour affiner mes réponses ». Des options cliquables seules ne
suffisent pas : c'est dans ses commentaires que se trouve ce qui change
réellement le travail. Un champ libre unique en bas de page ne compte pas —
il faut un champ **par proposition**, sinon il ne sait plus à quoi il répond.

**Et un bouton pour joindre une photo, sur chaque question aussi.** La
capacité `assets` n'est PAS disponible sur son compte (vérifié le 4 sept.,
le contrôle est `Skill: artifact-capabilities`, qui liste le jeu réel) : on
passe donc par `db`, qui accepte 256 Ko par document. Le motif qui marche,
mesuré : compresser dans un canvas (côté max 1400 px, qualité JPEG dégressive
jusqu'à passer sous 180 Ko), stocker **chaque photo dans son propre document**
`photos/<uuid>` — jamais dans le document des réponses, qu'un seul cliché
ferait dépasser —, et l'enregistrer dès qu'il la choisit plutôt qu'au bouton
final. Tu les relis avec `read_db` sur la collection `photos` (`out_dir` pour
les écrire en fichiers). Une image de 3000×2000 tombe à ~130 Ko et reste
lisible. Si elle ne passe toujours pas, la page le lui dit et l'invite à
l'envoyer dans la conversation. Sépare bien les **décisions** (il choisit) des
**actions** (il fait quelque chose : créer un compte, déposer une clé) — pour
les secondes, une liste numérotée qu'il coche au fur et à mesure te dit quand
tu peux démarrer.

### Les fiches déjà publiées — à lire avant de reposer une question

Raphaël a déjà répondu à beaucoup de choses dans ces fiches. Ses réponses n'ont
pas toutes été recopiées dans les notes des chantiers. **Avant de lui demander
quoi que ce soit qui ressemble à une préférence, un arbitrage ou un périmètre,
va d'abord voir s'il a déjà répondu ici** (outil Artifact, `action: "read"`, et
`action: "read_db"` sur la même URL pour les réponses enregistrées) :

- **Jarvis, pièce par pièce** — catalogue oui/non de ce qu'il veut :
  https://claude.ai/code/artifact/d9bda589-10ac-4de4-a515-1c41ad95b90a
- **Ce qu'il me manque** — décisions à options :
  https://claude.ai/code/artifact/fc8f0416-f799-4fc6-b9ae-3951b1486dbd
- **Brancher Google à Jarvis** — actions à faire côté Google Cloud :
  https://claude.ai/code/artifact/27f79fa6-2f64-49bd-879e-5215df9f88cd
- **Déblocage Google (refaite le 3 sept.)** — remplace la précédente, où il
  restait bloqué à l'étape 3 : le bouton « Interne » grisé lui faisait croire
  à une erreur, alors qu'il n'existe que pour une organisation Workspace et
  qu'il doit choisir « Externe ». Publiée par la session C :
  https://claude.ai/code/artifact/8e38d78d-82b3-437f-ad74-dce4dbd4fde2

- **Les 4 verrous** — les configurations manuelles qui débloquent 12 chantiers
  (Google, notifications Firebase, recherche web, et 3 arbitrages : voix,
  WhatsApp, géocodage payant). Remplace et prolonge la fiche « Brancher Google »
  ci-dessus, qui restait bloquée à son étape 3 :
  https://claude.ai/code/artifact/8e38d78d-82b3-437f-ad74-dce4dbd4fde2
  Ses réponses et son avancement sont dans le document `fiche/deverrouillage`
  (outil Artifact, `action: "read_db"`, `db_op: "get"`) : **relis-les avant de
  lui redemander quoi que ce soit** sur ces sujets.

- **Brancher Google, pas à pas** — les étapes qui lui restent après la
  correction de l'erreur 400 (`redirect_uri_mismatch`, 3 sept. 2026) :
  se connecter, contourner l'écran « application non validée », et publier
  l'application pour que l'autorisation ne meure pas au bout de 7 jours.
  https://claude.ai/code/artifact/aba8e4d3-4e1d-46d1-9873-c150702fa909
  S'il bute quelque part, il l'écrit dans le champ du bas : document
  `fiche/brancher-google` (`action: "read_db"`, `db_op: "get"`).

- **L'arbitrage WhatsApp** — **RÉPONDU le 3 sept. au soir, ne repose pas la
  question.** Ses décisions, à traiter comme acquises : (1) on reste sur le
  TÉLÉPHONE — pas de compte business, pas de bibliothèque non officielle ;
  (2) les envois programmés passent par une intervention de Jarvis au moment
  dit, il valide à la voix ; (3) les reçus arrivent par mail ET par SMS ;
  (4) **finbot est un service automatique sur WhatsApp**, à qui il envoie des
  reçus en photo. La fiche et le détail de ses mots :
  https://claude.ai/code/artifact/c12ec042-2873-423b-af88-c5cf68370cf3
  (`action: "read_db"`, `db_op: "get"`, collection `fiche`, doc_id `whatsapp`).
- **Ce qui ferait grandir Jarvis** — les deux chantiers non codables du thème
  « L'app elle-même » : quatre décisions de capacité (cache du contexte,
  recherche web, lecture de liens/PDF, mémoire des conversations) et trois
  densités d'affichage des tâches qu'il choisit au pouce.
  https://claude.ai/code/artifact/067c81c1-88de-4ca9-8947-8df34eb9f89e
  Ses réponses : document `fiche/capacite-et-visuel` (`action: "read_db"`,
  `db_op: "get"`). **Ne code rien de ces deux chantiers avant de les avoir
  lues** — c'est un [À CADRER] pour le visuel, et un arbitrage de coût pour la
  recherche web.

- **Quand Jarvis doit te déranger** — les neuf notifications proposées à
  Raphaël, classées par ce qu'elles coûtent en attention (ça sonne / une fois
  par jour / silencieux / déconseillé), avec mes recommandations déjà cochées.
  https://claude.ai/code/artifact/7d87dcb4-4cfd-48fb-9e52-603d4143ab2d
  Ses choix : document `fiche/notifications` (`action: "read_db"`,
  `db_op: "get"`) — un booléen par notification, plus `heure_matin` et un
  champ libre. **À lire avant de coder quoi que ce soit du chantier
  « Systèmes de notifications » (5d03a192).**

- **La clé de test Gemini** — les six étapes pour créer un SECOND projet
  Google AI Studio et sa clé, afin que les vérifications des sessions cessent
  de vider le quota du jour de Raphaël (c'est ce qui l'a laissé sans Jarvis le
  3 sept. à 21h28). Chaque étape se coche, avec commentaire et capture.
  https://claude.ai/code/artifact/e1bfdff8-c18e-4642-9752-1c4029d046aa
  Son avancement : document `fiche/cle-test` (`action: "read_db"`,
  `db_op: "get"`) — un booléen par étape (projet, studio, creer, copier,
  deposer, dire) plus ses commentaires. **Chantier 4eaf9c1d.**
- **Ce qui attend Raphaël** (5 sept.) — 5 actions et 8 décisions restées ouvertes
  après les 24 h de sessions autonomes : mises à jour en Wi-Fi, voix app fermée,
  conservation des conversations, contenu du briefing, recherche web payante ou
  non, ElevenLabs, périmètre du contrôle du téléphone, barre d'actions du site
  de Mélissa. Ses réponses sont enregistrées : `action: "read_db"` sur l'URL.
  https://claude.ai/code/artifact/4e952f48-99a4-41de-9c67-44c24769bc17

- **Le tableau de bord de Raphaël** (5 sept., soir) — **LA FICHE COURANTE, celle
  à lire en premier.** Elle REMPLACE et refond les précédentes, qu'il jugeait
  « désordonnées » : « il me demande de créer des clés, mais il ne me dit pas où
  les déposer. Je ne peux pas écrire si je l'ai fait, si ça bloque. » Elle porte
  donc, pour chacun des 3 gestes et des 11 décisions : la page exacte, le champ
  exact, la valeur exacte à taper, un état **Fait / Pas encore / Ça bloque**, un
  champ libre ET un bouton photo — par point, jamais un seul en bas de page.
  https://claude.ai/code/artifact/a23fc9f6-99e1-4c70-90ee-03ab15ff82d9
  Ses réponses : `action: "read_db"`, `db_op: "get"`, collection `fiche`,
  doc_id `tableau-de-bord` ; ses photos : collection `photos` (une par
  document, champ `item` = l'identifiant du point).

  **Ce que cette fiche a établi, et qu'il ne faut plus lui redemander** (vérifié
  le 5 sept. dans les secrets Supabase, pas supposé) : `GEMINI_API_KEY_TEST` est
  DÉPOSÉE et fonctionne ; `FIREBASE_SERVICE_ACCOUNT` est DÉPOSÉ et
  `android/app/google-services.json` est en place (projet `jarvis-507506`,
  paquet `com.raphael.jarvis`) — les notifications app fermée n'attendent plus
  que du code ; le compte Google est branché depuis le 3 sept. avec
  `gmail.modify` + `calendar.events`. **Le SEUL secret manquant de tout le
  projet est `GOOGLE_GEOCODING_API_KEY`**, et il ne sert qu'aux rappels de lieu,
  dont il n'a aucun. Pour refaire ce constat sans rien lui demander :

  ```bash
  curl -sS https://api.supabase.com/v1/projects/bexiyvmdbxcwxasgslxp/secrets \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | python3 -c \
    "import json,sys; print('\n'.join(sorted(s['name'] for s in json.load(sys.stdin))))"
  grep -rhoP 'Deno\.env\.get\("\K[A-Z_0-9]+' supabase/functions/ | sort -u
  ```

  (la première liste ce qui EST déposé, la seconde ce que le code ATTEND ; la
  différence est la seule chose à lui demander — jamais une liste devinée)

Les deux premières servent aussi de modèle : catalogue oui/non, et décisions à
options. Si tu publies une nouvelle fiche, **ajoute son URL à cette liste** dans
le même commit — sinon elle sera perdue pour les sessions suivantes.
