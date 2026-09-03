# CLAUDE.md — Jarvis (ce repo)

Complète le CLAUDE.md global de Raphaël (ne le remplace pas). Spécifique au
projet Jarvis (assistant vocal personnel, PWA + app Android via Capacitor).

Sa méthode de travail générale — celle qui vaut pour tous ses projets, pas
seulement celui-ci — est consignée dans `docs/methode-de-travail.md`. Lis-la
si tu débarques : elle explique pourquoi le cockpit et le journal existent, et
ce qu'il attend d'une session qui reprend un travail commencé ailleurs.

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

Si le chantier touche à un sujet sensible ou irréversible (accès aux
applications du téléphone, contrôle du téléphone, envoi de messages,
clonage vocal via un service tiers payant), ne pas l'implémenter sans en
discuter d'abord avec Raphaël — même s'il est dans le cockpit en statut
"todo" (conforme à la règle de son CLAUDE.md global sur les actions à fort
enjeu).

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
qu'il ait à les recopier. Sépare bien les **décisions** (il choisit) des
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

- **Ce qui ferait grandir Jarvis** — les deux chantiers non codables du thème
  « L'app elle-même » : quatre décisions de capacité (cache du contexte,
  recherche web, lecture de liens/PDF, mémoire des conversations) et trois
  densités d'affichage des tâches qu'il choisit au pouce.
  https://claude.ai/code/artifact/067c81c1-88de-4ca9-8947-8df34eb9f89e
  Ses réponses : document `fiche/capacite-et-visuel` (`action: "read_db"`,
  `db_op: "get"`). **Ne code rien de ces deux chantiers avant de les avoir
  lues** — c'est un [À CADRER] pour le visuel, et un arbitrage de coût pour la
  recherche web.

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

## Les huit vérifications du dépôt

Une seule méthode canonique par sujet, à relancer plutôt qu'à réinventer :

```bash
ANON_KEY=... node scripts/verifier-commande-vocale.mjs   # la Edge Function déployée
ANON_KEY=... node scripts/verifier-donnees.mjs           # temps réel + réglages, RLS comprise
node --experimental-strip-types scripts/verifier-dialogue.ts   # tours de parole, sans réseau
node --experimental-strip-types scripts/verifier-mot-cle.ts    # réveil « Jarvis », sans réseau
node --experimental-strip-types scripts/verifier-commande-locale.ts  # commandes comprises sans modèle
node scripts/verifier-ecoute-web.mjs                     # moteur d'écoute, vrai navigateur
node --experimental-strip-types scripts/verifier-envoi-chantier.ts  # « Envoyer à Claude Code », sans réseau
ANON_KEY=... node scripts/verifier-connexion-google.mjs  # le branchement Google, avant de le proposer
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
policies RLS + trigger), dans un `begin; ... commit;` pour que tout passe ou
rien. Fais juste la vérification dans un appel séparé.

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
stockée en local, ajoute sa clé à `CLES_REGLAGES` dans `src/lib/reglages.ts`
et écris-la avec `ecrireReglage()`** — sinon elle ne remontera jamais en base
et sera perdue à la prochaine réinstallation, en silence. C'est le seul
endroit à tenir à jour.

Règle de résolution : à la connexion, la base gagne ; ensuite toute
modification locale y est poussée dans la seconde.

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

Toujours vérifier que les deux workflows passent au vert après un push
(`mcp__github__actions_list` / `get_job_logs`), et se corriger soi-même en
cas d'échec avant de considérer un chantier terminé.

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
