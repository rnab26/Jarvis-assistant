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

**AVANT DE RÉÉCRIRE UNE NOTE, RELIS-LA — dans un appel SÉPARÉ, et lis vraiment
le résultat.** `update dev_items set notes = …` écrase tout, et une note vit
souvent depuis plusieurs sessions : elle porte les mots de Raphaël, ce qui a
déjà été écarté, ce qui a été vérifié. Le 5 sept. puis le 6, deux notes ont
été écrasées de cette façon — l'une contenait un retour de Raphaël qui n'était
écrit nulle part ailleurs. Le `select` doit précéder l'`update`, pas
l'accompagner : groupés dans le même appel, on lit le texte APRÈS l'avoir
détruit. La bonne forme est d'ajouter à la note, pas de la remplacer.

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

**Un chantier livré mais pas encore constaté par Raphaël : change le CROCHET
D'EN-TÊTE, pas seulement le corps de la note.** Trouvé le 18 sept. 2026 sur une
vraie capture de son cockpit (chantiers 21cf48d2, efe7e44c, b1b6172d, ed32cbcc,
4dabe586) : plusieurs livrés réels (mergés, CI verte) gardaient encore
`[LIBRE]` en tête de note parce que la règle « n'écrase jamais, ajoute en bas »
avait été suivie à la lettre, sans que personne ne retouche ENSUITE le
crochet du haut. Or `src/lib/marqueurChantier.ts` — la seule chose que l'app
lit pour l'étiquette de la ligne — ignore tout ce qui suit les deux premiers
crochets. Le chantier restait donc affiché « libre » : une prochaine session
le reprenait comme neuf, et Raphaël ne savait jamais qu'il devait l'essayer.
C'était la cause directe de sa plainte répétée « toujours les mêmes
chantiers ». Donc : une fois le travail réellement livré et en attente de son
essai sur le téléphone, remplace le crochet d'ouverture par
`[LIVRÉ — RESTE À CONSTATER SUR SON TÉLÉPHONE]` — À LA MAIN, jamais par une
regex automatique (un crochet peut en contenir un autre, ex. `[LIBRE — ...
(voir [CADRE] ...)]`, et une regex naïve tronque au mauvais endroit — vécu et
réparé à la main ce jour-là). `SUPABASE_SERVICE_ROLE_KEY=... node
scripts/verifier-cockpit-marqueurs.mjs` audite tout le cockpit et liste les
chantiers où le corps dit « livré » mais le crochet dit autre chose — lance-le
avant de dire à Raphaël que le cockpit est propre.

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

## Supprimer demande toujours, partout dans l'app

`src/components/ConfirmerAction.tsx` : la fenêtre qui pose la question avant
une action qu'on ne peut pas défaire. Elle porte aussi le choix qui accompagne
certaines suppressions — « où vont les chantiers de cette section ? » — dans la
même fenêtre que la confirmation, pas dans une étape de plus.

Il n'y en avait **aucune** dans l'app jusqu'au 4 sept. : chantiers, tâches,
contacts, documents, corrections de prononciation, rappels de lieu se
supprimaient au premier appui, sans un mot. Sur un téléphone la corbeille est à
trois millimètres du crayon, et aucune de ces choses n'a d'archive — sauf les
chantiers.

**Toute nouvelle corbeille passe par ce composant.** Le texte dit ce qui va
disparaître, nommément, et propose l'issue moins radicale quand elle existe
(« archive-le plutôt »).

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

## Déployer une Edge Function : `scripts/deployer-fonction.sh`

```bash
scripts/deployer-fonction.sh voice-command
```

Il lit les fichiers sur le disque et les envoie à l'API Supabase. Il embarque
tout seul les fichiers voisins (`memoire.ts`) et le dossier `_shared/` quand
la fonction s'en sert, et il relit puis **conserve le réglage `verify_jwt`
existant** — `google-oauth` doit rester ouvert pour recevoir la redirection de
Google, qui ne porte aucun jeton ; le refermer casserait la connexion du
compte Google. `push-notifier` (chantier 76a6a595) est ouverte pour la même
raison de fond, mais un cas différent : c'est Postgres qui l'appelle via
pg_net, sans jeton utilisateur — décision explicite de Raphaël (dev_log,
6 sept. 2026), protégée par le secret partagé `x-push-secret` (Vault côté
base + secret Edge Function), jamais par la clé service_role. Ce script
préserve les deux réglages en le relisant ; pour poser `verify_jwt=false` sur
une fonction qui ne l'a pas encore, passe par l'outil MCP
`deploy_edge_function` (paramètre `verify_jwt`) — un déploiement qui change ce
réglage est une décision de sécurité, jamais à prendre sans lui. **`git fetch && git merge` AVANT de déployer, toujours.** Le script envoie ce
qui est SUR LE DISQUE, pas ce qui est sur la branche. Le 5 sept., un
déploiement fait pour une raison sans rapport (une phrase de
`_shared/environnement.ts`) a remis en ligne l'`index.ts` d'avant le correctif
qu'une autre session venait de pousser — le rouge est tombé une demi-heure
plus tard sur `verifier-commande-vocale.mjs`, chez celui qui n'y était pour
rien. Plusieurs sessions déploient la MÊME fonction ; l'état du disque n'est à
jour que si on vient de le mettre à jour.

**Il exige `SUPABASE_ACCESS_TOKEN`** (jeton personnel, https://supabase.com/dashboard/account/tokens,
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
utilisateur de test éphémère créé puis supprimé.

**`FILTRE=` garde les cas dont le nom contient un mot ; `TOURS=` les rejoue.**
Le second est né le 27 sept. 2026 d'un cas tombé UNE fois sur une passe de 85,
sans signature de quota — donc une vraie réponse. **Un cas joué une seule fois
ne dit pas s'il est CASSÉ ou s'il VARIE**, et c'est pourtant la première
question à trancher avant de relire son diff pendant une heure. Rejoué six
fois, il s'est avéré échouer **une fois sur deux** (chantier `e945ae83`) :

```bash
ANON_KEY=... FILTRE="reponse coupee" TOURS=6 PAUSE_MS=5000 node scripts/verifier-commande-vocale.mjs
``` La clé publique se récupère
avec `mcp__Supabase__get_publishable_keys` (elle part déjà dans le bundle du
site, ce n'est pas un secret — la clé de service, si).

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

**N'alias jamais une colonne `as t` (ni aucun nom qui reprend l'alias interne
du wrapper).** Trouvé le 17 sept. 2026 en enquêtant sur 3f3ad20b/21cf48d2 :
`exec_sql` enveloppe ta requête dans `select coalesce(jsonb_agg(t), '[]') from
(<ta requête>) as t`. Si ta requête a elle-même une colonne nommée `t`
(`select ... as t`), `jsonb_agg(t)` devient ambigu et Postgres résout `t` vers
CETTE COLONNE plutôt que vers la ligne entière — silencieusement, sans erreur.
Résultat : `"rows"` contient la valeur de cette seule colonne au lieu de
l'objet complet, et les autres colonnes sélectionnées disparaissent sans un
mot. Vérifié : `select 1 as t, 2 as b` rend `"rows": [1]`, pas
`[{"t":1,"b":2}]`. Piège de la même famille que `Filesystem.mkdir` et le
sélecteur Playwright — un résultat qui a l'air correct mais ne l'est pas.
Utilise `horodatage`, `t_`, ou n'importe quel nom qui n'est pas `t`.

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
- `.github/workflows/verifications-navigateur.yml` — les cinq parcours dans un
  vrai Chromium, à la taille d'un téléphone (cockpit, corbeille d'une tâche,
  réglages, « Vos conversations », moteur d'écoute). **Sur toutes les
  branches.** Séparé des contrôles hors ligne parce qu'il installe un
  navigateur : 91 s contre 25. C'est cette famille-là qui attrape ce qui casse
  à L'ÉCRAN — une carte qui ne se déplie pas, une corbeille qui supprime sans
  demander, un tableau qui déborde en largeur, une panne de chargement qui se
  lit comme une absence.
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

## Historique et règles détaillées : `docs/historique/` (16 oct. 2026)

Ce fichier est chargé par CHAQUE session : il ne garde que les règles. Les récits datés (causes mesurées, numéros de migration et de chantier, limites, pièges payés) ont été **déplacés tels quels** dans `docs/historique/` (rien n'est supprimé). **Lis le fichier du sujet avant de toucher à ce sujet**, pas avant. Ajouter ici : une règle en une ou deux lignes ; ajouter dans `docs/historique/` : le récit du chantier.

Règles à retenir par sujet (le détail et les preuves sont dans le fichier cité) :

- **Cockpit, sections, registre des erreurs** (`cockpit-registre-erreurs.md`) : le rattachement reste `dev_items.theme` ; sections et thèmes alignés par les fonctions SQL (`renommer_section`, `fusionner_sections`, `supprimer_section`), jamais par deux écritures côté app. Un thème sans section se signale, ne se corrige pas seul. Erreurs : tout passe par `signalerErreur` / `jarvis_erreurs`, qui ne doit jamais faire échouer ce qu'elle observe. Le cockpit a un budget de hauteur mesuré : si tu ajoutes une carte, prends sa place ailleurs. Un chantier garde ce qu'on y a écrit (historique + suppression tracés, migrations 0027/0036) ; une note se relit avant d'être réécrite ; une trace de suppression sur table liée à `auth.users` commence par le garde-fou « le compte existe encore ». `extraitAuMot` est l'unique fonction d'extrait.
- **Tâches, notes, dictée** (`taches-notes-dictee.md`) : titre = ce qu'il y a à faire (`titreTache.ts`, jamais de verbe d'action dans `AMORCES`) ; une phrase à deux demandes est rendue au serveur (`secondeDemande.ts`) ; redire une dictée coupée COMPLÈTE la tâche (`repriseDictee.ts`) ; une catégorie supposée se valide, une date manquante s'annonce ; section et titre d'un chantier créé à la voix se PROPOSENT ; tâche cochée -> archive de sa catégorie (rien ne se perd) ; notes à la voix : « note ça », « note un rappel », « note de frais » n'en sont pas.
- **Téléphone, applications, contrôle d'écran** (`telephone-actions-ecran.md`, `assistant-bulle-micro.md`) : contacts lus à la demande dans le répertoire, jamais recopiés ; un homonyme se demande ; entrées système (messagerie) et mots d'appareil jamais composés ; WhatsApp / Business ne se devinent pas ; les applications proposées viennent du téléphone ; chercher passe par les IA déjà installées (aucune API payante) ; clic sur l'écran d'une autre app = module pur `ecranTelephone.ts` qui ne clique sur RIEN en cas de doute + liste noire + relecture avant clic. Bulle flottante : service de premier plan, `FLAG_NOT_FOCUSABLE`, état lu du système, PAS d'interrupteur pour l'appui long (rôle Android non requérable). Fenêtres d'assistance : `FLAG_NOT_TOUCHABLE` / `NOT_TOUCH_MODAL`, une seule fenêtre monte un micro, `selectableAsDefault="false"` sur le moteur-croupion, moteur de reconnaissance Google (`com.google.android.as`) à préférer. Tout ce qui touche `android/` exige une vraie APK (la mise à jour rapide ne porte pas le natif) et n'est jamais « vérifié » sans l'appareil : le dire.
- **Moteur Gemini, mode Live, honnêteté** (`moteur-live-honnetete.md`) : le moteur se change par secrets (`FOURNISSEUR`, `GEMINI_MODELE*`, `GEMINI_SECOURS*`) ; rien ne bascule seul vers un moteur payant ; un nom de modèle se vérifie par un vrai appel `generateContent` (pas `ListModels`) ; lire le `quotaId` d'un 429. Live : la configuration vit DANS le jeton (`live-jeton`), jamais de `systemInstruction` côté app ; une fermeture subie est rouverte (`repriseLive.ts`, bornée) ; ne coupe pas la réflexion du modèle Live. Jarvis n'annonce jamais au passé ce qu'il n'a pas constaté (`_shared/honnetete.ts`) ; une coupure réseau n'est pas une réponse du serveur et n'est jamais rejouée toute seule.
- **Mémoire, contexte, réglages à la voix, notifications** (`memoire-voix-contexte.md`) : deux mesures pour dire « même fait » (proximité ET recouvrement lexical, ne pas resserrer sans refaire la mesure) ; rien n'est jamais supprimé par la mémoire (`perime_at`) ; une panne de lecture se signale (`signalerPanne`) ; toute commande exécutée laisse sa trace (`tracerSiLocale`) ; les corrections de Raphaël remontent au modèle (`comprehension` / `action` seulement) ; une règle partagée app/serveur a deux copies tenues alignées par un contrôle ; chaque réglage vocal a son lecteur qui l'applique tout de suite (`ThemeEnDirect`) ; les notifications : Jarvis ne notifie que ce qui vit chez lui (pas l'agenda, pas le mail) ; heures de silence = ce que Jarvis INITIE, jamais ce que Raphaël a demandé ; le widget de tâches défile via `RemoteViews` (collection) et le tri vit dans `widgetTaches.ts` seulement.
- **Sessions autonomes et questions** (`sessions-fiches-autonomes.md`) : la décision d'une passe est dans `src/lib/passeAutonome.ts` (pure), le marqueur `[LIBRE]` ne se lit qu'en TypeScript (`marqueurDe`) ; sujets jamais pris sans lui : contrôle du téléphone, accès aux applications, envoi de messages en son nom, clonage vocal, dépense. Une Routine qui touche au dépôt se rattache à une session persistante. **Une question à Raphaël : `scripts/demander.sh --question … --pourquoi … [--chantier id] --option "libellé|aide|recommande"` (`--action` pour un geste de sa part), plus jamais un artefact** ; relire notes, journal et bloc de démarrage avant de poser ; un artefact n'est qu'un lieu de passage, ses réponses se recopient en base ; fiches déjà publiées listées dans le fichier d'historique.
- **Vérifications, Gmail, fichiers** (`verifications-gmail.md`) : la liste complète des contrôles `scripts/verifier-*` est dans ce fichier ; à lancer systématiquement avant de pousser : `npx tsc -b` (le typecheck de la CI ; `tsc --noEmit` à la racine ne vérifie PAS l'app), `npx tsc -p supabase/functions/tsconfig.json` si on touche `supabase/functions/`, `node --experimental-strip-types scripts/verifier-reglages.ts`, et le `verifier-*.ts` du sujet touché ; après un déploiement de `voice-command` : `ANON_KEY=… node scripts/verifier-commande-vocale.mjs` (un rouge avec signature de quota n'est pas un bug). Un contrôle doit viser la VRAIE donnée / l'APPEL et être essayé à l'envers avant d'être cru. Gmail : `preparer` et `envoyer` restent séparés, `confirme: true` n'est JAMAIS posé par défaut ; `document_lien` garde ses garde-fous SSRF ; un nom de fichier passe par `nomDocument.ts` (clé Storage ≠ nom).
- **Mises à jour Android** (`android-mises-a-jour.md`) : le web se republie à chaque push, l'APK jamais ; la mise à jour rapide (paquet web) ne couvre que `src/**`, refusée si l'empreinte du natif change ; en terminant un chantier qui touche `android/`, `capacitor.config.ts`, `patches/` ou un plugin, DIRE qu'il faut une nouvelle APK ; ne jamais proposer une mise à jour quand il n'y en a pas (`boutonMaj.ts`) ; le téléchargement APK a deux chemins de repli, aucun ne doit rester muet ; la CI Android n'a pas de filtre `paths` et le corps de la release garde `version:`, `build:`, `commit:`, `date:` ; pas de `--` dans un commentaire XML.
