# CLAUDE.md — Jarvis (ce repo)

Complète le CLAUDE.md global de Raphaël (ne le remplace pas). Spécifique au
projet Jarvis (assistant vocal personnel, PWA + app Android via Capacitor).

## Cockpit de développement (chantiers)

Ce projet a un **cockpit interne** dans l'app elle-même (`/cockpit`), soutenu
par une vraie table Supabase — pas juste des notes dans une conversation.
Raphaël y ajoute des chantiers par la voix ou depuis l'interface.

- **Projet Supabase** : `bexiyvmdbxcwxasgslxp` (org `rnab26's Org`).
- **Table** : `dev_items` (`id`, `title`, `notes`, `status`
  todo/in_progress/done, `priority` low/normal/high, `archived_at`).

**Avant de commencer à travailler sur ce repo**, va lire les chantiers en
cours pour ne pas repartir de zéro ou dupliquer un travail déjà fait :

```sql
select id, title, status, priority, notes
from dev_items
where archived_at is null
order by priority desc, created_at;
```

(via `mcp__Supabase__execute_sql`, `project_id: bexiyvmdbxcwxasgslxp`)

**En terminant un chantier**, marque-le fait et archive-le, avec une note
qui référence le commit — c'est la pratique établie qui sert d'historique
(visible directement dans l'app, section "Archivées" du cockpit) :

```sql
update dev_items
set status = 'done', archived_at = now(), notes = 'Fait : <résumé court>. Commit <hash>.'
where id = '<id>';
```

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

```sql
select claim_dev_item('<id du chantier>', '<nom de ta branche>', 120);
```

`false` = une autre session est déjà dessus, prends-en un autre. La réservation
expire après le délai en minutes, pour qu'une session interrompue ne bloque
rien ; renouvelle l'appel si tu dépasses. Quand tu t'arrêtes ou que tu
termines : `select release_dev_item('<id>', '<ta branche>');`

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

```sql
insert into dev_log (user_id, item_id, author, kind, body)
values ('<user_id>', '<id chantier ou null>', '<ta branche>',
        'question', 'Tu es toujours sur X ? Je voudrais toucher à Y.');
```

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

Deux fiches existent déjà et servent de modèle : « Jarvis, pièce par pièce »
(catalogue oui/non) et « Ce qu'il me manque » (décisions à options).

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

**Regrouper quand même le maximum d'opérations dans un seul appel** : c'est
plus lisible, plus atomique et moins bavard, même sans pop-up à la clé.

- Plusieurs `update`/`insert`/`select` liés → un seul appel, statements
  séparés par `;` (le `select` de vérification à la fin du même appel).
- Une structure complète (table + index + policies RLS + trigger) → un seul
  appel, dans un `begin; ... commit;` pour que tout passe ou rien.
- Ne pas faire un appel par ligne à mettre à jour : utiliser `where id in
  (...)`, un `update ... from (values ...)`, ou des `case when`.

Ne séparer en plusieurs appels que si c'est vraiment nécessaire : quand le
contenu d'une requête dépend du résultat de la précédente, ou pour isoler une
opération destructrice — qui, elle, se soumet d'abord à Raphaël.

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
