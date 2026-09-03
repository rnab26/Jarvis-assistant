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
  todo/in_progress/done, `priority` low/normal/high, `archived_at`).

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

Les deux premières servent aussi de modèle : catalogue oui/non, et décisions à
options. Si tu publies une nouvelle fiche, **ajoute son URL à cette liste** dans
le même commit — sinon elle sera perdue pour les sessions suivantes.

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
