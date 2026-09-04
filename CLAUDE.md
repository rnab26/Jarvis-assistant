# CLAUDE.md — Jarvis (ce repo)

Complète le CLAUDE.md global de Raphaël (ne le remplace pas). Spécifique au
projet Jarvis (assistant vocal personnel, PWA + app Android via Capacitor).

Sa méthode de travail générale — celle qui vaut pour tous ses projets, pas
seulement celui-ci — est consignée dans `docs/methode-de-travail.md`. Lis-la
si tu débarques : elle explique pourquoi le cockpit et le journal existent, et
ce qu'il attend d'une session qui reprend un travail commencé ailleurs.

## Livrer une fonctionnalité utilisable, pas du code qui marche

Consigne permanente de Raphaël (4 sept. 2026), écrite en entier dans
`docs/methode-de-travail.md`, section du même nom : brief d'usage en cinq
lignes AVANT de coder, modifier/supprimer avec confirmation, réglages plutôt
que valeurs en dur, états vide/chargement/erreur, parcours depuis un écran de
téléphone, et trois lignes à la livraison. Lis-la avant de prendre un chantier.

## Cockpit de développement (chantiers)

Ce projet a un **cockpit interne** dans l'app elle-même (`/cockpit`), soutenu
par une vraie table Supabase — pas juste des notes dans une conversation.
Raphaël y ajoute des chantiers par la voix ou depuis l'interface.

- **Projet Supabase** : `bexiyvmdbxcwxasgslxp` (org `rnab26's Org`).
- **Table** : `dev_items` (`id`, `title`, `notes`, `status`
  todo/in_progress/done, `priority` low/normal/high, `theme`, `archived_at`).

### Prends un THÈME, pas un chantier isolé

Les chantiers sont groupés par `theme` — dans l'app comme dans le bloc injecté
au démarrage. C'est une demande explicite de Raphaël : il en a assez des
correctifs ponctuels posés en pansement, un symptôme à la fois. Les chantiers
d'un même thème partagent presque toujours la même cause racine, et se
traitent ensemble à un coût bien moindre que séparément.

Un chantier arrivé sans thème (dicté trop vite, mal classé) : classe-le en le
traitant, `update dev_items set theme = '...' where id = '...'`. Reprends un
thème existant **à l'identique** ; un thème presque identique éparpille le
sujet au lieu de le rassembler.

### Au démarrage de CHAQUE session, avant toute autre chose

**Normalement tu n'as rien à faire : c'est déjà chargé.** Un hook de démarrage
(`.claude/hooks/session-start.sh`) lit la base à chaque ouverture de session et
injecte l'état du projet dans ton contexte — chantiers en cours avec leurs
réservations, douze dernières entrées du journal, huit derniers chantiers
livrés. Raphaël n'a rien à coller, et tu n'as pas à redemander.

Si ce bloc « État du projet au démarrage de cette session » n'apparaît pas, ou
s'il dit que le cockpit n'a pas pu être chargé, fais les lectures à la main —
et pour le détail complet d'un chantier (les notes sont tronquées dans
l'injection), de toute façon c'est par là :

```bash
# 1. Les chantiers en cours, et qui les a réservés
scripts/sql.sh "select id, title, status, priority, notes, claimed_by, claim_expires_at from dev_items where archived_at is null order by priority desc, created_at"

# 2. Le journal de bord : consignes de Raphaël et messages des autres sessions
scripts/sql.sh "select created_at, author, kind, body, answered_at, item_id from dev_log order by created_at desc limit 30"

# 3. Ce qui a déjà été livré, pour ne pas refaire ni défaire
scripts/sql.sh "select title, notes, archived_at from dev_items where archived_at is not null order by archived_at desc limit 15"
```

Lis-les vraiment avant de proposer quoi que ce soit. Une question dont la
réponse est déjà dans les notes d'un chantier, dans le journal ou dans une
fiche (voir plus bas) ne doit pas être reposée à Raphaël.

**En terminant un chantier**, marque-le fait et archive-le, avec une note
qui référence le commit — c'est la pratique établie qui sert d'historique
(visible directement dans l'app, section "Archivées" du cockpit) :

```bash
scripts/sql.sh "update dev_items set status = 'done', archived_at = now(), notes = 'Fait : <résumé court>. Commit <hash>.' where id = '<id>'"
```

**Ne laisse jamais un travail sans trace.** Si tu t'arrêtes en cours de route,
que tu es interrompu, ou que Raphaël change de sujet : écris où tu en es dans
les notes du chantier ou dans `dev_log` avant de lâcher. Une session qui se
termine sans avoir écrit son état fait perdre des heures à la suivante.

**Et si c'est du travail à faire, ça devient un CHANTIER — pas une note.**
Consigne explicite de Raphaël le 3 sept. 2026 : tout ce que tu n'as pas pu
avancer, tout ce qui attend une décision de lui, et tout bug que tu découvres
sans le corriger, doit exister comme une ligne de `dev_items` ouverte. Une
trouvaille écrite seulement dans `dev_log` est perdue dès qu'une douzaine de
messages passent — le hook de démarrage n'en injecte que les douze derniers.
Enfouie dans les notes d'un autre chantier, elle disparaît quand celui-ci est
archivé.

Écris le chantier de façon **autoportante** : ce que Raphaël a déjà répondu,
ce qui a déjà été vérifié (et ce qui a été écarté, pour qu'on ne le
repropose pas), le fichier concerné, et le marqueur `[LIBRE]` ou
`[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]`. Un chantier ombrelle du type
« améliorer X » qui a réellement livré son travail se referme au profit des
chantiers concrets qu'il a produits, en les nommant dans sa note d'archivage.

Si le chantier touche à un sujet sensible ou irréversible (accès aux
applications du téléphone, contrôle du téléphone, envoi de messages,
clonage vocal via un service tiers payant), ne pas l'implémenter sans en
discuter d'abord avec Raphaël — même s'il est dans le cockpit en statut
"todo" (conforme à la règle de son CLAUDE.md global sur les actions à fort
enjeu).

## Les sections de chantiers (migration 0018) et le registre des erreurs (0019)

Livrés ensemble le 4 sept. 2026 (chantiers 3e880467, dce4415e, 033a41da,
f2f6667f, 41816bdc) : le cockpit se range, se filtre, et garde ce que Jarvis
rate.

### Le rattachement reste `dev_items.theme`. Ne change pas ça.

`theme` est du texte libre, et c'est ce que TOUT le projet lit : le hook de
démarrage, la commande vocale, les scripts SQL, les autres sessions. La table
`dev_sections` ne porte que ce que le texte libre ne sait pas porter — exister
sans chantier (« Entraînement » créée avant d'avoir quoi que ce soit à y
mettre), avoir un ordre, une description. En faire une clé étrangère casserait
tout le reste pour rien.

Les deux sont tenus alignés par des fonctions SQL, **jamais par deux écritures
côté app** : `renommer_section(id, nom)` renomme la section ET le thème de tous
ses chantiers, `fusionner_sections(source, cible)` déplace puis supprime,
`supprimer_section(id, vers)` déplace vers une autre section ou rend les
chantiers à « À classer » — **jamais de suppression en cascade**, une section
est un rangement, pas un contenant. `reordonner_sections(ids[])` pose l'ordre
d'un coup. Si l'une des deux moitiés passait sans l'autre, le cockpit
afficherait une section vide à côté de chantiers orphelins, et personne ne le
verrait sur le moment.

`cle_section(nom)` en SQL reprend mot pour mot `cleTheme()` de
`src/lib/themeChantier.ts` : accents, apostrophes, tirets et majuscules ne
distinguent pas deux sections. Changer l'une, c'est changer l'autre.

L'ordre choisi par Raphaël est aussi celui du bloc injecté au démarrage de
session (le hook joint `dev_sections` sur cette clé) : ce qu'il voit dans l'app
et ce que tu lis en ouvrant une session sont rangés pareil.

### Le registre des erreurs : ce qui y arrive tout seul, et ce qui n'y arrive pas

`jarvis_erreurs` + la fonction `signaler_erreur(categorie, titre, detail,
contexte, source)`, appelée depuis `src/lib/erreurs.ts` — jamais en direct.
Trois branchements sont déjà posés, et ils suffisent à couvrir les échecs
techniques :

- `withErrorToast` (`src/lib/notifyError.ts`) : **toutes** les écritures de
  l'app y passent. C'est le seul endroit à brancher, pas chaque hook.
- `noterEcoute` (`src/lib/journalEcoute.ts`) : les échecs Live, les refus du
  serveur vocal et les rafales de micro qui finissent sans rien avoir entendu.
  La table de correspondance est `erreurDepuisEcoute()`, vérifiable sans réseau.
- La saisie manuelle, depuis le cockpit : c'est elle qui compte le plus, parce
  qu'une erreur de COMPRÉHENSION ne lève aucune exception et que seul Raphaël
  peut la voir.

Deux règles à ne pas défaire :

1. **`signalerErreur` ne doit jamais faire échouer ce qu'elle observe.** Pas
   d'`await` chez l'appelant, client Supabase chargé paresseusement (le banc
   d'essai du micro monte le moteur d'écoute sans configuration Supabase),
   erreurs avalées.
2. **L'empreinte n'est pas recalculée quand Raphaël retouche un titre.** Elle
   reste celle du signalement automatique, pour que la prochaine occurrence
   vienne se ranger sur la même ligne au lieu d'en ouvrir une seconde. Une
   erreur corrigée qui revient rouvre toute seule (`reapparue_at`).

Les corrections écrites dans le registre remontent dans le bloc injecté au
démarrage de chaque session : c'est par là qu'elles servent à corriger.

### Les actions groupées et le « Annuler »

Le bouton « Choisir » du cockpit passe le tableau en mode sélection : tout se
déplie (on ne coche pas ce qu'on ne voit pas), chaque ligne porte une case, et
une barre collée en bas agit sur le lot — statut, section, archivage,
suppression.

Deux règles :

- **Une requête par lot, jamais une par chantier** (`updateManyDevItems`,
  `archiveManyDevItems`, `deleteManyDevItems`, qui passent tous par `.in("id",
  ids)`). Vingt allers-retours pour reclasser un thème laisseraient le travail
  à moitié fait si la connexion lâche au milieu.
- **Chaque action groupée mémorise l'état d'avant et propose « Annuler »**
  (`src/lib/annulation.ts`, huit secondes). `restoreDevItems` regroupe les
  chantiers par état d'origine et envoie une requête par groupe : un lot
  mélange des chantiers qui n'avaient ni le même statut ni la même section, et
  leur rendre une valeur commune serait pire que ne rien annuler. Un `upsert`
  serait plus court et faux — PostgreSQL construit d'abord la ligne à insérer
  et la refuserait faute de titre.

### La section suggérée à la saisie (`src/lib/suggestionTheme.ts`)

Calcul **local**, jamais un appel au modèle : ranger un chantier n'a pas à
consommer le quota gratuit qui a déjà laissé Raphaël sans Jarvis le 3 sept. La
suggestion s'appuie sur le vocabulaire des chantiers déjà rangés, elle affiche
les mots sur lesquels elle s'appuie, et **elle se tait quand rien ne se
détache** — une suggestion fausse est acceptée sans être relue, donc elle coûte
plus cher qu'une absence de suggestion.

## Les prompts des sessions parallèles

Quand Raphaël ouvre plusieurs sessions d'un coup, une par thème, les prompts
qu'il colle et le découpage des fichiers qui évite les collisions sont dans
`docs/prompts-sessions.md`. Si tu ouvres un nouveau front, mets ce fichier à
jour dans le même commit.

## Travail en parallèle : réserver un chantier et se parler

Plusieurs sessions Claude Code travaillent souvent sur ce repo en même temps.
Deux règles évitent qu'elles se marchent dessus ou qu'elles s'attendent.

**Avant de toucher à un chantier, le réserver.** La prise est atomique : si
deux sessions appellent en même temps, une seule obtient `true`.

```bash
scripts/sql.sh "select claim_dev_item('<id du chantier>', '<nom de ta branche>', 120)"
```

`false` = une autre session est déjà dessus, prends-en un autre. La réservation
expire après le délai en minutes, pour qu'une session interrompue ne bloque
rien ; renouvelle l'appel si tu dépasses. Quand tu t'arrêtes ou que tu
termines :

```bash
scripts/sql.sh "select release_dev_item('<id>', '<ta branche>')"
```

Utilise **le nom de ta branche** comme identifiant de session : c'est ce que
Raphaël voit dans le cockpit, sur le chantier, sous la forme « Prise par … ».

**Deux marqueurs en tête des notes commandent le comportement :**

- `[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]` — ne pas coder. Raphaël veut en
  discuter d'abord pour trancher une bonne fois (coût, accès, périmètre) plutôt
  que de revenir dessus plusieurs fois.
- `[LIBRE]` — spécifié de bout en bout, aucune décision ni accès à obtenir :
  à prendre sans rien demander.

**Pour parler à une autre session**, écris dans `dev_log` — elle le lira à son
prochain passage, même si elle est arrêtée maintenant :

```bash
scripts/sql.sh "insert into dev_log (user_id, item_id, author, kind, body) select user_id, null, '<ta branche>', 'question', 'Tu es toujours sur X ? Je voudrais toucher a Y.' from dev_items limit 1"
```

(le `select ... from dev_items limit 1` évite d'avoir à connaître le `user_id`
en dur ; mets l'id du chantier concerné à la place du `null` s'il y en a un)

**Piège, vérifié à ses dépens le 3 sept. 2026 :** ce `limit 1` porte sur le
résultat entier, pas sur le `user_id`. Il ne convient donc QU'À une insertion
d'une seule ligne. Pour en insérer plusieurs d'un coup — `insert … select …
from (values …)` — il ne laisse passer que la première, **sans aucune erreur** :
on croit avoir créé six chantiers, il y en a un. Écris alors le `user_id` en
sous-requête scalaire, et pas de `limit` du tout :

```sql
insert into dev_items (user_id, title, notes, status, priority, theme)
select (select user_id from dev_items limit 1), v.title, v.notes, 'todo', v.priority, v.theme
from (values ('Titre A', 'Notes A', 'normal', 'Thème'),
             ('Titre B', 'Notes B', 'high',   'Thème')) as v(title, notes, priority, theme);
```

Et relis toujours ce que tu viens d'écrire dans un appel séparé : `exec_sql`
ne renvoie pas le nombre de lignes touchées.

Autre facilité pour du texte long : `scripts/sql.sh` lit aussi son SQL sur
l'entrée standard (`scripts/sql.sh < requete.sql`). Une note de chantier avec
des apostrophes, des guillemets et des retours à la ligne passe ainsi sans
bataille d'échappement — et les délimiteurs `$n$ … $n$` de Postgres évitent
d'avoir à doubler les apostrophes.

`kind` vaut `question`, `reponse`, `info` ou `blocage`. Renseigne `answered_at`
quand tu réponds à une question. Le journal est visible dans l'app, en bas du
cockpit : Raphaël y écrit aussi ses consignes, **lis-le en début de session**
en même temps que les chantiers.

**Ne prends pas un gros lot d'un coup.** Réserve ce que tu traites maintenant
et laisse le reste libre, pour qu'une autre session puisse avancer en
parallèle au lieu d'attendre après toi.

## Plusieurs questions à Raphaël : une fiche, pas un mur de texte

Dès que tu as **plus de deux ou trois questions** à lui poser, ne les empile pas
dans un message : publie un **artefact** qu'il remplit au pouce. Il travaille
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

Les deux premières servent aussi de modèle : catalogue oui/non, et décisions à
options. Si tu publies une nouvelle fiche, **ajoute son URL à cette liste** dans
le même commit — sinon elle sera perdue pour les sessions suivantes.

## Le moteur : Gemini, offre gratuite — et pourquoi

Décision de Raphaël du 3 sept. 2026, à ne pas rouvrir : Jarvis tournait sur
Claude via l'API Anthropic, facturée au jeton, et il l'a découvert en voyant
sa clé à sec. Il a choisi l'offre gratuite de l'API Gemini, en connaissance
du compromis (Google se réserve d'utiliser les contenus de l'offre gratuite
pour améliorer ses produits, relecture humaine comprise). Les options
écartées : Haiku 4.5 (moitié prix, privé), rester sur Sonnet 5.

Tout ce qui est propre à Gemini vit dans `supabase/functions/_shared/gemini.ts`
— un seul endroit pour la forme de la requête, les erreurs et les nouveaux
essais. `index.ts` et `memoire.ts` ne font qu'appeler `appelerGemini()`.
Les phrases d'erreur y sont alignées mot pour mot avec
`src/lib/erreurServeurVocal.ts` : changer l'une, c'est changer l'autre.

Le coût, même à zéro, se surveille : la limite de l'offre gratuite se compte
en requêtes et en jetons par minute, et chaque phrase envoie ~45 000
caractères (consignes 8 000 + schéma d'outil 17 800 + contexte). La ligne
`coût` dans les journaux de la fonction donne la consommation réelle de
chaque appel. Les archivés du cockpit sont plafonnés à 15 côté client
(`chantiersPourLeModele` dans `MicButton.tsx`) : avant, les 83 chantiers
partaient en entier à chaque phrase, et ça grossissait à chaque chantier
livré.

### Un modèle Gemini meurt sans prévenir — vérifie-le par un vrai appel

Le 4 sept. 2026, les **trois** modèles sur lesquels Jarvis tournait sont
tombés le même jour : `gemini-3.5-flash-lite` (le principal) en 503 « This
model is currently experiencing high demand », `gemini-2.5-flash` (le secours)
et `gemini-2.5-flash-lite` (la mémoire) en 404 « no longer available to new
users ». Raphaël n'avait plus de Jarvis, et la mémorisation échouait en
silence — c'est sa nature, elle ne dérange jamais l'utilisateur, donc personne
ne l'aurait vu.

**`ListModels` n'est PAS une autorisation.** Les deux clés du projet
annoncent toujours `gemini-2.5-flash`, et `generateContent` le refuse. Un
secours écrit d'après cette liste — ou de mémoire, ou d'après la
documentation — ne se voit qu'en panne, chez Raphaël. Avant d'écrire un nom de
modèle dans le code, **fais un vrai appel `generateContent` avec la clé
concernée** ; une fonction jetable de dix lignes déployée puis supprimée suffit
(et garde la clé côté Supabase, là où le classificateur de permissions ne
bloque pas — il refuse toute commande shell qui porte un secret en clair).

Les cinq seaux en place, chacun essayé pour de vrai avant d'être écrit :
commande — principal `gemini-3.1-flash-lite`, secours `gemini-3.5-flash` puis
`gemini-3.6-flash` ; mémoire — principal `gemini-3.5-flash-lite`, secours
`gemini-3.7-flash`. La mémoire ne touche JAMAIS aux modèles de la commande :
c'est ce qui a rendu Jarvis muet le 3 sept.

### Un modèle peut aussi être plafonné à vingt requêtes par jour

Découvert le 4 sept. 2026 en essayant de vérifier le dédoublonnage : la
mémoire n'écrivait plus rien, et les journaux disaient pourquoi —
`quota {"modele":"gemini-3.7-flash","id":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","limite":"20"}`.
Vingt mémorisations par jour et par projet, puis plus rien, **en silence**, la
mémoire étant muette par construction. Personne ne l'aurait vu.

Un modèle qui répond n'est donc pas un modèle utilisable : regarde la ligne
`quota` des journaux de la fonction après un vrai essai, elle donne le plafond
réel. Un `flash` n'a pas du tout le même plafond qu'un `flash-lite` — c'est ce
qui a fait remettre la mémoire sur `gemini-3.5-flash-lite`.

Et dans `_shared/gemini.ts`, `STATUTS_CHANGER_DE_MODELE` vaut **404, 429, 503**
— trois façons de dire « ce modèle-là ne répond pas », toutes les trois
réglées en passant au suivant, jamais en insistant. Le 503 y a été ajouté ce
jour-là : on rejouait trois fois le modèle saturé puis on abandonnait sans
jamais essayer les secours, qui eux répondaient.

### Les vérifications ne puisent plus dans le quota de Raphaël

`scripts/verifier-commande-vocale.mjs` pose l'en-tête `x-jarvis-essai: 1`, et
`voice-command` lit alors le secret `GEMINI_API_KEY_TEST` — la clé d'un SECOND
projet Google AI Studio, parce que le plafond gratuit se compte PAR PROJET.
C'est ce qui a laissé Raphaël sans Jarvis le 3 sept. à 21h28 : quatre sessions
avaient vidé le quota du jour avec leurs contrôles. Ne retire pas cet
en-tête ; la ligne `clé` des journaux dit lequel des deux seaux a servi.

Le mode Live (`live-jeton`) n'a pas encore ce branchement : ses vérifications
puisent toujours chez lui. C'est le chantier `9ad79fbf`.

**Une variable d'environnement de l'environnement Claude Code n'arrive
jamais dans une session déjà ouverte** : elles sont figées au démarrage du
conteneur. Et le chemin `pousser-secret.sh` n'a jamais fonctionné chez
Raphaël — ses clés n'apparaissent dans aucun de ses quatre environnements.
Le chemin qui marche, vérifié : il pose lui-même le secret dans le tableau de
bord Supabase (*Project Settings* → *Edge Functions* → *Edge Function
Secrets*). Ne lui demande pas de coller une clé dans la conversation : le
classificateur de permissions refusera ensuite toute commande qui la porte,
et elle aura été exposée pour rien.

### Une clé d'API se pousse par `scripts/pousser-secret.sh`, jamais autrement

```bash
scripts/pousser-secret.sh GEMINI_API_KEY
```

Raphaël dépose la clé dans les variables d'environnement de l'environnement
Claude Code ; le script la lit là et l'envoie aux secrets Supabase par l'API,
sans jamais l'afficher. Ne lui demande **jamais** de coller une clé dans la
conversation, et n'utilise pas l'outil MCP pour ça.

## Déployer une Edge Function : `scripts/deployer-fonction.sh`

```bash
scripts/deployer-fonction.sh voice-command
```

Il lit les fichiers sur le disque et les envoie à l'API Supabase. Il embarque
tout seul les fichiers voisins (`memoire.ts`) et le dossier `_shared/` quand
la fonction s'en sert, et il relit puis **conserve le réglage `verify_jwt`
existant** — `google-oauth` doit rester ouvert pour recevoir la redirection de
Google, qui ne porte aucun jeton ; le refermer casserait la connexion du
compte Google. **Il exige `SUPABASE_ACCESS_TOKEN`** (jeton personnel, https://supabase.com/dashboard/account/tokens,
à mettre dans les variables d'environnement de l'environnement cloud — jamais
dans le dépôt). Tant qu'elle manque, le script le dit et s'arrête.

Sans ce jeton, le seul chemin est l'outil MCP `deploy_edge_function`, qui
n'accepte le contenu **qu'en clair, recopié à la main dans l'appel**. Pour
`voice-command` cela veut dire retranscrire 35 Ko de code écrit par d'autres
sessions, à la virgule près, à chaque déploiement : une erreur de recopie ou
une troncature met l'assistant hors service, et la corriger demande de tout
retranscrire une seconde fois. **Ne fais pas ça.** Si le jeton manque, dis-le
et laisse le déploiement en attente plutôt que de recopier le fichier.

## La Edge Function `voice-command` ne se déploie PAS au push

Le site web se republie à chaque push, la Edge Function non : il faut la
redéployer explicitement (outil MCP `mcp__Supabase__deploy_edge_function`,
projet `bexiyvmdbxcwxasgslxp`, fonction `voice-command`, avec `index.ts` ET
`memoire.ts`). Un chantier qui touche `supabase/functions/voice-command/`
n'est donc pas fini une fois la CI verte.

Et un typecheck ne dit rien de ce qui compte ici : est-ce que le modèle suit
encore la consigne. Après chaque déploiement :

```bash
ANON_KEY=... node scripts/verifier-commande-vocale.mjs
```

Dix contrôles bout-en-bout sur la fonction réellement déployée, avec un
utilisateur de test éphémère créé puis supprimé. La clé publique se récupère
avec `mcp__Supabase__get_publishable_keys` (elle part déjà dans le bundle du
site, ce n'est pas un secret — la clé de service, si).

## Le prototype « Mode conversation Live » (4 sept. 2026)

Décision de Raphaël : deux pistes en parallèle. (1) Le micro fait main
(`useSpeechRecognition` + `dialogueTour` + `veille`), qui passe par le service
de reconnaissance du téléphone — patché pour préférer le service Google, qui
ne bipe pas (`patches/@capacitor-community+speech-recognition+7.0.1.patch`,
appliqué par `postinstall` via patch-package, y compris en CI). (2) Gemini
Live : l'app envoie l'audio en continu par WebSocket, Google gère la détection
de voix, la fin de tour, l'interruption et la transcription. Derrière la case
« Mode conversation Live (essai) » sous le cœur ; désactivé par défaut.

- La clé ne quitte jamais le serveur : `supabase/functions/live-jeton` rend un
  jeton éphémère à usage unique (SDK `npm:@google/genai`, API `v1alpha`),
  verrouillé sur le modèle `GEMINI_MODELE_LIVE` (défaut
  `gemini-2.5-flash-native-audio-preview-12-2025`, gratuit). `verify_jwt` reste
  à true : il faut être connecté.
- **La configuration de la session (consigne, outil, contexte, audio) vit
  DANS le jeton**, côté serveur. Vérifié le 4 sept. avec
  `verifier-live-contexte.mjs` : avec un jeton éphémère, Google IGNORE la
  configuration envoyée par l'app à la connexion — Jarvis disait « je n'ai
  pas accès à tes tâches » alors que l'app les lui donnait. L'app envoie son
  contexte (tâches, chantiers, contacts, date) dans le corps de la requête à
  `live-jeton`, et se connecte avec une configuration vide. Ne remets jamais
  de `systemInstruction` côté app : elle serait perdue en silence.
- Côté app : `src/lib/live/` (audio, session). Le modèle Live ne connaît qu'un
  outil, `commande_jarvis`, qui repasse par `resolveTranscript` +
  `executerActions` de `MicButton` — une seule source de vérité pour les
  actions. Raphaël clôt à la voix (« terminé », « fin de transmission »,
  « au revoir »… : `src/lib/live/finConversation.ts`) ; c'est l'app qui
  reconnaît la formule, pas le modèle, et la phrase entière doit être un
  adieu — « termine le chantier X » reste une commande.
- **Dans `MicButton`, tout ce qu'un effet lance passe par `derniersRef`**,
  jamais par un appel direct. La boucle de veille vit dans un effet monté
  une fois : elle gardait `demarrerLive` du premier rendu, où les tâches
  n'étaient pas encore chargées, et « Jarvis, quelles sont mes tâches ? »
  répondait « Aucune tâche trouvée » avec dix-neuf tâches en base (4 sept.,
  en Live comme en classique — un appui sur le cœur, lui, voyait tout). Le
  banc du cœur de `verifier-ecoute-web.mjs` monte le vrai `MicButton` avec
  des tâches chargées après le montage et rejoue exactement ce cas.
- Vérification : `ANON_KEY=... node scripts/verifier-live-jeton.mjs` (fonction
  déployée, utilisateur de test éphémère). Le comportement audio réel ne se
  vérifie que sur un appareil ; `journal_ecoute` trace `live_debut`,
  `live_commande`, `live_echec`, `live_fin`.

**Piège du build local** : sans `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`,
`src/lib/supabase.ts` lève au chargement et le bundler jette TOUTE l'app comme
code mort — le bundle fait 258 ko et ne contient rien. Pour un vrai build
local : `VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build`.
La CI a les vraies valeurs. Et le typecheck qui compte est celui de la CI,
`npx tsc -b` (les projets référencés, dont `tsconfig.app.json`) — un
`npx tsc --noEmit` à la racine ne vérifie PAS l'app et dit « OK » à tort
(constaté le 4 sept. : CI rouge sur une erreur qu'il n'avait pas vue).

## La mémoire longue durée : ce qu'elle retient, et ce qu'elle ne redit pas deux fois

Trois pièces, toutes dans `supabase/functions/voice-command/` :

- `memoire.ts` — l'extraction des faits, le rappel, et l'écriture.
- `dedoublonnage.ts` — la DÉCISION : ce fait existe-t-il déjà ? Sans dépendance
  Deno, exprès, pour se vérifier sous Node hors ligne.
- migrations `0006_memoire_longue_duree.sql` (souvenirs) et
  `0018_echanges_recherche.sql` (recherche dans le mot-à-mot).

**Deux mesures, jamais une seule, pour dire « c'est le même fait ».** Mesuré le
4 sept. 2026 sur les 21 souvenirs réels de Raphaël, toutes les paires : avec
gte-small, deux phrases françaises sans le moindre rapport (« Raphaël est
marié » / « une boutique appelée Fripouille à Hipouy ») sont à **0,907** de
proximité. Un seuil cosinus seul, assez haut pour être sûr, ne dédoublonnerait
plus rien. Les seuils retenus — proximité ≥ 0,95 **ET** recouvrement lexical
≥ 0,40 — laissent une marge des deux côtés : vrais doublons à 0,958-0,978 /
0,44-0,50, faux ami le plus proche à 0,938 / 0,33. `verifier-dedoublonnage.ts`
protège cette marge ; ne la resserre pas sans refaire la mesure.

**Ne fusionne jamais deux sujets qui se ressemblent.** Le garde-fou des noms
propres (`nomsPropres`) empêche « villa Dan » et « villa Ben » de n'en faire
qu'une, même à 0,995 de proximité. Un nom propre présent d'un seul côté n'est
qu'une précision et fusionne ; deux noms propres mutuellement exclusifs, non.

**Un chiffre qui change n'est pas un doublon.** L'ancien souvenir est marqué
`perime_at`, jamais effacé : Jarvis doit pouvoir dire « avant c'était 4 000, tu
m'as dit 4 500 depuis ». Rien n'est jamais supprimé par la mémoire — l'onglet
Mémoire montre les périmés barrés, avec un bouton pour les réactiver.

Le rattrapage sur l'existant se relance à volonté, et ne périme que des
doublons (aucun `delete`) :

```bash
node --experimental-strip-types scripts/nettoyer-souvenirs.ts             # montre
node --experimental-strip-types scripts/nettoyer-souvenirs.ts --appliquer # écrit
```

**Retrouver une conversation, pas seulement un fait.** Depuis la migration
0018, `echanges` porte une empreinte et `chercher_echanges()` cherche dedans
par le sens : « on avait parlé de quoi pour la villa Dan ? » trouve enfin sa
réponse. Le seuil y est plus haut (0,75) que pour les souvenirs, pour la même
raison qu'au-dessus. La purge à sept jours ne bouge pas, c'est le choix de
Raphaël. Les échanges antérieurs reçoivent leur empreinte tout seuls, quelques
lignes à chaque phrase (`rattraperEmpreintes`) — pas de script à lancer.

## Ce que Jarvis sait de sa propre application

`supabase/functions/_shared/environnement.ts` — **une seule source**, importée
par `voice-command` ET `live-jeton`. Raphaël, 4 sept. : « où est la fenêtre de
question où je dois répondre ? » → « je n'ai pas accès à l'interface de
l'application ».

**Quand un onglet, une carte de Paramètres ou une section du cockpit change de
nom, apparaît ou disparaît, corrige ce fichier dans le même travail**, et
redéploie les deux fonctions — sinon Jarvis envoie Raphaël vers un bouton qui
n'existe plus. Quatre contrôles de `verifier-commande-vocale.mjs` (« il sait
où… ») disent si le texte arrive bien jusqu'au modèle.

## Les vérifications du dépôt

Une seule méthode canonique par sujet, à relancer plutôt qu'à réinventer :

```bash
ANON_KEY=... node scripts/verifier-commande-vocale.mjs   # la Edge Function déployée
ANON_KEY=... node scripts/verifier-donnees.mjs           # temps réel + réglages, RLS comprise
node --experimental-strip-types scripts/verifier-dialogue.ts   # tours de parole, sans réseau
node --experimental-strip-types scripts/verifier-mot-cle.ts    # réveil « Jarvis », sans réseau
node --experimental-strip-types scripts/verifier-commande-locale.ts  # commandes comprises sans modèle
node scripts/verifier-ecoute-web.mjs                     # moteur d'écoute + banc du cœur (vrai MicButton), vrai navigateur
node --experimental-strip-types scripts/verifier-fin-conversation.ts  # « terminé » ferme le Live, « termine le chantier » non
node --experimental-strip-types scripts/verifier-envoi-chantier.ts  # « Envoyer à Claude Code », sans réseau
node --experimental-strip-types scripts/verifier-echeance.ts    # l'étiquette d'échéance d'une tâche, sans réseau
node --experimental-strip-types scripts/verifier-theme.ts       # pas deux thèmes pour le même sujet, sans réseau
node --experimental-strip-types scripts/verifier-dedoublonnage.ts   # la mémoire ne réécrit pas trois fois la même chose, sans réseau
ANON_KEY=... node scripts/verifier-memoire.mjs           # la mémoire de bout en bout : dédoublonnage réel + retrouver une conversation
node scripts/verifier-memoire-web.mjs                    # « Vos conversations » parcourue dans un vrai navigateur, en écran de téléphone
node --experimental-strip-types scripts/verifier-notifications.ts   # ce que Jarvis fera sonner, et quand, sans réseau
node --experimental-strip-types scripts/verifier-maj-web.ts      # la mise à jour rapide : paquet, chemins, verdict, sans réseau
node --experimental-strip-types scripts/verifier-reglages.ts     # toute préférence est déclarée ET réglable, sans réseau
node --experimental-strip-types scripts/verifier-sections.ts    # groupement, ordre, compteurs et filtre du cockpit, sans réseau
node --experimental-strip-types scripts/verifier-suggestion-theme.ts  # la section suggérée à la saisie, sans réseau
node scripts/verifier-cockpit-web.mjs                    # le cockpit parcouru dans un vrai navigateur, en écran de téléphone
node scripts/verifier-reglages-web.mjs                   # les réglages parcourus dans un vrai navigateur, en écran de téléphone
ANON_KEY=... node scripts/verifier-sections-erreurs.mjs  # sections + registre des erreurs : fonctions SQL et cloisonnement RLS
ANON_KEY=... node scripts/verifier-connexion-google.mjs  # le branchement Google, avant de le proposer
node --experimental-strip-types scripts/verifier-agenda-google.mjs  # l'agenda, sur le compte réellement branché
ANON_KEY=... node --experimental-strip-types scripts/verifier-gmail.mjs  # Gmail : encodage, lecture réelle, garde-fou d'envoi
ANON_KEY=... node scripts/verifier-messages-programmes.mjs  # messages programmés : cycle + cloisonnement RLS
ANON_KEY=... node scripts/verifier-live-jeton.mjs        # le jeton du mode conversation Live
ANON_KEY=... node scripts/verifier-live-contexte.mjs     # le modèle Live reçoit bien consigne et contexte (vraie session)
```

`verifier-donnees.mjs` couvre ce qui casse en silence : un abonnement temps
réel qui annonce « SUBSCRIBED » et ne reçoit jamais rien (jeton utilisateur
absent → RLS refuse sans le dire), et les réglages qui ne remonteraient pas
en base. Piège à connaître si tu écris un script du même genre : « SUBSCRIBED »
ne veut pas dire que le serveur diffuse déjà — le tout premier canal d'une
connexion neuve rate une écriture faite dans la seconde qui suit.

`verifier-connexion-google.mjs` couvre le piège qui a bloqué Raphaël le
3 sept. 2026 : l'adresse de retour envoyée à Google doit être identique au
caractère près à celle enregistrée dans le client OAuth, sinon Google refuse
d'afficher l'écran d'autorisation (« Erreur 400 : redirect_uri_mismatch »).
Le script suit vraiment l'URL produite par `/start` et vérifie que Google
l'accepte — un contrôle sur le seul contenu de l'URL ne l'aurait pas vu.
**À relancer après tout déploiement de `google-oauth`**, avant de dire à
Raphaël d'essayer : c'est lui qui se prend l'erreur sinon.

## Gmail : Jarvis prépare, Raphaël valide, et seulement ensuite ça part

Un e-mail part vers l'extérieur **en son nom**. La Edge Function `google-gmail`
sépare donc `preparer` (qui rend le brouillon, sans rien envoyer) et `envoyer`
(qui exige `confirme: true`). Le garde-fou est placé **avant** la lecture du
jeton Google, pour qu'un envoi non confirmé soit refusé sans qu'on ait seulement
approché Gmail — et pour rester vérifiable sans compte branché.

**Ne refonds jamais ces deux actions en une, et ne pose jamais `confirme: true`
par défaut côté app.** Ce drapeau atteste d'une validation que Raphaël a
réellement dite. `scripts/verifier-gmail.mjs` le vérifie sur la fonction
déployée : si ce contrôle vire au rouge, un e-mail peut partir sans son accord.

Le reste des actions : `list` (syntaxe de recherche Gmail), `read` (corps
lisible, citations du fil retirées, pièces jointes listées, marqué lu),
`piece_jointe` (récupère un document reçu, plafonné à 8 Mo). L'encodage MIME
vit dans `google-gmail/message.ts`, sans dépendance Deno pour être testable
sous Node — ses erreurs sont silencieuses (objet accentué en charabia, réponse
qui crée un fil neuf faute d'`In-Reply-To`), d'où les contrôles hors ligne.

La portée `gmail.modify` couvre la lecture, l'envoi et les pièces jointes :
aucune portée supplémentaire à demander à Raphaël.

### Un reçu au bout d'un lien : `document_lien`, et pourquoi il est gardé

Beaucoup de fournisseurs n'envoient pas le PDF, ils envoient une adresse (« ils
m'envoient un SMS avec la facture dans le lien »). L'action `document_lien` va
la chercher — mais **cette adresse vient d'un e-mail, donc d'un inconnu**.
Sans garde-fou, c'est un client HTTP offert à qui veut, à l'intérieur de notre
infrastructure, et rien ne se verrait à l'usage.

`google-gmail/lien.ts` impose donc : https seul, aucune adresse interne
(boucle locale, réseaux privés, et `169.254.169.254`, l'adresse des métadonnées
de l'hébergeur), redirections suivies **à la main et revalidées une par une**
— une adresse publique peut rediriger vers l'intérieur —, taille plafonnée à
8 Mo, et seuls un PDF ou une image acceptés en retour. **Ne relâche aucun de
ces contrôles** ; `scripts/verifier-gmail.mjs` les vérifie tous hors ligne.

### Les messages programmés (`messages_programmes`, migration 0017)

La table ne sait pas envoyer, et ne doit jamais le savoir : décision de Raphaël
du 3 sept., on reste sur le téléphone et rien ne part sans qu'il appuie. D'où
`statut`, où **« annoncé » est distinct de « envoyé »** — un message que Jarvis
a présenté sans réponse ne doit pas disparaître de sa liste comme s'il était
parti. `canal` reste `null` tant qu'il n'a pas dit WhatsApp ou SMS.
Client : `src/lib/messagesProgrammes.ts`.

## Requêtes SQL : passer par `scripts/sql.sh`, pas par l'outil MCP

**N'utilise pas `mcp__Supabase__execute_sql`.** Le serveur MCP Supabase marque
cet outil « exige une interaction humaine » : le pop-up de validation s'affiche
à **chaque** appel, même en mode `auto`, même en `bypassPermissions`, aucune
règle d'autorisation ne le saute et il n'offre jamais « ne plus demander ».
Raphaël travaille depuis son téléphone et ne veut plus cliquer. Ne perds pas de
temps à chercher un réglage qui l'enlèverait : il n'existe pas, ça a déjà été
cherché (3 sept. 2026).

À la place :

```bash
scripts/sql.sh "select id, title, status from dev_items where archived_at is null;"
```

Le script appelle la fonction `public.exec_sql` (migration `0010_exec_sql.sql`)
via l'API HTTPS, avec la clé `SUPABASE_SERVICE_ROLE_KEY` fournie par
l'environnement cloud. Il passe par Bash, donc sans validation. Il renvoie du
JSON (`ok`, `rows`) et sort en code non nul si le SQL a échoué.

**Cette clé donne un accès total à la base**, DDL et suppressions comprises,
sans que Raphaël voie rien passer. C'est son choix explicite, en connaissance
du risque. En contrepartie la règle ci-dessous n'est pas négociable :
**demande-lui toujours avant un `drop`, un `delete` massif ou un `truncate`.**
Le garde-fou, c'est nous.

Si `SUPABASE_SERVICE_ROLE_KEY` est absente, le script le dit et s'arrête :
repasse alors par l'outil MCP (avec le pop-up), et préviens Raphaël que la
variable manque dans son environnement.

Pour le DDL, écris une migration numérotée dans `supabase/migrations/` — le
dépôt reste la source de vérité — puis applique-la avec `scripts/sql.sh`.

**Une seule instruction par appel quand tu attends un résultat.** `exec_sql`
enveloppe la requête pour en récupérer les lignes en JSON ; une enveloppe ne
peut contenir qu'une instruction. Si tu en mets plusieurs séparées par `;`,
elles **s'exécutent bien, mais tu ne récupères aucune ligne** — la réponse
contient `"rows": null`. Le piège est silencieux : tu croirais que la table
est vide alors qu'elle ne l'est pas. Ne groupe donc jamais deux `select`, ni
un `update` et son `select` de vérification, dans le même appel.

Puisqu'il n'y a plus de pop-up, enchaîner les appels ne coûte plus rien :

```bash
scripts/sql.sh "update dev_items set status = 'done' where id = '...';"
scripts/sql.sh "select id, status from dev_items where id = '...';"
```

**Grouper reste bon pour les écritures**, dont on n'attend pas de lignes :
plusieurs `update`/`insert` liés, ou une structure complète (table + index +
policies RLS + trigger). Fais juste la vérification dans un appel séparé.
**Sans `begin; … commit;`** : `exec_sql` refuse les commandes de transaction
(« EXECUTE of transaction commands is not implemented », constaté le
4 sept.) — et de toute façon un appel est déjà exécuté d'un bloc.

Et dans tous les cas, ne fais pas un appel par ligne à mettre à jour :
`where id in (...)`, `update ... from (values ...)` ou des `case when`.

## Réglages personnels : une clé de plus se déclare

Tout ce que Raphaël enregistre (tâches, chantiers, documents, contacts,
rappels, souvenirs, prononciations) vit en base et ne peut pas être perdu par
une mise à jour de l'app. Ses **réglages**, eux, vivaient dans le seul
`localStorage` du téléphone : préservés par une mise à jour normale de l'APK,
mais effacés par une réinstallation ou un nettoyage des données — l'image du
réacteur qu'il a importée comprise.

Depuis le 3 sept. 2026, ils sont recopiés dans la table `reglages`
(migration 0014) et restaurés à la connexion. **Si tu ajoutes une préférence
stockée en local, déclare-la dans `REGLAGES` (`src/lib/reglages.ts`) et
écris-la avec `ecrireReglage()`** — sinon elle ne remontera jamais en base et
sera perdue à la prochaine réinstallation, en silence.

Depuis le 4 sept., cette déclaration porte aussi **où le réglage se règle**
(`ou`) et **le fichier qui porte ce contrôle** (`fichier`) : les deux moitiés
de la règle sont donc écrites au même endroit. Une clé qui doit rester locale
va dans `STOCKAGE_LOCAL_ASSUME`, avec la raison.

Et ce n'est plus une règle de bonne volonté :
`scripts/verifier-reglages.ts` lit le code et refuse toute clé de stockage
local `jarvis_…` qui ne serait ni déclarée ni assumée comme locale. C'est ce
contrôle qui a trouvé `jarvis_app_ia` (l'application à qui poser une
question), fixée une seule fois à l'oral, invisible dans Paramètres et perdue
à chaque réinstallation — malgré la règle écrite partout depuis la veille.

Règle de résolution : à la connexion, la base gagne ; ensuite toute
modification locale y est poussée dans la seconde.

### Et une préférence se règle depuis Paramètres, pas depuis le code

Consigne de Raphaël, 3 sept. 2026 : **toute fonctionnalité qui introduit une
préférence livre son réglage avec elle, dans le même travail.** Il ne veut pas
avoir à demander qu'on code chaque activation ou changement de préférence.
C'est une règle permanente, pas un chantier à finir : elle s'applique à chaque
nouvelle fonctionnalité, indéfiniment. Le chantier « Ajouter dans les réglages
tous les paramètres nécessaires » reste ouvert exprès, comme rappel.

Deux exigences distinctes, et il faut les deux :

1. La clé est déclarée dans `CLES_REGLAGES` — sinon elle est perdue à la
   prochaine réinstallation (ci-dessus).
2. Un **contrôle existe dans Paramètres** — sinon la préférence est invisible
   et figée sur la valeur posée au départ.

Le cas qui a fait écrire cette règle : les trois applications par défaut
(musique, itinéraires, canal des messages) étaient bien déclarées et
synchronisées, donc conformes au point 1 — mais fixées une seule fois par une
question orale, sans aucun contrôle. Impossible de savoir ce que Jarvis avait
retenu, impossible d'en changer sans toucher au code. Conforme à la moitié de
la règle, inutilisable en pratique. Réparé par la carte « Tes applications par
défaut » (`src/components/settings/AppsParDefaut.tsx`).

Une préférence qu'un seul chemin permet de poser — une question orale, une
détection automatique, une valeur par défaut — se règle **aussi** depuis
Paramètres. Au minimum : la voir, et pouvoir l'effacer.

## Le thème sombre existait déjà, et rien ne l'allumait

Trouvé le 4 sept. : le bloc `.dark` de `src/index.css` définit une
quarantaine de couleurs depuis le début du projet, et **aucun composant n'a
jamais posé la classe `dark`**. Réparé — `ThemeProvider` (next-themes) dans
`App.tsx`, carte dans Paramètres › Apparence.

Deux points à ne pas défaire : la clé de stockage est **la nôtre**
(`jarvis_theme`, pas celle par défaut de la bibliothèque), sans quoi le choix
n'entrerait pas dans les réglages recopiés en base ; et on passe par
next-themes plutôt qu'un bricolage maison parce que `components/ui/sonner.tsx`
lit déjà son état — sinon un toast clair s'afficherait au-dessus d'un écran
sombre.

## Les notifications : Jarvis ne notifie QUE ce qui vit chez lui

Livré le 4 sept. 2026 (chantier 5d03a192). `@capacitor/local-notifications`,
aucun serveur : les rappels sont des alarmes posées sur le téléphone, donc ils
sonnent même app fermée, et le plugin les repose tout seul après un
redémarrage.

**La règle d'aiguillage, formulée par Raphaël, commande tout le reste** : ce
qui décide, ce n'est pas qui a initié la demande, c'est **où la chose
atterrit**. Une tâche, un chantier → base de Jarvis → Jarvis notifie. Un
rendez-vous d'agenda, un mail → chez Google → **Google notifie, on se tait**,
même quand c'est Jarvis qui les a créés. C'est pour ça qu'il n'y a aucun
interrupteur « agenda » ni « mail » dans Paramètres : leur absence est la
décision, pas un oubli. La raison est écrite en bas de la carte pour qu'on ne
se repose pas la question.

Ce qu'il a accepté (fiche 7d87dcb4, doc `fiche/notifications`) : échéance
d'une tâche, point du matin (09:15 par défaut, **activable et réglable**,
c'est sa consigne écrite), nouvelle version d'APK, chantier livré, session
bloquée. Refusés : message programmé, agenda, mail.

Trois fichiers, et la frontière entre eux compte :

- `src/lib/notifications/plan.ts` — **pur**, aucun appel à Android, à la base
  ni à React. C'est la seule partie vérifiable sans téléphone, et c'est là que
  vivent les décisions qui peuvent être fausses en silence (un rappel dans le
  passé qu'Android ferait sonner en rafale, une tâche faite qui sonne quand
  même, deux tâches sur le même identifiant). Vérifié par
  `scripts/verifier-notifications.ts`.
- `src/lib/notifications/service.ts` — le pont Android : permissions, canaux,
  alarmes. Ne se vérifie que sur l'appareil, d'où le bouton « Tester » de
  Paramètres.
- `src/hooks/useNotifications.ts` — monté **une seule fois, dans
  `JarvisDataProvider`**, jamais dans Paramètres : les rappels doivent être
  reprogrammés dès qu'une tâche change, y compris par la voix ou depuis un
  autre appareil. Monté dans l'écran de réglages, il ne reprogrammerait plus
  rien dès qu'on quitte l'écran.

Les identifiants sont répartis en plages (`PLAGE_ECHEANCE`, `PLAGE_MATIN`, …)
et `estNotreNotif()` garde l'annulation : on n'annule jamais une notification
qui ne vient pas de nous.

**Les heures de silence** (4 sept., initiative) ne suppriment ni ne décalent
rien : le rappel part sur un canal Android muet (`jarvis_nuit`, importance 2)
au lieu du canal sonore. Il est là au réveil, il n'a réveillé personne.
`dansLaPlageSilencieuse()` gère la plage qui passe minuit — une comparaison
naïve `début <= t < fin` serait toujours fausse sur 22:30 → 07:30, et la nuit
sonnerait comme le jour sans que rien ne le signale.

**Limite connue, à ne pas présenter comme livrée** : « chantier livré » et
« session bloquée » ne se déclenchent que pendant que l'app tourne — ils
viennent du temps réel Supabase, pas d'un push. App fermée, rien n'arrive.
Le vrai push (Firebase + Edge Function) est le chantier ouvert
« Notifications quand l'app est fermée ». Les trois autres (échéance, matin,
APK) fonctionnent app fermée.

## Stack

React + Vite + TypeScript + Tailwind + shadcn/ui, Supabase (Auth + Postgres
+ Edge Functions), Capacitor pour l'app Android. Détails de déploiement et
scripts : voir `README.md`.

## CI

- `.github/workflows/deploy.yml` — site web sur GitHub Pages, à chaque push
  sur `claude/new-session-rn6puh`.
- `.github/workflows/android-build.yml` — build de l'APK debug, publié en
  artifact ET sur une GitHub Release à URL fixe (tag `latest-debug`,
  téléchargement direct depuis l'onglet Paramètres de l'app).
- `.github/workflows/verifications.yml` — les contrôles hors ligne (typecheck
  des projets référencés + les scripts `verifier-*.ts` sans réseau + la
  validité des XML Android). **Sur toutes les branches**, pas seulement le
  tronc : c'est le seul retour qu'une session obtient avant de fusionner.

Toujours vérifier que les deux workflows passent au vert après un push
(`mcp__github__actions_list` / `get_job_logs`), et se corriger soi-même en
cas d'échec avant de considérer un chantier terminé.

### Trois pièges vérifiés le 4 sept. 2026, qui coûtent cher

**« Deploy to GitHub Pages » vert ne veut pas dire que le dépôt va bien.**
Le workflow web passait pendant que « Build Android APK » échouait depuis
plusieurs commits — donc plus aucune mise à jour possible sur le téléphone,
sans que personne le voie. Regarde les **deux** workflows.

**Cet environnement n'a pas de SDK Android** (`SDK location not found`) : on
ne peut PAS compiler l'app ici. Pour tout ce qui touche `android/**`, la CI
est la seule preuve — pousse, puis lis le workflow. Ne dis jamais « ça
compile » sans elle.

**`npm run build 2>&1 | tail -2 && git push` pousse même si le build
échoue** : le code de sortie est celui de `tail`. Utilise `${PIPESTATUS[0]}`,
ou pas de pipe avant un `&&`.

Et avant de conclure qu'un fichier écrit par une autre session est cassé :
**`npm install`**. Un `node_modules` antérieur à son commit produit des
« Cannot find module » et des `any` implicites sur du code parfaitement sain.

**Un `--` est interdit N'IMPORTE OÙ dans un commentaire XML**, pas seulement
en bordure. Citer `--primary` ou `--foreground` (les variables CSS de l'app)
dans un commentaire de `android/app/src/main/res/**` casse le build entier,
avec un message qui ne parle pas du commentaire. Écris-les autrement, et
contrôle avant de pousser :

```bash
python3 -c "import xml.dom.minidom,glob;[xml.dom.minidom.parse(f) for f in glob.glob('android/app/src/main/res/**/*.xml',recursive=True)]"
```

## Mettre à jour sans réinstaller : le paquet web (4 sept. 2026)

Livré avec le chantier b5d210f9. Une app Capacitor, c'est une coquille
Android (plugins, permissions, widget) autour d'une interface web. La quasi-
totalité des chantiers ne touche QUE l'interface. Capacitor sait la servir
depuis un dossier du téléphone (`WebView.setServerBasePath`) : la CI publie
donc `web-bundle.zip` à côté de l'APK, l'app le télécharge (1,2 Mo mesuré sur la
release du 4 sept., contre 9,5 Mo d'APK), l'installe et redémarre dessus. Aucune réinstallation, aucune
autorisation « sources inconnues », aucun installateur à confirmer.

**Le « sauf si » de sa demande est décidé sur une mesure, pas sur le poids.**
La CI calcule une EMPREINTE du natif (`android/`, `capacitor.config.ts`,
`patches/`, et la version exacte de chaque plugin Capacitor lue dans le
lockfile) et l'écrit dans la release (`native: <hash>`) ET dans le bundle
(`VITE_NATIVE_EMPREINTE`). Si l'empreinte publiée diffère de celle de l'APK
installée, la mise à jour rapide est refusée et l'app dit qu'il faut
installer l'APK — sans quoi la nouvelle interface appellerait un plugin
absent de la coquille installée.

**Pourquoi on ne peut pas se retrouver avec une app morte** : le chemin n'est
rendu permanent (`persistServerBasePath`) qu'APRÈS que le nouveau paquet a
démarré et exécuté `demarrageMajWeb()` depuis `main.tsx`. Un paquet cassé ne
démarre pas, donc ne confirme jamais : fermer et rouvrir l'app suffit à
retomber sur la version précédente, et Paramètres affiche l'échec. Et
Capacitor efface lui-même le chemin enregistré quand l'APK change
(`Bridge.isNewBinary`, vérifié dans les sources) : installer une APK reprend
toujours la main sur un paquet téléchargé.

L'empreinte de l'APK installée ne se relève QUE pendant que l'interface
embarquée tourne (`getServerBasePath()` vide ou `"public"`) : une fois un
paquet appliqué, `BUILD_NUMBER` et `NATIVE_EMPREINTE` décrivent le paquet, pas
l'APK. Ne déplace pas cette lecture.

Répartition des fichiers, et la frontière compte :
`src/lib/majPaquet.ts` est **pur** (verdict, garde anti-« ../ », encodage
base64 par tranches) et se vérifie sans téléphone
(`scripts/verifier-maj-web.ts`, 19 contrôles) ; `src/lib/majWeb.ts` parle à
Capacitor ; `src/hooks/useMajWeb.ts` est monté dans `JarvisDataProvider`,
avec `useUpdateCheck` — pas dans Paramètres, sinon rien ne se vérifie ni ne
s'applique tant qu'on n'ouvre pas cet onglet.

**Non vérifié sur appareil** (aucun SDK Android ici) : le redémarrage réel de
la WebView sur le dossier téléchargé. La CI prouve que ça compile, pas que ça
tourne.

## Le web se met à jour tout seul, l'app Android jamais

Piège découvert le 3 sept. 2026 : Raphaël pensait suivre les nouveautés en
temps réel, alors que son app installée avait pris un vrai retard (plusieurs
chantiers manquants, dont un indicateur censé justement détecter ce
décalage) — le lien de téléchargement de l'APK était cassé depuis un moment
et chaque tentative de mise à jour échouait silencieusement.

`deploy.yml` republie le site à chaque push : ce que Raphaël voit dans le
navigateur (ou en PWA) est **toujours** à jour, sans rien faire. `android-build.yml`
ne fait que publier un nouvel APK à télécharger — l'app installée sur son
téléphone reste figée sur l'ancienne version tant qu'il ne relance pas
l'installation lui-même. Un chantier « fini et CI verte » sur du code qui
touche `android/`, `capacitor.config.ts` ou du `src/**` utilisé par l'app
native n'est donc fini pour lui **que web**, pas encore en pratique côté
téléphone.

**Depuis le 4 sept., une nuance importante** : un chantier qui ne touche que
`src/**` s'applique par la mise à jour rapide (section précédente), donc SANS
réinstaller — et tout seul au démarrage si le réglage est laissé actif. Reste
vrai pour tout ce qui touche `android/`, `capacitor.config.ts`, `patches/` ou
un plugin Capacitor : l'empreinte du natif change, la mise à jour rapide est
refusée, et il faut vraiment installer l'APK.

**En terminant un chantier qui touche l'app Android**, le dire explicitement
dans la réponse à Raphaël (pas juste « CI verte ») : que ça nécessite une
mise à jour de l'APK pour être visible, et rappeler comment (bouton
« Mettre à jour » dans Paramètres). Le badge « À jour / Nouvelle version
disponible » de Paramètres est fait pour qu'il puisse vérifier lui-même à
tout moment — s'il n'apparaît pas dans l'app qu'il utilise, prendre ça au
sérieux : ça veut dire que ce qu'il a sous les yeux est déjà en retard sur
plusieurs chantiers, pas seulement le dernier.

### Comment on sait quelle version tourne (depuis le 3 sept. 2026)

Raphaël a passé une vingtaine de builds à télécharger et installer sans
que rien ne change, sans aucun moyen de s'en rendre compte. Trois pièces
ont été mises en place pour que ça ne se reproduise pas — ne pas les
défaire :

1. **Chaque APK a une identité.** `versionCode` = numéro de run du
   workflow Android, `versionName` = `AAAA.MM.JJ-b<run>-<sha court>`,
   injectés par la CI (`ANDROID_VERSION_CODE` / `ANDROID_VERSION_NAME`).
   Avant, toutes les builds annonçaient « 1.0 (1) » : Android ne pouvait
   pas distinguer une mise à jour d'une réinstallation.
2. **Paramètres affiche les deux versions** — celle installée et la
   dernière APK publiée. Une installation sans effet se voit donc
   immédiatement, au lieu de se deviner.
3. **La comparaison porte sur l'APK réellement publiée**, pas sur le
   dernier commit de la branche : l'app lit la release `latest-debug`
   via l'API GitHub et y trouve une ligne `commit: <sha>` écrite par le
   workflow. Corollaire : **le workflow Android n'a plus de filtre
   `paths`** — chaque push produit une APK, sinon les deux sources
   divergent à nouveau. Si tu modifies le corps de la release dans
   `android-build.yml`, garde les lignes `version:`, `build:`, `commit:`
   et `date:`, c'est le contrat que lit `src/hooks/useUpdateCheck.ts`.
